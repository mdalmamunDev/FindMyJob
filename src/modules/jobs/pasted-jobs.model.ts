import { model, Schema } from "mongoose";
import type { PastedJobModel, TPastedJob } from "./pasted-jobs.interface.js";

const pastedJobSchema = new Schema<TPastedJob, PastedJobModel>(
  {
    pastedText: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true,
    },
    stage: String,
    error: String,
    extracted: {
      title: String,
      company: String,
      location: String,
      publishDate: String,
      deadline: String,
      jobType: String,
      workplace: String,
      experience: String,
      education: String,
      salary: String,
      description: String,
      requirements: String,
      skills: String,
      applicationEmail: String,
      applicationInstructions: String,
      website: String,
    },
    match_percent: { type: Number, min: 0, max: 100 },
    match_reason: String,
    emailDraft: {
      to: String,
      subject: String,
      content: String,
    },
    isApplied: { type: Boolean, default: false, index: true },
  },
  {
    collection: "pasted_jobs",
    timestamps: true,
    minimize: false,
    versionKey: false,
  }
);

const PastedJob = model<TPastedJob, PastedJobModel>(
  "PastedJob",
  pastedJobSchema
);

export default PastedJob;
