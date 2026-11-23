import { Router } from "express";
import { getSyncStatus, startSync } from "../controllers/sync.js";

export const syncRouter = Router();

syncRouter.get("/status", getSyncStatus);
syncRouter.post("/", startSync);
