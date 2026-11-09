import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/tokens';
import { PermissionActionKey, PermissionModule } from '../config/permissions';

/** Verifies the bearer token, then loads the user with roles and permissions. */
export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();
    let payload;
    try { payload = verifyAccessToken(header.slice(7)); }
    catch { throw ApiError.unauthorized('Session expired, please sign in again'); }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
    });
    if (!user || !user.isActive) throw ApiError.unauthorized('Account is inactive');

    const permissions = new Set<string>();
    user.userRoles.forEach((ur) =>
      ur.role.rolePermissions.forEach((rp) => permissions.add(`${rp.permission.module}:${rp.permission.action}`)));

    req.user = {
      id: user.id, schoolId: user.schoolId, branchId: user.branchId,
      email: user.email, fullName: user.fullName,
      roles: user.userRoles.map((ur) => ur.role.slug), permissions,
    };
    next();
  } catch (e) { next(e); }
};

/** Backend permission gate. Usage: router.get('/', authorize('students', 'VIEW'), handler) */
export const authorize = (module: PermissionModule, action: PermissionActionKey) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!req.user.permissions.has(`${module}:${action}`)) return next(ApiError.forbidden());
    next();
  };

/**
 * Tenant boundary helper: every query must be scoped with this.
 *   prisma.student.findMany({ where: { ...tenant(req), status: 'ACTIVE' } })
 */
export const tenant = (req: Request) => {
  if (!req.user) throw ApiError.unauthorized();
  return { schoolId: req.user.schoolId };
};
