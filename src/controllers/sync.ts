import type { RequestHandler } from "express";
import { getLastSyncAt } from "../db.js";
import { startSyncBackground } from "../sync.js";
import { broadcast } from "../ws.js";

export const getSyncStatus: RequestHandler = async (_req, res) => {
  try {
    res.json({ lastSyncAt: await getLastSyncAt() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync status]", message);
    res.status(500).json({ error: message });
  }
};

export const startSync: RequestHandler = (req, res) => {
  try {
    const postedWithinRaw = req.body?.postedWithin;
    const postedWithin =
      postedWithinRaw === undefined || postedWithinRaw === ""
        ? undefined
        : Number(postedWithinRaw);
    if (
      postedWithin !== undefined &&
      (!Number.isInteger(postedWithin) || postedWithin < 1)
    ) {
      res.status(400).json({ error: "postedWithin must be a positive whole number of days" });
      return;
    }

    const amount = postedWithin !== undefined
      ? undefined
      : Number(req.body?.amount ?? 50);
    if (postedWithin === undefined && (!Number.isFinite(amount) || amount! < 1)) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const target = amount === undefined ? undefined : Math.floor(amount);
    const started = startSyncBackground(
      { amount: target, postedWithin },
      (event) => {
        broadcast(event);
      }
    );

    if (!started) {
      res.status(409).json({ error: "Sync already running" });
      return;
    }

    res.status(202).json({
      started: true,
      ...(postedWithin !== undefined ? { postedWithin } : { amount: target }),
      message: "Sync started. Watch progress over WebSocket.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", message);
    res.status(500).json({ error: message });
  }
};
