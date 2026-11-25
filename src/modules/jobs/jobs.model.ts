import { model, Schema } from "mongoose";
import type { JobModel, TJob } from "./jobs.interface.js";

const jobSchema = new Schema<TJob, JobModel>(
  {
    Jobid: { type: String, required: true, unique: true },
    AdType: String,
    jobTitle: String,
    companyName: String,
    JobTitleBng: String,
    deadline: String,
    deadlineDB: String,
    publishDate: { type: String, index: true },
    eduRec: String,
    experience: String,
    standout: Number,
    logo: String,
    lantype: Number,
    location: { type: String, index: true },
    JobLang: String,
    jobContext: Schema.Types.Mixed,
    isEarlyAccess: Boolean,
    OnlineJob: Boolean,
    logoUrl: String,
    jobDescription: String,
    JobType: { type: String, index: true },
    Vacancies: Number,
    Salary: String,
    WorkPlace: String,
    Cat_id: { type: Number, index: true },
    source: { type: String, enum: ["premium", "normal"], required: true, index: true },
    isApplied: { type: Boolean, default: false, index: true },
    isRemoved: { type: Boolean, default: false, index: true },
    isSortListed: { type: Boolean, default: false, index: true },
    isRecent: { type: Boolean, default: false, index: true },
    match_percent: { type: Number, min: 0, max: 100, required: true, index: true },
    match_reason: { type: String, required: true },
    synced_at: { type: Date, required: true, index: true },
    first_seen_at: { type: Date, required: true, index: true },
    raw: { type: Schema.Types.Mixed, required: true },
    details: Schema.Types.Mixed,
    rawDetails: Schema.Types.Mixed,
  },
  {
    collection: "jobs",
    strict: false,
    minimize: false,
    versionKey: false,
  }
);

const Job = model<TJob, JobModel>("Job", jobSchema);

export default Job;
