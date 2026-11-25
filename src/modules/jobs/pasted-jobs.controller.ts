import type { RequestHandler } from "express";
import catchAsync from "../../shared/catchAsync.js";
import {
  enqueuePastedJob,
  enqueuePastedJobRetry,
} from "./pasted-jobs.queue.js";
import * as PastedJobsService from "./pasted-jobs.service.js";
import {
  PastedJobListQueryError,
  PastedJobRetryError,
} from "./pasted-jobs.service.js";
import { broadcast } from "../../shared/websocket.js";
import type { TPastedJob } from "./pasted-jobs.interface.js";

export const createPastedJob: RequestHandler = catchAsync(async (req, res) => {
  const pastedText = req.body?.text;
  const sourceUrl = req.body?.sourceUrl;
  if (typeof pastedText !== "string" || pastedText.trim().length < 20) {
    res.status(400).json({ error: "Paste at least 20 characters of job details" });
    return;
  }
  if (pastedText.length > 30_000) {
    res.status(413).json({ error: "Pasted job text must be 30,000 characters or less" });
    return;
  }
  if (sourceUrl !== undefined && typeof sourceUrl !== "string") {
    res.status(400).json({ error: "sourceUrl must be a URL string" });
    return;
  }
  if (typeof sourceUrl === "string" && sourceUrl.trim()) {
    try {
      const parsed = new URL(sourceUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Unsupported protocol");
      }
    } catch {
      res.status(400).json({ error: "sourceUrl must be a valid HTTP or HTTPS URL" });
      return;
    }
  }

  const job = await PastedJobsService.createPastedJob(
    pastedText.trim(),
    typeof sourceUrl === "string" ? sourceUrl.trim() : undefined
  );
  broadcast({
    type: "pasted_job_updated",
    id: job._id.toString(),
    status: "queued",
    stage: "queued",
  });
  try {
    const queueJobId = await enqueuePastedJob(job._id.toString());
    res.status(202).json({
      id: job._id,
      queueJobId,
      status: job.status,
      message: "Job queued for extraction, scoring, and email drafting",
    });
  } catch (error) {
    await PastedJobsService.updatePastedJobStatus(job._id.toString(), {
      status: "failed",
      stage: "queue unavailable",
      error: "Could not add job to Redis queue",
    });
    console.error(
      "[pasted jobs] Unable to enqueue task:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(503).json({
      error: "Could not queue pasted job. Confirm Redis is available and try again.",
    });
  }
});

export const updatePastedJob: RequestHandler = catchAsync(async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Invalid pasted job ID" });
    return;
  }
  const updates: Partial<
    Pick<TPastedJob, "isApplied" | "isRemoved" | "isSortListed">
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
  if (!Object.keys(updates).length) {
    res.status(400).json({
      error: "isApplied, isRemoved, or isSortListed boolean required",
    });
    return;
  }
  const job = await PastedJobsService.updatePastedJob(id, updates);
  if (!job) {
    res.status(404).json({ error: "Pasted job not found" });
    return;
  }
  res.json(job);
});

export const retryPastedJob: RequestHandler = catchAsync(async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Invalid pasted job ID" });
    return;
  }

  let job: TPastedJob;
  try {
    job = await PastedJobsService.queueFailedPastedJobRetry(id);
  } catch (error) {
    if (error instanceof PastedJobRetryError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const queueJobId = await enqueuePastedJobRetry(id);
    res.status(202).json({
      id: job._id,
      queueJobId,
      status: job.status,
      message: "Unfinished pasted-job processing has been queued",
    });
  } catch (error) {
    await PastedJobsService.updatePastedJobStatus(id, {
      status: "failed",
      stage: "queue unavailable",
      error: "Could not add job to Redis queue",
    });
    console.error(
      "[pasted jobs] Unable to enqueue retry:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(503).json({
      error: "Could not resume pasted job. Confirm Redis is available and try again.",
    });
  }
});

export const listPastedJobs: RequestHandler = catchAsync(async (req, res) => {
  try {
    res.json(
      await PastedJobsService.listPastedJobs(
        req.query as Record<string, unknown>
      )
    );
  } catch (error) {
    if (error instanceof PastedJobListQueryError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

export const updatePastedJobEmail: RequestHandler = catchAsync(
  async (req, res) => {
    const { to, subject, content } = req.body ?? {};
    if (
      typeof to !== "string" ||
      typeof subject !== "string" ||
      typeof content !== "string" ||
      !subject.trim() ||
      !content.trim()
    ) {
      res.status(400).json({
        error: "Email recipient, subject, and content must be strings; subject and content cannot be empty",
      });
      return;
    }

    const id = req.params.id;
    if (typeof id !== "string") {
      res.status(400).json({ error: "Invalid pasted job ID" });
      return;
    }
    const job = await PastedJobsService.updatePastedJobEmail(id, {
      to: to.trim(),
      subject: subject.trim(),
      content: content.trim(),
    });
    if (!job) {
      res.status(404).json({ error: "Pasted job not found" });
      return;
    }
    res.json(job);
  }
);
