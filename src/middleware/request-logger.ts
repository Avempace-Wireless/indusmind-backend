import pinoHttpModule from "pino-http";
import { logger } from "../utils/logger.js";

const pinoHttp = pinoHttpModule.default || pinoHttpModule;

export const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
});
