import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import * as c from "./auth.controller";
import { changePasswordSchema, loginSchema } from "./auth.schema";

export const authRouter = Router();
authRouter.post("/login", authLimiter, validate(loginSchema), c.login);
authRouter.post("/refresh", authLimiter, c.refresh);
authRouter.post("/logout", c.logout);
authRouter.get("/me", authenticate, c.me);
authRouter.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  c.changePassword,
);
