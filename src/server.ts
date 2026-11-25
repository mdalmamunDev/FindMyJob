import http from "node:http";
import app from "./app.js";
import { config } from "./config/index.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";
import { startAutoSync } from "./modules/sync/sync.scheduler.js";
import { attachWebSocket } from "./shared/websocket.js";
import {
  closePastedJobsQueue,
  recoverQueuedPastedJobs,
  startPastedJobsQueue,
} from "./modules/jobs/pasted-jobs.queue.js";
import {
  closePastedJobsWorker,
  startPastedJobsWorker,
} from "./modules/jobs/pasted-jobs.worker.js";

async function main(): Promise<void> {
  await connectDatabase();
  console.log("Connected to MongoDB");
  await startPastedJobsQueue();
  await recoverQueuedPastedJobs();
  startPastedJobsWorker();

  const server = http.createServer(app);
  attachWebSocket(server);
  const autoSyncTask = startAutoSync();

  server.listen(config.port, () => {
    console.log(`API running at http://localhost:${config.port}`);
    console.log(`WebSocket at ws://localhost:${config.port}/ws`);
    console.log(`CORS origins: ${config.frontendOrigins.join(", ")}`);
  });

  const shutdown = async () => {
    autoSyncTask?.stop();
    server.close();
    await closePastedJobsWorker();
    await closePastedJobsQueue();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
