import { Router } from "express";
import { getUsers } from "../controllers/user.controller.js";

export const userRouter = Router();

userRouter.get("/", getUsers);