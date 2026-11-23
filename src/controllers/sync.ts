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
    const categoryIdRaw = req.body?.categoryId;
    const categoryId =
      categoryIdRaw === undefined || categoryIdRaw === ""
        ? undefined
        : Number(categoryIdRaw);
    if (
      categoryId !== undefined &&
      (!Number.isInteger(categoryId) || categoryId === 0)
    ) {
      res.status(400).json({ error: "categoryId must be a non-zero whole number" });
      return;
    }

    const postedWithinRaw = req.body?.postedWithin;
    const postedWithin =
      postedWithinRaw === undefined ||
      postedWithinRaw === null ||
      postedWithinRaw === ""
        ? 1
        : Number(postedWithinRaw);
    if (!Number.isInteger(postedWithin) || postedWithin < 1) {
      res.status(400).json({ error: "postedWithin must be a positive whole number of days" });
      return;
    }

    const started = startSyncBackground(
      { categoryId, postedWithin },
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
      ...(categoryId !== undefined ? { categoryId } : {}),
      postedWithin,
      message: "Sync started. Watch progress over WebSocket.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", message);
    res.status(500).json({ error: message });
  }
};
