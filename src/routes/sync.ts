import { Router } from "express";
import { runSync } from "../sync.js";

export const syncRouter = Router();

syncRouter.post("/", async (req, res) => {
  try {
    const amountRaw = req.body?.amount ?? 50;
    const amount = Number(amountRaw);

    if (!Number.isFinite(amount) || amount < 1) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const report = await runSync(amount);
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", message);
    res.status(500).json({ error: message });
  }
});
