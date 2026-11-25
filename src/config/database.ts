import mongoose from "mongoose";
import Job from "../modules/jobs/jobs.model.js";
import { config } from "./index.js";

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(config.mongodbUrl);
  }

  await Job.createIndexes();
  await Job.updateMany(
    { isRemoved: { $exists: false } },
    { $set: { isRemoved: false } }
  ).exec();
  await Job.updateMany(
    { isSortListed: { $exists: false } },
    { $set: { isSortListed: false } }
  ).exec();
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
