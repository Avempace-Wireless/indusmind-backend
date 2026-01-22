import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// Preprocess environment variables to trim whitespace
const trimmedEnv = {
  NODE_ENV: process.env.NODE_ENV?.trim() || undefined,
  PORT: process.env.PORT?.trim() || undefined,
  LOG_LEVEL: process.env.LOG_LEVEL?.trim() || undefined,
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("4000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const parsed = envSchema.parse(trimmedEnv);

export const config = {
  env: parsed.NODE_ENV,
  port: Number(parsed.PORT),
  logLevel: parsed.LOG_LEVEL,
};
