import { config } from "./config.js";
import type { BdjobsJob, BdjobsJobDetails } from "./types.js";

export interface BdjobsPage {
  premium: BdjobsJob[];
  normal: BdjobsJob[];
  totalPages: number | null;
  totalRecordsFound: number | null;
}

interface BdjobsApiResponse {
  message?: string;
  statuscode?: string;
  data?: BdjobsJob[];
  premiumData?: BdjobsJob[];
  common?: {
    totalpages?: number | string;
    total_records_found?: number | string;
  };
}

interface BdjobsJobDetailsResponse {
  message?: string;
  statuscode?: string;
  data?: BdjobsJobDetails[] | BdjobsJobDetails;
}

function normalizeJob(job: BdjobsJob): BdjobsJob | null {
  const id = String(job.Jobid ?? "").trim();
  if (!id) return null;
  return { ...job, Jobid: id };
}

export async function fetchBdjobsPage(
  page: number,
  categoryId?: number,
  postedWithin?: number
): Promise<BdjobsPage> {
  const url = new URL(config.bdjobsUrl);
  url.searchParams.set("pg", String(page));
  url.searchParams.set("rpp", String(config.rpp));
  url.searchParams.set("Icat", categoryId === undefined ? "" : String(categoryId));
  url.searchParams.set(
    "postedWithin",
    postedWithin === undefined ? "" : String(postedWithin)
  );
  url.searchParams.set("ToggleJobs", "true");
  url.searchParams.set("isFresher", "false");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "findmyjob/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`BDJobs HTTP ${res.status}`);
  }

  const json = (await res.json()) as BdjobsApiResponse;
  if (json.statuscode !== "1" && json.message !== "Success") {
    throw new Error(`BDJobs API error: ${json.message ?? "unknown"}`);
  }

  const premium = (json.premiumData ?? [])
    .map(normalizeJob)
    .filter((j): j is BdjobsJob => j !== null);

  const normal = (json.data ?? [])
    .map(normalizeJob)
    .filter((j): j is BdjobsJob => j !== null);

  const totalPagesRaw = json.common?.totalpages;
  const totalPages =
    totalPagesRaw === undefined || totalPagesRaw === null
      ? null
      : Number(totalPagesRaw);
  const totalRecordsRaw = json.common?.total_records_found;
  const totalRecordsFound =
    totalRecordsRaw === undefined || totalRecordsRaw === null
      ? null
      : Number(totalRecordsRaw);

  return {
    premium,
    normal,
    totalPages: Number.isFinite(totalPages) ? totalPages : null,
    totalRecordsFound: Number.isFinite(totalRecordsFound)
      ? totalRecordsFound
      : null,
  };
}

export async function fetchBdjobsJobDetails(
  jobId: string
): Promise<BdjobsJobDetails> {
  const url = new URL(config.bdjobsJobDetailsUrl);
  url.searchParams.set("jobId", jobId);

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "findmyjob/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`BDJobs details HTTP ${res.status}`);
  }

  const json = (await res.json()) as BdjobsJobDetailsResponse;
  if (json.statuscode !== "1" && json.message !== "Success") {
    throw new Error(`BDJobs details API error: ${json.message ?? "unknown"}`);
  }

  const details = Array.isArray(json.data) ? json.data[0] : json.data;
  if (!details || typeof details !== "object") {
    throw new Error(`BDJobs returned no details for job ${jobId}`);
  }

  return details;
}

export function mergeBdjobsJobDetails(
  job: BdjobsJob,
  details: BdjobsJobDetails
): BdjobsJob {
  const companyName =
    details.CompanyNameENG || details.CompnayName || job.companyName;
  return {
    ...job,
    jobTitle: details.JobTitle || job.jobTitle,
    companyName,
    deadline: details.Deadline || job.deadline,
    deadlineDB: details.DeadlineDB || job.deadlineDB,
    publishDate: job.publishDate || details.PostedOn,
    eduRec: details.EducationRequirements || job.eduRec,
    experience: details.experience || job.experience,
    location: details.JobLocation || job.location,
    jobContext:
      (typeof details.Context === "string" && details.Context) ||
      job.jobContext,
    jobDescription: details.JobDescription || job.jobDescription,
    JobType: details.JobNature || job.JobType,
    Vacancies: Number(details.JobVacancies) || job.Vacancies,
    Salary:
      details.JobSalaryRangeText ||
      details.JobSalaryRange ||
      job.Salary,
    WorkPlace: details.JobWorkPlace || job.WorkPlace,
  };
}
