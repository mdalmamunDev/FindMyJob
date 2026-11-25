import { Router } from "express";
import {
  createSyncToken,
  getSyncStatus,
  startSync,
} from "../controllers/sync.js";

export const syncRouter = Router();

syncRouter.get("/status", getSyncStatus);
syncRouter.post("/token", createSyncToken);
syncRouter.post("/", startSync);
