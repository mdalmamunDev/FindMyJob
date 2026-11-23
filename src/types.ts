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
}

export interface SyncReport {
  fetched: number;
  newly_added: number;
  skipped: number;
  pages: number;
}

export interface SyncOptions {
  amount?: number;
  publishedAfter?: string;
}

export type SyncProgressEvent =
  | {
      type: "sync_started";
      total: number;
      publishedAfter?: string;
    }
  | {
      type: "sync_progress";
      current: number;
      total: number;
      newly_added: number;
      skipped: number;
      pages: number;
      jobTitle?: string;
    }
  | {
      type: "sync_done";
      fetched: number;
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
