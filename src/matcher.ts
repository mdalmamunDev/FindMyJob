import fs from "node:fs/promises";
import { config } from "./config.js";
import type { BdjobsJob, BdjobsJobDetails, MatchResult } from "./types.js";

let resumeCache: string | null = null;

export async function loadResume(): Promise<string> {
  if (resumeCache) return resumeCache;
  resumeCache = await fs.readFile(config.resumePath, "utf8");
  return resumeCache;
}

export function clearResumeCache(): void {
  resumeCache = null;
}

function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPrompt(
  resume: string,
  job: BdjobsJob,
  details?: BdjobsJobDetails
): string {
  const jobBlock = [
    `Title: ${job.jobTitle ?? ""}`,
    `Company: ${job.companyName ?? ""}`,
    `Location: ${job.location ?? ""}`,
    `Type: ${job.JobType ?? ""}`,
    `Experience: ${job.experience ?? ""}`,
    `Education: ${stripHtml(job.eduRec)}`,
    `Workplace: ${job.WorkPlace ?? ""}`,
    `Salary: ${job.Salary ?? ""}`,
    `Context: ${stripHtml(job.jobContext)}`,
    `Description: ${stripHtml(job.jobDescription)}`,
    `Required skills: ${details?.SkillsRequired ?? ""}`,
    `Suggested skills: ${details?.SuggestedSkills ?? ""}`,
    `Additional requirements: ${stripHtml(details?.AdditionJobRequirements)}`,
    `Company business: ${stripHtml(details?.CompanyBusiness)}`,
    `Benefits: ${stripHtml(details?.JobOtherBenifits)}`,
    `Age requirement: ${details?.Age ?? ""}`,
    `Gender requirement: ${details?.Gender ?? ""}`,
    `Key points: ${stripHtml(details?.JobKeyPoints)}`,
  ].join("\n");

  return `You are a job-fit scoring assistant.
Compare the candidate resume to the job posting.
Return ONLY valid JSON with this shape:
{"match_percent": <integer 0-100>, "reason": "<one short sentence>"}

Scoring guide:
- 80-100: strong skill/role match
- 50-79: partial overlap
- 20-49: weak overlap
- 0-19: unrelated field

RESUME:
${resume}

JOB:
${jobBlock}`;
}

function parseMatchJson(text: string): MatchResult {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    match_percent?: unknown;
    reason?: unknown;
  };

  let percent = Number(parsed.match_percent);
  if (!Number.isFinite(percent)) percent = 0;
  percent = Math.max(0, Math.min(100, Math.round(percent)));

  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "No reason provided";

  return { match_percent: percent, reason };
}

export async function scoreJob(
  job: BdjobsJob,
  resume: string,
  details?: BdjobsJobDetails
): Promise<MatchResult> {
  const prompt = buildPrompt(resume, job, details);

  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { response?: string };
    if (!data.response) {
      throw new Error("Empty Ollama response");
    }

    return parseMatchJson(data.response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      match_percent: 0,
      reason: `Match failed: ${message}`,
    };
  }
}
