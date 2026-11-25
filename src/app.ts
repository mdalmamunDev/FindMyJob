import cors from "cors";
import express from "express";
import { config } from "./config/index.js";
import routes from "./routes/index.js";
import errorHandler from "./shared/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: config.frontendOrigins,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", routes);
app.use(errorHandler);

export default app;
