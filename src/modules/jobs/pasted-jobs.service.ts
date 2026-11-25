import type { FilterQuery } from "mongoose";
import { loadResume } from "./matcher.service.js";
import {
  extractPastedJob,
  generatePastedJobEmail,
  scoreJob,
} from "./matcher.service.js";
import PastedJob from "./pasted-jobs.model.js";
import type {
  BdjobsJob,
  BdjobsJobDetails,
} from "./jobs.interface.js";
import type {
  ExtractedPastedJob,
  PastedJobEmailDraft,
  TPastedJob,
} from "./pasted-jobs.interface.js";
import { broadcast } from "../../shared/websocket.js";

export interface PastedJobListResult {
  count: number;
  page: number;
  pageSize: number;
  pageCount: number;
  jobs: TPastedJob[];
}

export class PastedJobListQueryError extends Error {}

export class PastedJobRetryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

function queryValue(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw new PastedJobListQueryError(`${key} must be a single string value`);
  }
  return value.trim();
}

function parseBooleanFilter(
  input: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = queryValue(input, key);
  if (!value || value === "all") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new PastedJobListQueryError(`${key} must be true, false, or all`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createPastedJob(
  pastedText: string,
  sourceUrl?: string
): Promise<TPastedJob> {
  const job = await PastedJob.create({
    pastedText,
    ...(sourceUrl ? { sourceUrl } : {}),
    status: "queued",
  });
  return job.toObject();
}

export async function updatePastedJobStatus(
  id: string,
  update: { status: "queued" | "processing" | "completed" | "failed"; stage: string; error: string }
): Promise<void> {
  await PastedJob.updateOne({ _id: id }, { $set: update }).exec();
  broadcast({
    type: "pasted_job_updated",
    id,
    ...update,
  });
}

export async function queueFailedPastedJobRetry(
  id: string
): Promise<TPastedJob> {
  const job = await PastedJob.findOneAndUpdate(
    {
      _id: id,
      status: "failed",
      $or: [
        { "emailDraft.subject": { $exists: false } },
        { "emailDraft.subject": "" },
        { "emailDraft.content": { $exists: false } },
        { "emailDraft.content": "" },
      ],
    },
    {
      $set: { status: "queued", stage: "resuming unfinished steps", error: "" },
    },
    { new: true }
  )
    .lean()
    .exec();
  if (job) {
    broadcast({
      type: "pasted_job_updated",
      id,
      status: "queued",
      stage: "resuming unfinished steps",
      error: "",
    });
    return job;
  }

  const existing = await PastedJob.findById(id).select({ status: 1 }).lean().exec();
  if (!existing) throw new PastedJobRetryError("Pasted job not found", 404);
  throw new PastedJobRetryError(
    existing.status !== "failed"
      ? "Only failed pasted jobs can be resumed"
      : "This pasted job already has an email draft",
    409
  );
}

export async function listPastedJobs(
  input: Record<string, unknown>
): Promise<PastedJobListResult> {
  const pageValue = queryValue(input, "page");
  const pageSizeValue = queryValue(input, "page_size");
  const requestedPage = pageValue ? Number(pageValue) : 1;
  const requestedPageSize = pageSizeValue ? Number(pageSizeValue) : 50;
  if (!Number.isInteger(requestedPage) || requestedPage < 1) {
    throw new PastedJobListQueryError("page must be a positive whole number");
  }
  if (!Number.isInteger(requestedPageSize) || requestedPageSize < 1) {
    throw new PastedJobListQueryError("page_size must be a positive whole number");
  }
  const pageSize = Math.min(100, requestedPageSize);
  const filter: FilterQuery<TPastedJob> = {};
  const minMatch = queryValue(input, "min_match");
  const maxMatch = queryValue(input, "max_match");
  if (minMatch || maxMatch) {
    const min = minMatch ? Number(minMatch) : 0;
    const max = maxMatch ? Number(maxMatch) : 100;
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min < 0 ||
      max > 100 ||
      min > max
    ) {
      throw new PastedJobListQueryError(
        "match range must be between 0 and 100, with minimum no greater than maximum"
      );
    }
    filter.match_percent = { $gte: min, $lte: max };
  }

  const addedWithin = queryValue(input, "added_within");
  if (addedWithin) {
    const days = Number(addedWithin);
    if (!Number.isInteger(days) || days < 1) {
      throw new PastedJobListQueryError("added_within must be a positive whole number");
    }
    filter.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  const search = queryValue(input, "q");
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { "extracted.title": regex },
      { "extracted.company": regex },
      { pastedText: regex },
    ];
  }
  const location = queryValue(input, "location");
  if (location) {
    filter["extracted.location"] = new RegExp(escapeRegex(location), "i");
  }
  const jobType = queryValue(input, "job_type");
  if (jobType) {
    filter["extracted.jobType"] = new RegExp(escapeRegex(jobType), "i");
  }

  const status = queryValue(input, "status");
  if (status) {
    if (!["queued", "processing", "completed", "failed"].includes(status)) {
      throw new PastedJobListQueryError("status is not a valid pasted-job status");
    }
    filter.status = status as TPastedJob["status"];
  }

  const isApplied = parseBooleanFilter(input, "is_applied");
  if (isApplied !== undefined) filter.isApplied = isApplied;
  const isSortListed = parseBooleanFilter(input, "is_sort_listed");
  if (isSortListed !== undefined) filter.isSortListed = isSortListed;
  const isRemoved = parseBooleanFilter(input, "is_removed");
  if (isRemoved !== undefined) filter.isRemoved = isRemoved;

  const sort = queryValue(input, "sort") || "createdAt";
  const sortFields: Record<string, string> = {
    match_percent: "match_percent",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    publishDate: "extracted.publishDate",
  };
  if (!sortFields[sort]) {
    throw new PastedJobListQueryError("sort is not a supported pasted-job field");
  }
  const sortDirection = queryValue(input, "sort_direction") || "desc";
  if (sortDirection !== "asc" && sortDirection !== "desc") {
    throw new PastedJobListQueryError("sort_direction must be asc or desc");
  }

  const count = await PastedJob.countDocuments(filter).exec();
  const pageCount = Math.ceil(count / pageSize);
  const page = Math.min(requestedPage, Math.max(pageCount, 1));
  const jobs = await PastedJob.find(filter)
    .sort({
      [sortFields[sort]]: sortDirection === "asc" ? 1 : -1,
      createdAt: -1,
    })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();
  return { count, page, pageSize, pageCount, jobs };
}

