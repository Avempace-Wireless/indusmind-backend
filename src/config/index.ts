import { env } from "./env.js";

export const config = {
  env: env.NODE_ENV,
  port: Number(env.PORT),
  logLevel: env.LOG_LEVEL,
};