import {
  fetchBdjobsJobDetails,
  fetchBdjobsPage,
  mergeBdjobsJobDetails,
} from "../jobs/bdjobs.service.js";
import { config } from "../../config/index.js";
import Job from "../jobs/jobs.model.js";
import { loadResume, scoreJob } from "../jobs/matcher.service.js";
import type {
  BdjobsJob,
  BdjobsJobDetails,
  JobDocument,
  JobSource,
} from "../jobs/jobs.interface.js";
import type {
  SyncOptions,
  SyncProgressCallback,
  SyncReport,
} from "./sync.interface.js";
import SyncStateModel from "./sync.model.js";

export async function getLastSyncAt(): Promise<Date | null> {
  const state = await SyncStateModel.findById("bdjobs_sync")
    .select("lastSyncAt")
    .lean()
    .exec();
  return state?.lastSyncAt ?? null;
}

async function recordSyncCompleted(at: Date): Promise<void> {
  await SyncStateModel.updateOne(
    { _id: "bdjobs_sync" },
    { $set: { lastSyncAt: at } },
    { upsert: true }
  ).exec();
}

let syncRunning = false;

export function isSyncRunning(): boolean {
  return syncRunning;
}

async function processJob(
  job: BdjobsJob,
  source: JobSource,
  resume: string,
  report: SyncReport,
  onDetails?: (
    phase: "loading_details" | "scoring" | "scored" | "already_saved",
    details?: BdjobsJobDetails,
    error?: string,
    match?: { match_percent: number; reason: string }
  ) => void
): Promise<"new" | "skipped"> {
  const existing = await Job.findOne({ Jobid: job.Jobid })
    .select("Jobid")
    .lean()
    .exec();

  if (existing) {
    onDetails?.("already_saved");
    await Job.updateOne(
      { Jobid: job.Jobid },
      {
        $set: {
          isRecent: false,
          synced_at: new Date(),
        },
      }
    ).exec();
    report.skipped += 1;
    return "skipped";
  }

  onDetails?.("loading_details");
  let rawDetails: BdjobsJobDetails | undefined;
  let detailsError: string | undefined;
  try {
    rawDetails = await fetchBdjobsJobDetails(job.Jobid);
  } catch (err) {
    detailsError = err instanceof Error ? err.message : String(err);
    console.error(`[sync details ${job.Jobid}]`, detailsError);
  }

  const scoredJob = rawDetails ? mergeBdjobsJobDetails(job, rawDetails) : job;
  onDetails?.("scoring", rawDetails, detailsError);
  const match = await scoreJob(scoredJob, resume, rawDetails);
  onDetails?.("scored", rawDetails, detailsError, match);
  const now = new Date();

  const doc: JobDocument = {
    ...scoredJob,
    source,
    isApplied: false,
    isRemoved: false,
    isSortListed: false,
    isRecent: true,
    match_percent: match.match_percent,
    match_reason: match.reason,
    synced_at: now,
    first_seen_at: now,
    raw: job,
    ...(rawDetails
      ? {
          details: {
            ...rawDetails,
            jobTitle: scoredJob.jobTitle,
            companyName: scoredJob.companyName,
            location: scoredJob.location,
            jobDescription: scoredJob.jobDescription,
            eduRec: scoredJob.eduRec,
            JobType: scoredJob.JobType,
            WorkPlace: scoredJob.WorkPlace,
            Salary: scoredJob.Salary,
          },
          rawDetails,
        }
      : {}),
  };

  await Job.create(doc);
  report.newly_added += 1;
  return "new";
}

