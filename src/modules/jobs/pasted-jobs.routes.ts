import { Router } from "express";
import {
  createPastedJob,
  getPastedJobStatus,
  listPastedJobs,
  updatePastedJobEmail,
} from "./pasted-jobs.controller.js";

const router = Router();

router.get("/", listPastedJobs);
router.get("/:id/status", getPastedJobStatus);
router.post("/", createPastedJob);
router.patch("/:id/email", updatePastedJobEmail);

export default router;
