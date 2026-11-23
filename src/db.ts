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
  await jobs.createIndex({ isRemoved: 1 });
  await jobs.createIndex({ location: 1 });
  await jobs.createIndex({ JobType: 1 });
  await jobs.createIndex({ synced_at: -1 });
  await jobs.createIndex({ publishDate: -1 });
  await jobs.updateMany(
    { isRemoved: { $exists: false } },
    { $set: { isRemoved: false } }
  );
  await jobs.updateMany(
    { isSortListed: { $exists: false } },
    { $set: { isSortListed: false } }
  );

  return db;
}

export async function getLastSyncAt(): Promise<Date | null> {
  if (!db) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  const state = await db
    .collection<{ _id: string; lastSyncAt?: Date }>("app_state")
    .findOne({ _id: "bdjobs_sync" });
  return state?.lastSyncAt ?? null;
}

export async function recordSyncCompleted(at: Date): Promise<void> {
  if (!db) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  await db.collection<{ _id: string; lastSyncAt?: Date }>("app_state").updateOne(
    { _id: "bdjobs_sync" },
    { $set: { lastSyncAt: at } },
    { upsert: true }
  );
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
