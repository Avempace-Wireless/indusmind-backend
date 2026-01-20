import { Router } from "express";
import { healthRouter } from "./misc/health.routes.js";
import { userRouter } from "./user/user.routes.js";
import { authRouter } from "./auth/auth.routes.js";
import { customerRouter } from "./customer/customer.routes.js";
import { createTelemetryRoutes } from "../routes/telemetry.router.js";
import { initializeThingsboardServices } from "../services/thingsboard/thingsboard.module.js";
import { DeviceService } from "../services/device.service.js";

export const routes = Router();

// Initialize shared services once
const { authService, telemetryService } = initializeThingsboardServices();
const deviceService = new DeviceService();
const telemetryRouter = createTelemetryRoutes(
	telemetryService,
	authService,
	deviceService
);

routes.use("/health", healthRouter);
routes.use("/users", userRouter);
routes.use("/auth", authRouter);
routes.use("/customer", customerRouter);
routes.use("/telemetry", telemetryRouter);