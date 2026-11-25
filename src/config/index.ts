import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env") });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function optionalInteger(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be a whole number`);
  }
  return value;
}

const autoSyncHour = optionalInteger("AUTO_SYNC_HOUR");
if (autoSyncHour !== undefined && (autoSyncHour < 1 || autoSyncHour > 24)) {
  throw new Error("AUTO_SYNC_HOUR must be between 1 and 24");
}

const autoSyncCategoryId = optionalInteger("AUTO_SYNC_CATEGORY_ID");
if (autoSyncCategoryId === 0) {
  throw new Error("AUTO_SYNC_CATEGORY_ID must be a non-zero whole number");
}

const autoSyncPostedWithinDay =
  optionalInteger("AUTO_SYNC_POSTED_WITHIN_DAY") ?? 1;
if (autoSyncPostedWithinDay < 1) {
  throw new Error("AUTO_SYNC_POSTED_WITHIN_DAY must be a positive whole number");
}

export const config = {
  port: optionalInt("PORT", 3000),
  rpp: optionalInt("RPP", 50),
  maxPages: optionalInt("MAX_PAGES", 50),
  bdjobsUrl: required("BDJOBS_GET_JOBS_URL").split("#")[0].trim(),
  bdjobsJobDetailsUrl: required("BDJOBS_GET_JOB_DETAILS_URL"),
  mongodbUrl: required("MONGODB_URL"),
  queueRedisUrl: (process.env.QUEUE_REDIS_URL || "redis://127.0.0.1:6379").trim(),
  geminiApiKey: required("GEMINI_API_KEY"),
  geminiModel: (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim(),
  resumePath: path.resolve(process.cwd(), "RESUME.md"),
  frontendOrigins: (process.env.FRONTEND_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  autoSyncHour,
  autoSyncCategoryId,
  autoSyncPostedWithinDay,
};
