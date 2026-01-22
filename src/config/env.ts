import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("4000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export const env = schema.parse({
  NODE_ENV: process.env.NODE_ENV?.trim(),
  PORT: process.env.PORT?.trim(),
  LOG_LEVEL: process.env.LOG_LEVEL?.trim(),
});