function toScoringJob(
  extracted: ExtractedPastedJob,
  pastedJobId: string,
  pastedText: string
): BdjobsJob {
  return {
    Jobid: `pasted-${pastedJobId}`,
    jobTitle: extracted.title,
    companyName: extracted.company,
    location: extracted.location,
    publishDate: extracted.publishDate,
    deadline: extracted.deadline,
    JobType: extracted.jobType,
    WorkPlace: extracted.workplace,
    experience: extracted.experience,
    eduRec: extracted.education,
    Salary: extracted.salary,
    jobDescription: extracted.description || pastedText,
    jobContext: extracted.requirements || pastedText,
  };
}

function toScoringDetails(extracted: ExtractedPastedJob): BdjobsJobDetails {
  return {
    JobTitle: extracted.title,
    CompanyNameENG: extracted.company,
    PostedOn: extracted.publishDate,
    Deadline: extracted.deadline,
    JobNature: extracted.jobType,
    JobWorkPlace: extracted.workplace,
    experience: extracted.experience,
    EducationRequirements: extracted.education,
    JobSalaryRangeText: extracted.salary,
    JobDescription: extracted.description,
    AdditionJobRequirements: extracted.requirements,
    SkillsRequired: extracted.skills,
    ApplyEmail: extracted.applicationEmail,
    ApplyInstruction: extracted.applicationInstructions,
    CompanyWeb: extracted.website,
  };
}

