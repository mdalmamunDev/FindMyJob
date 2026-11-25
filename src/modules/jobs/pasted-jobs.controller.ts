import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import catchAsync from "../../shared/catchAsync.js";
import { enqueuePastedJob } from "./pasted-jobs.queue.js";
import * as PastedJobsService from "./pasted-jobs.service.js";

export const createPastedJob: RequestHandler = catchAsync(async (req, res) => {
  const pastedText = req.body?.text;
  if (typeof pastedText !== "string" || pastedText.trim().length < 20) {
    res.status(400).json({ error: "Paste at least 20 characters of job details" });
    return;
  }
  if (pastedText.length > 30_000) {
    res.status(413).json({ error: "Pasted job text must be 30,000 characters or less" });
    return;
  }

  const job = await PastedJobsService.createPastedJob(pastedText.trim());
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

export const listPastedJobs: RequestHandler = catchAsync(async (req, res) => {
  res.json(
    await PastedJobsService.listPastedJobs(
      req.query as Record<string, unknown>
    )
  );
});

export const getPastedJobStatus: RequestHandler = catchAsync(
  async (req, res) => {
    const id = req.params.id;
    if (typeof id !== "string") {
      res.status(400).json({ error: "Invalid pasted job ID" });
      return;
    }
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: "Invalid pasted job ID" });
      return;
    }
    const job = await PastedJobsService.getPastedJobStatus(id);
    if (!job) {
      res.status(404).json({ error: "Pasted job not found" });
      return;
    }
    res.json(job);
  }
);

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
    if (!isValidObjectId(id)) {
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
