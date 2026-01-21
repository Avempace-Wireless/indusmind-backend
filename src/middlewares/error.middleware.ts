import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error(`Unhandled error: ${err.message}`, err.stack);
  res.status(500).json({ message: "Internal Server Error" });
}