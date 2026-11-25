import type { ErrorRequestHandler } from "express";

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${req.method} ${req.originalUrl}]`, message);
  res.status(500).json({ error: message });
};

export default errorHandler;
