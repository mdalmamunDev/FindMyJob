import type { FilterQuery } from "mongoose";
import Job from "./jobs.model.js";
import type { TJob } from "./jobs.interface.js";

const sortFields = [
  "match_percent",
  "synced_at",
  "publishDate",
  "first_seen_at",
] as const;
type SortField = (typeof sortFields)[number];

export interface JobListResult {
  count: number;
  page: number;
  pageSize: number;
  pageCount: number;
  jobs: TJob[];
}

function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
}

function buildFilter(input: Record<string, unknown>): FilterQuery<TJob> {
  const filter: FilterQuery<TJob> = {};

  if (input.is_removed !== "all") {
    filter.isRemoved =
      parseBool(input.is_removed) === true ? true : { $ne: true };
  }

  const minMatch =
    input.min_match !== undefined && input.min_match !== ""
      ? Number(input.min_match)
      : undefined;
  const maxMatch =
    input.max_match !== undefined && input.max_match !== ""
      ? Number(input.max_match)
      : undefined;
  if (
    (minMatch !== undefined && Number.isFinite(minMatch)) ||
    (maxMatch !== undefined && Number.isFinite(maxMatch))
  ) {
    filter.match_percent = {};
    if (minMatch !== undefined && Number.isFinite(minMatch)) {
      filter.match_percent.$gte = minMatch;
    }
    if (maxMatch !== undefined && Number.isFinite(maxMatch)) {
      filter.match_percent.$lte = maxMatch;
    }
  }

  const postedWithinDays =
    input.posted_within !== undefined && input.posted_within !== ""
      ? Number(input.posted_within)
      : undefined;
  if (
    postedWithinDays !== undefined &&
    Number.isInteger(postedWithinDays) &&
    postedWithinDays > 0
  ) {
    const cutoff = new Date(Date.now() - postedWithinDays * 24 * 60 * 60 * 1000);
    filter.publishDate = { $gte: cutoff.toISOString() };
  }

  if (input.cat_id !== undefined && input.cat_id !== "") {
    const categoryId = Number(input.cat_id);
    if (Number.isFinite(categoryId)) filter.Cat_id = categoryId;
  }

  if (typeof input.location === "string" && input.location.trim()) {
    filter.location = { $regex: input.location.trim(), $options: "i" };
  }
  if (typeof input.job_type === "string" && input.job_type.trim()) {
    filter.JobType = { $regex: input.job_type.trim(), $options: "i" };
  }
  if (input.source === "premium" || input.source === "normal") {
    filter.source = input.source;
  }

  const recent = parseBool(input.is_recent);
  if (recent !== undefined) filter.isRecent = recent;
  const applied = parseBool(input.is_applied);
  if (applied !== undefined) filter.isApplied = applied;
  const sortListed = parseBool(input.is_sort_listed);
  if (sortListed !== undefined) filter.isSortListed = sortListed;

  if (typeof input.q === "string" && input.q.trim()) {
    const term = input.q.trim();
    filter.$or = [
      { jobTitle: { $regex: term, $options: "i" } },
      { companyName: { $regex: term, $options: "i" } },
    ];
  }

  return filter;
}

function getString(
  input: Record<string, unknown>,
  key: string
): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

export async function listJobs(
  input: Record<string, unknown>
): Promise<JobListResult> {
  const filter = buildFilter(input);
  const requestedPage = Math.max(1, Math.floor(Number(input.page) || 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Math.floor(Number(input.page_size) || 20))
  );
  const sortInput = getString(input, "sort");
  const sortField: SortField = sortFields.includes(sortInput as SortField)
    ? (sortInput as SortField)
    : "match_percent";
  const sortDirection = getString(input, "sort_direction") === "asc" ? 1 : -1;
  const count = await Job.countDocuments(filter).exec();
  const pageCount = Math.ceil(count / pageSize);
  const page = Math.min(requestedPage, Math.max(pageCount, 1));
  const jobs = await Job.find(filter)
    .sort({ [sortField]: sortDirection, Jobid: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();
  return { count, page, pageSize, pageCount, jobs };
}

export async function bulkRemoveJobs(
  input: Record<string, unknown>
): Promise<{ matchedCount: number; removedCount: number }> {
  const result = await Job.updateMany(buildFilter(input), {
    $set: { isRemoved: true },
  }).exec();
  return {
    matchedCount: result.matchedCount,
    removedCount: result.modifiedCount,
  };
}

export async function getJobById(jobId: string): Promise<TJob | null> {
  return Job.findOne({ Jobid: jobId }).lean().exec();
}

export async function updateJob(
  jobId: string,
  updates: Partial<
    Pick<TJob, "isApplied" | "isRemoved" | "isSortListed">
  >
): Promise<TJob | null> {
  return Job.findOneAndUpdate(
    { Jobid: jobId },
    { $set: updates },
    { new: true, runValidators: true }
  )
    .lean()
    .exec();
}
