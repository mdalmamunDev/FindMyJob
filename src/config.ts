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

export const config = {
  port: optionalInt("PORT", 3000),
  rpp: optionalInt("RPP", 50),
  maxPages: optionalInt("MAX_PAGES", 50),
  bdjobsUrl: required("BDJOBS_GET_JOBS_URL").split("#")[0].trim(),
  mongodbUrl: required("MONGODB_URL"),
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim(),
  ollamaModel: (process.env.OLLAMA_MODEL || "llama3.2").trim(),
  resumePath: path.resolve(process.cwd(), "RESUME.md"),
  frontendOrigin: (process.env.FRONTEND_ORIGIN || "http://localhost:5173").trim(),
};
