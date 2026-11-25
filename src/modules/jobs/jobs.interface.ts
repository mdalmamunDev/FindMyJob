import type { Model, Types } from "mongoose";

export type JobSource = "premium" | "normal";

/** Raw BDJobs job object from the listing API. */
export interface BdjobsJob {
  Jobid: string;
  AdType?: string;
  jobTitle?: string;
  companyName?: string;
  JobTitleBng?: string;
  deadline?: string;
  deadlineDB?: string;
  publishDate?: string;
  eduRec?: string;
  experience?: string;
  standout?: number;
  logo?: string;
  lantype?: number;
  location?: string;
  JobLang?: string;
  jobContext?: string | null;
  isEarlyAccess?: boolean;
  OnlineJob?: boolean;
  logoUrl?: string;
  jobDescription?: string;
  JobType?: string;
  Vacancies?: number;
  Salary?: string;
  WorkPlace?: string;
  Cat_id?: number;
  [key: string]: unknown;
}

export interface BdjobsJobDetails {
  JobId?: string;
  JobTitle?: string;
  CompnayName?: string;
  CompanyNameENG?: string;
  PostedOn?: string;
  Deadline?: string;
  DeadlineDB?: string;
  JobVacancies?: string | number;
  JobDescription?: string;
  JobNature?: string;
  JobWorkPlace?: string;
  EducationRequirements?: string;
  SkillsRequired?: string;
  SuggestedSkills?: string;
  Age?: string;
  experience?: string;
  Gender?: string;
  AdditionJobRequirements?: string;
  JobLocation?: string;
  CompanyBusiness?: string;
  CompanyAddress?: string;
  CompanyHideAddress?: string;
  CompanyWeb?: string;
  JobOtherBenifits?: string;
  RecruitmentProcessingInformation?: string;
  JobSalaryRange?: string;
  JobSalaryRangeText?: string;
  JobSalaryMinSalary?: string;
  JobSalaryMaxSalary?: string;
  ApplyInstruction?: string;
  ApplyEmail?: string;
  HardCopy?: string;
  WalkInInterview?: string;
  ApplyURL?: string;
  CompanyID?: string;
  AssessmentRequired?: string;
  JobKeyPoints?: string;
  [key: string]: unknown;
}

export type TJob = BdjobsJob & {
  _id: Types.ObjectId;
  source: JobSource;
  isApplied: boolean;
  isRemoved: boolean;
  isSortListed: boolean;
  isRecent: boolean;
  match_percent: number;
  match_reason: string;
  synced_at: Date;
  first_seen_at: Date;
  raw: BdjobsJob;
  details?: BdjobsJobDetails;
  rawDetails?: BdjobsJobDetails;
};

export type JobModel = Model<TJob>;

export interface MatchResult {
  match_percent: number;
  reason: string;
}
