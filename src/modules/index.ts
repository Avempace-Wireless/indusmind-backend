import { Router } from "express";
import { healthRouter } from "./misc/health.routes.js";
import { userRouter } from "./user/user.routes.js";
import { authRouter } from "./auth/auth.routes.js";
import { customerRouter } from "./customer/customer.routes.js";

export const routes = Router();

routes.use("/health", healthRouter);
routes.use("/users", userRouter);
routes.use("/auth", authRouter);
routes.use("/customer", customerRouter);