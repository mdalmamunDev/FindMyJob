import { Router } from "express";
import jobsRoutes from "../modules/jobs/jobs.routes.js";
import syncRoutes from "../modules/sync/sync.routes.js";

const router = Router();

router.use("/jobs", jobsRoutes);
router.use("/sync", syncRoutes);

export default router;
