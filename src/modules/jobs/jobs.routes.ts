import { Router } from "express";
import {
  bulkRemoveJobs,
  getJobById,
  listJobs,
  updateJob,
} from "./jobs.controller.js";

const router = Router();

router.get("/", listJobs);
router.post("/bulk-remove", bulkRemoveJobs);
router.get("/:id", getJobById);
router.patch("/:id", updateJob);

export default router;
