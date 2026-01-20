import { Router } from "express";
import { getUsers } from "./user.controller.js";

export const userRouter = Router();

userRouter.get("/", getUsers);