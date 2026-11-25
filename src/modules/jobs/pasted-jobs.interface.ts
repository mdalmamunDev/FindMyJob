import type { Model, Types } from "mongoose";

export interface ExtractedPastedJob {
  title: string;
  company: string;
  location: string;
  publishDate: string;
  deadline: string;
  jobType: string;
  workplace: string;
  experience: string;
  education: string;
  salary: string;
  description: string;
  requirements: string;
  skills: string;
  applicationEmail: string;
  applicationInstructions: string;
  website: string;
}

export interface PastedJobEmailDraft {
  to: string;
  subject: string;
  content: string;
}

export type PastedJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface TPastedJob {
  _id: Types.ObjectId;
  pastedText: string;
  sourceUrl?: string;
  status: PastedJobStatus;
  stage?: string;
  error?: string;
  extracted?: ExtractedPastedJob;
  match_percent?: number;
  match_reason?: string;
  emailDraft?: PastedJobEmailDraft;
  createdAt: Date;
  updatedAt: Date;
  isApplied: boolean;
  isRemoved: boolean;
  isSortListed: boolean;
}

export type PastedJobModel = Model<TPastedJob>;
