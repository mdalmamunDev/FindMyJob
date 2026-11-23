import express from "express";
import http from "node:http";
import path from "node:path";
import { config } from "./config.js";
import { closeDb, connectDb } from "./db.js";
import { jobsRouter } from "./routes/jobs.js";
import { syncRouter } from "./routes/sync.js";
import { attachWebSocket } from "./ws.js";

async function main() {
  await connectDb();
  console.log("Connected to MongoDB Atlas");

  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/sync", syncRouter);
  app.use("/api/jobs", jobsRouter);

  const server = http.createServer(app);
  attachWebSocket(server);

  server.listen(config.port, () => {
    console.log(`FindMyJob running at http://localhost:${config.port}`);
    console.log(`WebSocket at ws://localhost:${config.port}/ws`);
  });

  const shutdown = async () => {
    server.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
