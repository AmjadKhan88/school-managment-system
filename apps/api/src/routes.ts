import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { healthRouter } from './modules/health/health.routes';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

// Phase 2+: register each module router here, e.g.
// apiRouter.use('/students', authenticate, studentsRouter);
