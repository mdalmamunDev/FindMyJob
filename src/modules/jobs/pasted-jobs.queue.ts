import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { config } from "../../config/index.js";
import PastedJob from "./pasted-jobs.model.js";

export const pastedJobsQueueName = "pasted-jobs";

type PastedJobQueueData = { pastedJobId: string };

let redis: Redis | null = null;
let queue: Queue<PastedJobQueueData> | null = null;

function addPastedJobTask(pastedJobId: string): Promise<string> {
  if (!queue) throw new Error("Pasted-jobs queue has not been started");
  return queue
    .add(
      "process",
      { pastedJobId },
      {
        jobId: pastedJobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      }
    )
    .then((task) => task.id ?? pastedJobId);
}

export async function startPastedJobsQueue(): Promise<void> {
  redis = new Redis(config.queueRedisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    retryStrategy: (attempt) => (attempt > 10 ? null : Math.min(attempt * 500, 5000)),
  });
  queue = new Queue<PastedJobQueueData>(pastedJobsQueueName, {
    connection: redis,
  });
  queue.on("error", (error) => {
    console.error("[pasted jobs queue]", error.message);
  });
  await queue.waitUntilReady();
}

export async function enqueuePastedJob(pastedJobId: string): Promise<string> {
  return addPastedJobTask(pastedJobId);
}

export async function enqueuePastedJobRetry(pastedJobId: string): Promise<string> {
  if (!queue) throw new Error("Pasted-jobs queue has not been started");
  const task = await queue.add(
    "process",
    { pastedJobId },
    {
      jobId: `${pastedJobId}-retry-${randomUUID()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    }
  );
  return task.id ?? pastedJobId;
}

export async function recoverQueuedPastedJobs(): Promise<void> {
  if (!queue) throw new Error("Pasted-jobs queue has not been started");
  await PastedJob.updateMany(
    { status: "processing" },
    { $set: { status: "queued", stage: "recovered after restart" } }
  ).exec();
  const pending = await PastedJob.find({ status: "queued" })
    .select({ _id: 1 })
    .lean()
    .exec();
  for (const job of pending) {
    await addPastedJobTask(job._id.toString());
  }
}

export function getPastedJobsRedis(): Redis {
  if (!redis) throw new Error("Pasted-jobs Redis connection has not been started");
  return redis;
}

export async function closePastedJobsQueue(): Promise<void> {
  if (queue) await queue.close();
  queue = null;
  if (redis) await redis.quit();
  redis = null;
}
