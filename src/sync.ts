import { fetchBdjobsPage } from "./bdjobs.js";
import { config } from "./config.js";
import { jobsCollection } from "./db.js";
import { loadResume, scoreJob } from "./matcher.js";
import type { BdjobsJob, JobDocument, JobSource, SyncReport } from "./types.js";

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

export async function runSync(amount: number): Promise<SyncReport> {
  const target = Math.max(1, Math.floor(amount));
  const resume = await loadResume();

  const report: SyncReport = {
    fetched: 0,
    newly_added: 0,
    skipped: 0,
    pages: 0,
  };

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
      }
      if (report.fetched >= target) break;
    }

    // Caught up: whole page already known
    if (newOnPage === 0) break;
  }

  return report;
}
