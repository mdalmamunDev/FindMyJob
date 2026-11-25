import type { RequestHandler } from "express";
import catchAsync from "../../shared/catchAsync.js";
import { getLastSyncAt, startSyncBackground } from "./sync.service.js";
import { broadcast } from "../../shared/websocket.js";

export const createSyncToken: RequestHandler = (_req, res) => {
  res.sendStatus(501);
};

export const getSyncStatus: RequestHandler = catchAsync(async (_req, res) => {
  res.json({ lastSyncAt: await getLastSyncAt() });
});

export const startSync: RequestHandler = catchAsync((req, res) => {
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
});
