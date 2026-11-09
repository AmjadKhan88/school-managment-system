import { Router } from "express";
import { authenticate } from "./middleware/auth";
import { academicsRouter } from "./modules/academics/academics.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";

export const apiRouter = Router();
apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/academics", authenticate, academicsRouter);

// Later phases: register each new module here, e.g.
// apiRouter.use('/students', authenticate, studentsRouter);
