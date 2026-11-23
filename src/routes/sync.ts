import { Router } from "express";
import { startSyncBackground } from "../sync.js";
import { broadcast } from "../ws.js";

export const syncRouter = Router();

syncRouter.post("/", (req, res) => {
  try {
    const amountRaw = req.body?.amount ?? 50;
    const amount = Number(amountRaw);

    if (!Number.isFinite(amount) || amount < 1) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const target = Math.floor(amount);
    const started = startSyncBackground(target, (event) => {
      broadcast(event);
    });

    if (!started) {
      res.status(409).json({ error: "Sync already running" });
      return;
    }

    res.status(202).json({
      started: true,
      amount: target,
      message: "Sync started. Watch progress over WebSocket.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", message);
    res.status(500).json({ error: message });
  }
});
