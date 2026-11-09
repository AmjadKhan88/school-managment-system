import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';

export const healthRouter = Router();
healthRouter.get('/', asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ success: true, status: 'ok', time: new Date().toISOString() });
}));
