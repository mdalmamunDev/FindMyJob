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

export interface PastedJobListResult {
  count: number;
  page: number;
  pageSize: number;
  pageCount: number;
  jobs: TPastedJob[];
}

export async function createPastedJob(
  pastedText: string
): Promise<TPastedJob> {
  const job = await PastedJob.create({ pastedText, status: "queued" });
  return job.toObject();
}

export async function updatePastedJobStatus(
  id: string,
  update: { status: "queued" | "processing" | "completed" | "failed"; stage: string; error: string }
): Promise<void> {
  await PastedJob.updateOne({ _id: id }, { $set: update }).exec();
}

export async function listPastedJobs(
  input: Record<string, unknown>
): Promise<PastedJobListResult> {
  const requestedPage = Math.max(1, Math.floor(Number(input.page) || 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Math.floor(Number(input.page_size) || 50))
  );
  const filter: FilterQuery<TPastedJob> = {};
  const count = await PastedJob.countDocuments(filter).exec();
  const pageCount = Math.ceil(count / pageSize);
  const page = Math.min(requestedPage, Math.max(pageCount, 1));
  const jobs = await PastedJob.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();
  return { count, page, pageSize, pageCount, jobs };
}

export async function getPastedJobStatus(
  id: string
): Promise<Pick<TPastedJob, "_id" | "status" | "stage" | "error"> | null> {
  return PastedJob.findById(id)
    .select({ status: 1, stage: 1, error: 1 })
    .lean()
    .exec();
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
  const setStage = async (stage: string) => {
    await PastedJob.updateOne(
      { _id: id },
      { $set: { status: "processing", stage, error: "" } }
    ).exec();
  };

  await setStage("extracting details");
  const extracted = await extractPastedJob(pastedText);
  if (!extracted.title) throw new Error("Could not identify a job title");
  const applicationEmail = verifiedApplicationEmail(
    pastedText,
    extracted.applicationEmail
  );
  extracted.applicationEmail = applicationEmail;
  await PastedJob.updateOne(
    { _id: id },
    {
      $set: {
        extracted,
        emailDraft: { to: applicationEmail, subject: "", content: "" },
      },
    }
  ).exec();

  await setStage("scoring against your resume");
  const resume = await loadResume();
  const score = await scoreJob(
    toScoringJob(extracted, id, pastedText),
    resume,
    toScoringDetails(extracted)
  );
  await PastedJob.updateOne(
    { _id: id },
    { $set: { match_percent: score.match_percent, match_reason: score.reason } }
  ).exec();

  await setStage("writing application email");
  const emailDraft: PastedJobEmailDraft = await generatePastedJobEmail(
    extracted,
    applicationEmail,
    pastedText,
    resume
  );
  await PastedJob.updateOne(
    { _id: id },
    {
      $set: {
        status: "completed",
        stage: "completed",
        emailDraft,
        error: "",
      },
    }
  ).exec();
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
    .exec();
}
