import { Router } from "express";
import type { Filter } from "mongodb";
import { jobsCollection } from "../db.js";
import type { JobDocument } from "../types.js";

export const jobsRouter = Router();

function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
}

jobsRouter.get("/", async (req, res) => {
  try {
    const {
      min_match,
      cat_id,
      q,
      location,
      job_type,
      source,
      is_recent,
      is_applied,
    } = req.query;

    const filter: Filter<JobDocument> = {};

    if (min_match !== undefined && min_match !== "") {
      const min = Number(min_match);
      if (Number.isFinite(min)) {
        filter.match_percent = { $gte: min };
      }
    }

    if (cat_id !== undefined && cat_id !== "") {
      const cat = Number(cat_id);
      if (Number.isFinite(cat)) {
        filter.Cat_id = cat;
      }
    }

    if (typeof location === "string" && location.trim()) {
      filter.location = { $regex: location.trim(), $options: "i" };
    }

    if (typeof job_type === "string" && job_type.trim()) {
      filter.JobType = { $regex: job_type.trim(), $options: "i" };
    }

    if (typeof source === "string" && (source === "premium" || source === "normal")) {
      filter.source = source;
    }

    const recent = parseBool(is_recent);
    if (recent !== undefined) filter.isRecent = recent;

    const applied = parseBool(is_applied);
    if (applied !== undefined) filter.isApplied = applied;

    if (typeof q === "string" && q.trim()) {
      const term = q.trim();
      filter.$or = [
        { jobTitle: { $regex: term, $options: "i" } },
        { companyName: { $regex: term, $options: "i" } },
      ];
    }

    const jobs = await jobsCollection()
      .find(filter)
      .sort({ match_percent: -1, publishDate: -1 })
      .limit(500)
      .toArray();

    res.json({ count: jobs.length, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[jobs list]", message);
    res.status(500).json({ error: message });
  }
});

jobsRouter.get("/:id", async (req, res) => {
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
});

jobsRouter.patch("/:id", async (req, res) => {
  try {
    if (typeof req.body?.isApplied !== "boolean") {
      res.status(400).json({ error: "isApplied boolean required" });
      return;
    }

    const result = await jobsCollection().findOneAndUpdate(
      { Jobid: req.params.id },
      { $set: { isApplied: req.body.isApplied, synced_at: new Date() } },
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
});
