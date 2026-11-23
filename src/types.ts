export type JobSource = "premium" | "normal";

/** Raw BDJobs job object from api-response-demo.json */
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

export interface JobDocument extends BdjobsJob {
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
}

export interface SyncReport {
  fetched: number;
  newly_added: number;
  skipped: number;
  pages: number;
}

export interface SyncOptions {
  amount?: number;
  postedWithin?: number;
}

export type SyncProgressEvent =
  | {
      type: "sync_started";
      total: number;
      postedWithin?: number;
    }
  | {
      type: "sync_progress";
      current: number;
      total: number;
      total_records_found?: number;
      newly_added: number;
      skipped: number;
      pages: number;
      jobTitle?: string;
    }
  | {
      type: "sync_job";
      jobTitle: string;
      companyName?: string;
      location?: string;
      publishDate?: string;
      phase:
        | "checking"
        | "loading_details"
        | "scoring"
        | "scored"
        | "already_saved";
      source?: JobSource;
      detailsAvailable?: boolean;
      detailsError?: string;
      jobDescription?: string;
      educationRequirements?: string;
      skillsRequired?: string;
      suggestedSkills?: string;
      additionalRequirements?: string;
      experience?: string;
      jobType?: string;
      workplace?: string;
      salary?: string;
      deadline?: string;
      matchPercent?: number;
      matchReason?: string;
    }
  | {
      type: "sync_done";
      fetched: number;
      total: number;
      total_records_found?: number;
      newly_added: number;
      skipped: number;
      pages: number;
    }
  | {
      type: "sync_error";
      error: string;
    };

export type SyncProgressCallback = (event: SyncProgressEvent) => void;

export interface MatchResult {
  match_percent: number;
  reason: string;
}
