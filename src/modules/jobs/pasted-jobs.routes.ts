import { Router } from "express";
import {
  createPastedJob,
  listPastedJobs,
  retryPastedJob,
  sendPastedJobEmail,
  updatePastedJob,
  updatePastedJobEmail,
} from "./pasted-jobs.controller.js";

const router = Router();

router.get("/", listPastedJobs);
router.post("/", createPastedJob);
router.post("/:id/retry", retryPastedJob);
router.post("/:id/send-email", sendPastedJobEmail);
router.patch("/:id", updatePastedJob);
router.patch("/:id/email", updatePastedJobEmail);

export default router;
