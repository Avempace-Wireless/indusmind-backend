import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { userRouter } from "./user.routes.js";
import { authRouter } from "./auth.routes.js";
import { customerRouter } from "./customer.routes.js";
import { createTelemetryRoutes } from "./telemetry.router.js";
import { initializeThingsboardServices } from "../services/thingsboard/thingsboard.module.js";
import { DeviceService } from "../services/device.service.js";

export const routes = Router();

// Lazy initialization - services created on first request, not at module import
let telemetryRouter: Router | null = null;

function ensureTelemetryRouter(): Router {
  if (!telemetryRouter) {
    const { authService, telemetryService } = initializeThingsboardServices();
    const deviceService = new DeviceService();
    telemetryRouter = createTelemetryRoutes(
      telemetryService,
      authService,
      deviceService
    );
  }
  return telemetryRouter;
}

routes.use("/health", healthRouter);
routes.use("/users", userRouter);
routes.use("/auth", authRouter);
routes.use("/customer", customerRouter);
routes.use("/telemetry", (req, res, next) => {
  // Initialize telemetry router on first request (lazy loading)
  ensureTelemetryRouter()(req, res, next);
});
