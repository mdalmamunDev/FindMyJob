import { Schema, model } from "mongoose";
import type { JobDocument } from "./jobs.interface.js";

const jobSchema = new Schema<JobDocument>(
  {
    Jobid: { type: String, required: true, unique: true },
    match_percent: { type: Number, index: true },
    Cat_id: { type: Number, index: true },
    source: { type: String, index: true },
    isRecent: { type: Boolean, index: true },
    isApplied: { type: Boolean, index: true },
    isRemoved: { type: Boolean, index: true },
    location: { type: String, index: true },
    JobType: { type: String, index: true },
    synced_at: { type: Date, index: true },
    publishDate: { type: String, index: true },
    isSortListed: { type: Boolean, default: false },
  },
  {
    collection: "jobs",
    strict: false,
    minimize: false,
    versionKey: false,
  }
);

const Job = model<JobDocument>("Job", jobSchema);

export default Job;
