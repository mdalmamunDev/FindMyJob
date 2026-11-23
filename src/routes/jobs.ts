import { Router } from "express";
import {
  bulkRemoveJobs,
  getJobById,
  listJobs,
  updateJob,
} from "../controllers/jobs.js";

export const jobsRouter = Router();

jobsRouter.get("/", listJobs);
jobsRouter.post("/bulk-remove", bulkRemoveJobs);
jobsRouter.get("/:id", getJobById);
jobsRouter.patch("/:id", updateJob);