function verifiedApplicationEmail(
  sourceText: string,
  extractedEmail: string
): string {
  const candidate = extractedEmail.trim().toLowerCase();
  if (!candidate) return "";
  const sourceEmails = sourceText.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  ) ?? [];
  return sourceEmails.some((email) => email.toLowerCase() === candidate)
    ? candidate
    : "";
}

export async function processPastedJob(id: string): Promise<void> {
  const record = await PastedJob.findById(id).exec();
  if (!record) throw new Error(`Pasted job ${id} was not found`);
  const pastedText = record.pastedText;
  const hasEmailDraft = Boolean(
    record.emailDraft?.subject?.trim() && record.emailDraft?.content?.trim()
  );
  const setStage = async (stage: string) => {
    await PastedJob.updateOne(
      { _id: id },
      { $set: { status: "processing", stage, error: "" } }
    ).exec();
    broadcast({
      type: "pasted_job_updated",
      id,
      status: "processing",
      stage,
      error: "",
    });
  };

  let extracted = record.extracted;
  if (!extracted?.title) {
    await setStage("extracting details");
    extracted = await extractPastedJob(pastedText);
    if (!extracted.title) throw new Error("Could not identify a job title");
  }
  const applicationEmail = verifiedApplicationEmail(
    pastedText,
    extracted.applicationEmail
  );
  extracted.applicationEmail = applicationEmail;
  if (!record.extracted?.title) {
    await PastedJob.updateOne(
      { _id: id },
      {
        $set: {
          extracted,
          emailDraft: { to: applicationEmail, subject: "", content: "" },
        },
      }
    ).exec();
    broadcast({
      type: "pasted_job_updated",
      id,
      status: "processing",
      extracted,
      emailDraft: { to: applicationEmail, subject: "", content: "" },
    });
  }

  const resume = await loadResume();
  const matchNeedsRetry =
    record.match_percent === undefined ||
    record.match_reason?.startsWith("Match failed:") === true;
  if (matchNeedsRetry) {
    await setStage("scoring against your resume");
    const score = await scoreJob(
      toScoringJob(extracted, id, pastedText),
      resume,
      toScoringDetails(extracted)
    );
    await PastedJob.updateOne(
      { _id: id },
      { $set: { match_percent: score.match_percent, match_reason: score.reason } }
    ).exec();
    broadcast({
      type: "pasted_job_updated",
      id,
      status: "processing",
      match_percent: score.match_percent,
      match_reason: score.reason,
    });
  }

  let emailDraft = record.emailDraft;
  if (!hasEmailDraft) {
    await setStage("writing application email");
    emailDraft = await generatePastedJobEmail(
      extracted,
      applicationEmail,
      pastedText,
      resume
    );
  }
  await PastedJob.updateOne(
    { _id: id },
    {
      $set: {
        status: "completed",
        stage: "completed",
        ...(emailDraft ? { emailDraft } : {}),
        error: "",
      },
    }
  ).exec();
  broadcast({
    type: "pasted_job_updated",
    id,
    status: "completed",
    stage: "completed",
    error: "",
  });
}

export async function updatePastedJobEmail(
  id: string,
  draft: PastedJobEmailDraft
): Promise<TPastedJob | null> {
  return PastedJob.findOneAndUpdate(
    { _id: id },
    { $set: { emailDraft: draft } },
    { new: true, runValidators: true }
  )
    .lean()
    .exec()
    .then((job) => {
      if (job) {
        broadcast({
          type: "pasted_job_updated",
          id,
          emailDraftUpdated: true,
        });
      }
      return job;
    });
}

export async function updatePastedJob(
  id: string,
  updates: Partial<
    Pick<TPastedJob, "isApplied" | "isRemoved" | "isSortListed">
  >
): Promise<TPastedJob | null> {
  const job = await PastedJob.findOneAndUpdate(
    { _id: id },
    { $set: updates },
    { new: true, runValidators: true }
  )
    .lean()
    .exec();
  if (job) {
    broadcast({
      type: "pasted_job_updated",
      id,
      ...updates,
    });
  }
  return job;
}
