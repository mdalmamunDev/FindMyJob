import { Router } from "express";
import {
  createSyncToken,
  getSyncStatus,
  startSync,
} from "./sync.controller.js";

const router = Router();

router.get("/status", getSyncStatus);
router.post("/token", createSyncToken);
router.post("/", startSync);

export default router;
