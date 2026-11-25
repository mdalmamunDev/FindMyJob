import { Router } from "express";
import {
  createPastedJob,
  listPastedJobs,
  updatePastedJob,
  updatePastedJobEmail,
} from "./pasted-jobs.controller.js";

const router = Router();

router.get("/", listPastedJobs);
router.post("/", createPastedJob);
router.patch("/:id", updatePastedJob);
router.patch("/:id/email", updatePastedJobEmail);

export default router;
