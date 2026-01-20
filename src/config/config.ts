import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("4000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const parsed = envSchema.parse(process.env);

export const config = {
  env: parsed.NODE_ENV,
  port: Number(parsed.PORT),
  logLevel: parsed.LOG_LEVEL,
};
