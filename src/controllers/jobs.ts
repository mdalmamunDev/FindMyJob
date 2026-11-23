import type { RequestHandler } from "express";
import type { Filter } from "mongodb";
import { jobsCollection } from "../db.js";
import type { JobDocument } from "../types.js";

const sortFields = [
  "match_percent",
  "synced_at",
  "publishDate",
  "first_seen_at",
] as const;
type SortField = (typeof sortFields)[number];

function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
}

function buildFilter(input: Record<string, unknown>): Filter<JobDocument> {
  const filter: Filter<JobDocument> = {};

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

  if (input.cat_id !== undefined && input.cat_id !== "") {
    const cat = Number(input.cat_id);
    if (Number.isFinite(cat)) {
      filter.Cat_id = cat;
    }
  }

  if (typeof input.location === "string" && input.location.trim()) {
    filter.location = { $regex: input.location.trim(), $options: "i" };
  }

  if (typeof input.job_type === "string" && input.job_type.trim()) {
    filter.JobType = { $regex: input.job_type.trim(), $options: "i" };
  }

  if (
    typeof input.source === "string" &&
    (input.source === "premium" || input.source === "normal")
  ) {
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

export const listJobs: RequestHandler = async (req, res) => {
  try {
    const input = req.query as Record<string, unknown>;
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
    const collection = jobsCollection();
    const count = await collection.countDocuments(filter);
    const pageCount = Math.ceil(count / pageSize);
    const page = Math.min(requestedPage, Math.max(pageCount, 1));
    const jobs = await collection
      .find(filter)
      .sort({ [sortField]: sortDirection, Jobid: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    res.json({ count, page, pageSize, pageCount, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[jobs list]", message);
    res.status(500).json({ error: message });
  }
};

export const bulkRemoveJobs: RequestHandler = async (req, res) => {
  try {
    const filters =
      req.body?.filters && typeof req.body.filters === "object"
        ? (req.body.filters as Record<string, unknown>)
        : {};
    const result = await jobsCollection().updateMany(
      buildFilter(filters),
      { $set: { isRemoved: true } }
    );
    res.json({ matchedCount: result.matchedCount, removedCount: result.modifiedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[jobs bulk remove]", message);
    res.status(500).json({ error: message });
  }
};

export const getJobById: RequestHandler = async (req, res) => {
  try {
    const job = await jobsCollection().findOne({ Jobid: req.params.id });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
};

export const updateJob: RequestHandler = async (req, res) => {
  try {
    const updates: Partial<
      Pick<JobDocument, "isApplied" | "isRemoved" | "isSortListed">
    > = {};
    for (const field of ["isApplied", "isRemoved", "isSortListed"] as const) {
      if (req.body?.[field] !== undefined) {
        if (typeof req.body[field] !== "boolean") {
          res.status(400).json({ error: `${field} must be a boolean` });
          return;
        }
        updates[field] = req.body[field];
      }
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        error: "isApplied, isRemoved, or isSortListed boolean required",
      });
      return;
    }

    const result = await jobsCollection().findOneAndUpdate(
      { Jobid: req.params.id },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
};
