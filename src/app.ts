import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import { routes } from "./modules/index.js";
import { requestLogger } from "./middlewares/request-logger.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(compression());
  app.use(requestLogger);

  app.use(routes);

  app.use(errorMiddleware);

  return app;
}
