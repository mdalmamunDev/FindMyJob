import type { RequestHandler } from "express";
import catchAsync from "../../shared/catchAsync.js";
import * as JobsService from "./jobs.service.js";
import type { JobDocument } from "./jobs.interface.js";

export const listJobs: RequestHandler = catchAsync(async (req, res) => {
  const result = await JobsService.listJobs(
    req.query as Record<string, unknown>
  );
  res.json(result);
});

export const bulkRemoveJobs: RequestHandler = catchAsync(async (req, res) => {
  const filters =
    req.body?.filters && typeof req.body.filters === "object"
      ? (req.body.filters as Record<string, unknown>)
      : {};
  res.json(await JobsService.bulkRemoveJobs(filters));
});

export const getJobById: RequestHandler = catchAsync(async (req, res) => {
  const jobId = req.params.id;
  if (typeof jobId !== "string") {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const job = await JobsService.getJobById(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

export const updateJob: RequestHandler = catchAsync(async (req, res) => {
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

  const jobId = req.params.id;
  if (typeof jobId !== "string") {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const job = await JobsService.updateJob(jobId, updates);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});
