import {
  fetchBdjobsJobDetails,
  fetchBdjobsPage,
  mergeBdjobsJobDetails,
} from "./bdjobs.js";
import { config } from "./config.js";
import { jobsCollection, recordSyncCompleted } from "./db.js";
import { loadResume, scoreJob } from "./matcher.js";
import type {
  BdjobsJob,
  BdjobsJobDetails,
  JobDocument,
  JobSource,
  SyncOptions,
  SyncProgressCallback,
  SyncReport,
} from "./types.js";

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
  const jobs = jobsCollection();
  const existing = await jobs.findOne({ Jobid: job.Jobid }, { projection: { Jobid: 1 } });

  if (existing) {
    onDetails?.("already_saved");
    await jobs.updateOne(
      { Jobid: job.Jobid },
      {
        $set: {
          isRecent: false,
          synced_at: new Date(),
        },
      }
    );
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

  await jobs.insertOne(doc);
  report.newly_added += 1;
  return "new";
}

async function executeSync(
  options: SyncOptions,
  onProgress?: SyncProgressCallback
): Promise<SyncReport> {
  const target = options.postedWithin !== undefined
    ? 0
    : Math.max(1, Math.floor(options.amount ?? 50));

  const report: SyncReport = {
    fetched: 0,
    newly_added: 0,
    skipped: 0,
    pages: 0,
  };
  let progressTotal = target;
  let totalRecordsFound: number | null = null;
  const processedJobIds = new Set<string>();

  onProgress?.({
    type: "sync_started",
    total: target,
    ...(options.postedWithin !== undefined
      ? { postedWithin: options.postedWithin }
      : {}),
  });

  const resume = await loadResume();

  const pageCap = options.postedWithin !== undefined
    ? config.maxPages
    : Math.min(config.maxPages, Math.max(1, Math.ceil(target / config.rpp) + 2));

  for (let page = 1; page <= pageCap; page += 1) {
    if (options.postedWithin === undefined && report.fetched >= target) break;

    const {
      premium,
      normal,
      totalPages,
      totalRecordsFound: pageTotalRecordsFound,
    } = await fetchBdjobsPage(page, options.postedWithin);
    report.pages += 1;
    if (pageTotalRecordsFound !== null && totalRecordsFound === null) {
      totalRecordsFound = pageTotalRecordsFound;
    }
    if (
      options.postedWithin !== undefined &&
      page === 1 &&
      totalRecordsFound !== null
    ) {
      progressTotal = totalRecordsFound + premium.length;
    }

    if (options.postedWithin !== undefined) {
      onProgress?.({
        type: "sync_progress",
        current: report.fetched,
        total: progressTotal,
        ...(totalRecordsFound !== null ? { total_records_found: totalRecordsFound } : {}),
        newly_added: report.newly_added,
        skipped: report.skipped,
        pages: report.pages,
      });
    }

    if (premium.length === 0 && normal.length === 0) break;
    if (totalPages !== null && page > totalPages) break;

    let newOnPage = 0;

    const streams: Array<{ list: BdjobsJob[]; source: JobSource }> = [
      { list: premium, source: "premium" },
      { list: normal, source: "normal" },
    ];

    for (const { list, source } of streams) {
      for (const job of list) {
        if (processedJobIds.has(job.Jobid)) continue;
        processedJobIds.add(job.Jobid);
        if (options.postedWithin === undefined && report.fetched >= target) break;

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
        const result = await processJob(
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
        if (result === "new") newOnPage += 1;

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
      if (options.postedWithin === undefined && report.fetched >= target) break;
    }

    if (options.postedWithin === undefined && newOnPage === 0) {
      break;
    }
  }

  await recordSyncCompleted(new Date());
  onProgress?.({
    type: "sync_done",
    fetched: report.fetched,
    total:
      options.postedWithin !== undefined ? progressTotal : report.fetched,
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
