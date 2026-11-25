import { Worker } from "bullmq";
import PastedJob from "./pasted-jobs.model.js";
import { processPastedJob } from "./pasted-jobs.service.js";
import {
  getPastedJobsRedis,
  pastedJobsQueueName,
} from "./pasted-jobs.queue.js";

let worker: Worker<{ pastedJobId: string }> | null = null;

export function startPastedJobsWorker(): void {
  worker = new Worker<{ pastedJobId: string }>(
    pastedJobsQueueName,
    async (task) => {
      try {
        await processPastedJob(task.data.pastedJobId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const maxAttempts = task.opts.attempts ?? 1;
        const isFinalAttempt = task.attemptsMade + 1 >= maxAttempts;
        await PastedJob.updateOne(
          { _id: task.data.pastedJobId },
          {
            $set: {
              status: isFinalAttempt ? "failed" : "queued",
              stage: isFinalAttempt ? "failed" : "retrying",
              error: message,
            },
          }
        ).exec();
        throw error;
      }
    },
    {
      connection: getPastedJobsRedis(),
      concurrency: 1,
    }
  );
  worker.on("completed", (task) => {
    console.log(`[pasted jobs] Completed ${task.data.pastedJobId}`);
  });
  worker.on("failed", (task, error) => {
    console.error(
      `[pasted jobs] Failed ${task?.data.pastedJobId ?? "unknown"}:`,
      error.message
    );
  });
  worker.on("error", (error) => {
    console.error("[pasted jobs worker]", error.message);
  });
}

export async function closePastedJobsWorker(): Promise<void> {
  if (worker) await worker.close();
  worker = null;
}
