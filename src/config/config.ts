import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development").transform(val => val.trim()),
  PORT: z.string().default("4000").transform(val => val.trim()),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info").transform(val => val.trim()),
});

const parsed = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV?.trim(),
  PORT: process.env.PORT?.trim(),
  LOG_LEVEL: process.env.LOG_LEVEL?.trim(),
});

export const config = {
  env: parsed.NODE_ENV,
  port: Number(parsed.PORT),
  logLevel: parsed.LOG_LEVEL,
};