async function executeSync(
  options: SyncOptions,
  onProgress?: SyncProgressCallback
): Promise<SyncReport> {
  const report: SyncReport = {
    fetched: 0,
    newly_added: 0,
    skipped: 0,
    pages: 0,
  };
  let progressTotal = 0;
  let totalRecordsFound: number | null = null;
  let premiumRecordsFound = 0;
  const processedJobIds = new Set<string>();

  onProgress?.({
    type: "sync_started",
    total: 0,
    ...(options.categoryId !== undefined ? { categoryId: options.categoryId } : {}),
    ...(options.postedWithin !== undefined ? { postedWithin: options.postedWithin } : {}),
  });

  const resume = await loadResume();

  const pageCap = config.maxPages;

  for (let page = 1; page <= pageCap; page += 1) {
    const {
      premium,
      normal,
      totalPages,
      totalRecordsFound: pageTotalRecordsFound,
    } = await fetchBdjobsPage(page, options.categoryId, options.postedWithin);
    report.pages += 1;
    if (pageTotalRecordsFound !== null && totalRecordsFound === null) {
      totalRecordsFound = pageTotalRecordsFound;
    }
    if (page === 1) {
      premiumRecordsFound = premium.length;
    }
    if (totalRecordsFound !== null && progressTotal === 0) {
      progressTotal = totalRecordsFound + premiumRecordsFound;
    }

    if (premium.length === 0 && normal.length === 0) break;
    if (totalPages !== null && page > totalPages) break;

    const streams: Array<{ list: BdjobsJob[]; source: JobSource }> = [
      { list: premium, source: "premium" },
      { list: normal, source: "normal" },
    ];

    for (const { list, source } of streams) {
      for (const job of list) {
        if (processedJobIds.has(job.Jobid)) continue;
        processedJobIds.add(job.Jobid);
        report.fetched += 1;
        const jobTitle = job.jobTitle || job.JobTitleBng || "Untitled";
        const progressJob = {
          type: "sync_job" as const,
          jobTitle,
          companyName: job.companyName,
          location: job.location,
          publishDate: job.publishDate,
          source,
          phase: "checking" as const,
        };
        onProgress?.(progressJob);
        await processJob(
          job,
          source,
          resume,
          report,
          (phase, details, detailsError, match) => {
            const scoredJob = details
              ? mergeBdjobsJobDetails(job, details)
              : job;
            if (!details) {
              onProgress?.({
                ...progressJob,
                phase,
                detailsAvailable: false,
                detailsError,
                jobDescription: job.jobContext || job.jobDescription || "",
                educationRequirements: job.eduRec || "",
                experience: job.experience || "",
                jobType: job.JobType || "",
                workplace: job.WorkPlace || "",
                salary: job.Salary || "",
                deadline: job.deadline || "",
                ...(match
                  ? {
                      matchPercent: match.match_percent,
                      matchReason: match.reason,
                    }
                  : {}),
              });
              return;
            }
            onProgress?.({
              ...progressJob,
              jobTitle: scoredJob.jobTitle || jobTitle,
              companyName: scoredJob.companyName,
              location: scoredJob.location,
              phase: "scoring",
              detailsAvailable: true,
              detailsError,
              jobDescription: details.JobDescription,
              educationRequirements: details.EducationRequirements,
              skillsRequired: details.SkillsRequired,
              suggestedSkills: details.SuggestedSkills,
              additionalRequirements: details.AdditionJobRequirements,
              experience: scoredJob.experience || "",
              jobType: scoredJob.JobType || "",
              workplace: scoredJob.WorkPlace || "",
              salary: scoredJob.Salary || "",
              deadline: scoredJob.deadline || "",
              ...(match
                ? {
                    matchPercent: match.match_percent,
                    matchReason: match.reason,
                  }
                : {}),
            });
          }
        );
        onProgress?.({
          type: "sync_progress",
          current: report.fetched,
          total: progressTotal,
          ...(totalRecordsFound !== null ? { total_records_found: totalRecordsFound } : {}),
          newly_added: report.newly_added,
          skipped: report.skipped,
          pages: report.pages,
          jobTitle: job.jobTitle,
        });
      }
    }

    if (totalPages !== null && page >= totalPages) break;
  }

  await recordSyncCompleted(new Date());
  onProgress?.({
    type: "sync_done",
    fetched: report.fetched,
    total: progressTotal,
    ...(totalRecordsFound !== null
      ? { total_records_found: totalRecordsFound }
      : {}),
    newly_added: report.newly_added,
    skipped: report.skipped,
    pages: report.pages,
  });

  return report;
}

/** Claim the sync lock and run in background. Returns false if already running. */
export function startSyncBackground(
  options: SyncOptions,
  onProgress?: SyncProgressCallback
): boolean {
  if (syncRunning) return false;
  syncRunning = true;

  void executeSync(options, onProgress)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.({ type: "sync_error", error: message });
      console.error("[sync]", message);
    })
    .finally(() => {
      syncRunning = false;
    });

  return true;
}
