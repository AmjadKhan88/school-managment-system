import { Request } from 'express';
import { prisma } from '../config/prisma';

export const writeAudit = (req: Request, entry: {
  action: string; entity: string; entityId?: string; oldValues?: unknown; newValues?: unknown;
}) =>
  prisma.auditLog.create({
    data: {
      schoolId: req.user!.schoolId, userId: req.user!.id,
      action: entry.action, entity: entry.entity, entityId: entry.entityId,
      oldValues: entry.oldValues as any, newValues: entry.newValues as any,
      ipAddress: req.ip,
    },
  });
