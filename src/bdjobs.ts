import { config } from "./config.js";
import type { BdjobsJob } from "./types.js";

export interface BdjobsPage {
  premium: BdjobsJob[];
  normal: BdjobsJob[];
  totalPages: number | null;
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

function normalizeJob(job: BdjobsJob): BdjobsJob | null {
  const id = String(job.Jobid ?? "").trim();
  if (!id) return null;
  return { ...job, Jobid: id };
}

export async function fetchBdjobsPage(page: number): Promise<BdjobsPage> {
  const url = new URL(config.bdjobsUrl);
  url.searchParams.set("pg", String(page));
  url.searchParams.set("rpp", String(config.rpp));
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

  return {
    premium,
    normal,
    totalPages: Number.isFinite(totalPages) ? totalPages : null,
  };
}
