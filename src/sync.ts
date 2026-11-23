import { fetchBdjobsPage } from "./bdjobs.js";
import { config } from "./config.js";
import { jobsCollection } from "./db.js";
import { loadResume, scoreJob } from "./matcher.js";
import type {
  BdjobsJob,
  JobDocument,
  JobSource,
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
  report: SyncReport
): Promise<"new" | "skipped"> {
  const jobs = jobsCollection();
  const existing = await jobs.findOne({ Jobid: job.Jobid }, { projection: { Jobid: 1 } });

  if (existing) {
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

  const match = await scoreJob(job, resume);
  const now = new Date();

  const doc: JobDocument = {
    ...job,
    source,
    isApplied: false,
    isRecent: true,
    match_percent: match.match_percent,
    match_reason: match.reason,
    synced_at: now,
    first_seen_at: now,
    raw: job,
  };

  await jobs.insertOne(doc);
  report.newly_added += 1;
  return "new";
}

async function executeSync(
  amount: number,
  onProgress?: SyncProgressCallback
): Promise<SyncReport> {
  const target = Math.max(1, Math.floor(amount));

  const report: SyncReport = {
    fetched: 0,
    newly_added: 0,
    skipped: 0,
    pages: 0,
  };

  onProgress?.({ type: "sync_started", total: target });

  const resume = await loadResume();

  const pageCap = Math.min(
    config.maxPages,
    Math.max(1, Math.ceil(target / config.rpp) + 2)
  );

  for (let page = 1; page <= pageCap; page += 1) {
    if (report.fetched >= target) break;

    const { premium, normal, totalPages } = await fetchBdjobsPage(page);
    report.pages += 1;

    if (premium.length === 0 && normal.length === 0) break;
    if (totalPages !== null && page > totalPages) break;

    let newOnPage = 0;

    const streams: Array<{ list: BdjobsJob[]; source: JobSource }> = [
      { list: premium, source: "premium" },
      { list: normal, source: "normal" },
    ];

    for (const { list, source } of streams) {
      for (const job of list) {
        if (report.fetched >= target) break;

        report.fetched += 1;
        const result = await processJob(job, source, resume, report);
        if (result === "new") newOnPage += 1;

        onProgress?.({
          type: "sync_progress",
          current: report.fetched,
          total: target,
          newly_added: report.newly_added,
          skipped: report.skipped,
          pages: report.pages,
          jobTitle: job.jobTitle,
        });
      }
      if (report.fetched >= target) break;
    }

    if (newOnPage === 0) break;
  }

  onProgress?.({
    type: "sync_done",
    fetched: report.fetched,
    newly_added: report.newly_added,
    skipped: report.skipped,
    pages: report.pages,
  });

  return report;
}

/** Claim the sync lock and run in background. Returns false if already running. */
export function startSyncBackground(
  amount: number,
  onProgress?: SyncProgressCallback
): boolean {
  if (syncRunning) return false;
  syncRunning = true;

  void executeSync(amount, onProgress)
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
