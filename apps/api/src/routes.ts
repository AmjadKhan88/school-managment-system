import { Router } from "express";
import { authenticate } from "./middleware/auth";
import { academicsRouter } from "./modules/academics/academics.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";
import { admissionsRouter } from "./modules/admissions/admissions.routes";
import { enquiriesRouter } from "./modules/enquiries/enquiries.routes";
import { studentsRouter } from "./modules/students/students.routes";
import { promotionRouter } from "./modules/promotion/promotion.routes";
import { transfersRouter } from "./modules/transfers/transfers.routes";
import { feesRouter } from "./modules/fees/fees.routes";

export const apiRouter = Router();
apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/academics", authenticate, academicsRouter);
apiRouter.use("/enquiries", authenticate, enquiriesRouter);
apiRouter.use("/admissions", authenticate, admissionsRouter);
apiRouter.use("/students", authenticate, studentsRouter);
apiRouter.use("/promotion", authenticate, promotionRouter);
apiRouter.use("/transfers", authenticate, transfersRouter);
apiRouter.use("/fees", authenticate, feesRouter);

// Later phases: register each new module here, e.g.
// apiRouter.use('/students', authenticate, studentsRouter);
