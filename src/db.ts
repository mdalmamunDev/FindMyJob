import { MongoClient, type Collection, type Db } from "mongodb";
import { config } from "./config.js";
import type { JobDocument } from "./types.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDb(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(config.mongodbUrl);
  await client.connect();
  db = client.db();

  const jobs = db.collection<JobDocument>("jobs");
  await jobs.createIndex({ Jobid: 1 }, { unique: true });
  await jobs.createIndex({ match_percent: -1 });
  await jobs.createIndex({ Cat_id: 1 });
  await jobs.createIndex({ source: 1 });
  await jobs.createIndex({ isRecent: 1 });
  await jobs.createIndex({ isApplied: 1 });
  await jobs.createIndex({ location: 1 });
  await jobs.createIndex({ JobType: 1 });

  return db;
}

export function jobsCollection(): Collection<JobDocument> {
  if (!db) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return db.collection<JobDocument>("jobs");
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
