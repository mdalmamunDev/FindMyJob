import type { JobSource } from "../jobs/jobs.interface.js";

export interface SyncReport {
  fetched: number;
  newly_added: number;
  skipped: number;
  pages: number;
}

export interface SyncOptions {
  categoryId?: number;
  postedWithin?: number;
}

export type SyncProgressEvent =
  | {
      type: "sync_started";
      total: number;
      categoryId?: number;
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
