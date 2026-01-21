import { NextFunction, Request, Response } from "express";

// Request logger intentionally silent to avoid noisy logs
export const requestLogger = (_req: Request, _res: Response, next: NextFunction) => {
  next();
};