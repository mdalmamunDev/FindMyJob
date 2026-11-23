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
    const dateRaw = req.body?.publishedAfter;
    let publishedAfter: string | undefined;

    if (dateRaw !== undefined && dateRaw !== "") {
      if (typeof dateRaw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
        res.status(400).json({ error: "publishedAfter must be a valid YYYY-MM-DD date" });
        return;
      }
      const parsed = new Date(`${dateRaw}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateRaw) {
        res.status(400).json({ error: "publishedAfter must be a valid YYYY-MM-DD date" });
        return;
      }
      publishedAfter = dateRaw;
    }

    const amount = publishedAfter ? undefined : Number(req.body?.amount ?? 50);
    if (!publishedAfter && (!Number.isFinite(amount) || amount! < 1)) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const target = amount === undefined ? undefined : Math.floor(amount);
    const started = startSyncBackground(
      { amount: target, publishedAfter },
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
      ...(publishedAfter ? { publishedAfter } : { amount: target }),
      message: "Sync started. Watch progress over WebSocket.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", message);
    res.status(500).json({ error: message });
  }
};
