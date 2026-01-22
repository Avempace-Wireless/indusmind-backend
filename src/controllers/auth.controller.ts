import { Request, Response } from "express";

export const login = (_req: Request, res: Response) => {
  res.json({ token: "placeholder" });
};