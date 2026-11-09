import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/tokens';

type Ctx = { ip?: string; userAgent?: string };
const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

async function issueTokens(user: { id: string; schoolId: string }, ctx: Ctx) {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiry(), ipAddress: ctx.ip, userAgent: ctx.userAgent },
  });
  return { accessToken: signAccessToken({ sub: user.id, schoolId: user.schoolId }), refreshToken };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      school: { select: { id: true, name: true, logoUrl: true } },
      userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
    },
  });
  const permissions = new Set<string>();
  user.userRoles.forEach((ur) => ur.role.rolePermissions.forEach((rp) => permissions.add(`${rp.permission.module}:${rp.permission.action}`)));
  const activeSession = await prisma.academicSession.findFirst({ where: { schoolId: user.schoolId, isActive: true }, select: { id: true, name: true } });
  const sessions = await prisma.academicSession.findMany({ where: { schoolId: user.schoolId }, orderBy: { startDate: 'desc' }, select: { id: true, name: true, isActive: true } });
  return {
    id: user.id, fullName: user.fullName, email: user.email, school: user.school,
    roles: user.userRoles.map((ur) => ({ slug: ur.role.slug, name: ur.role.name })),
    permissions: [...permissions], activeSession, sessions,
  };
}

export async function login(email: string, password: string, ctx: Ctx) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = !!user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
  await prisma.loginHistory.create({ data: { userId: user?.id, email, success: ok, ipAddress: ctx.ip, userAgent: ctx.userAgent } });
  if (!ok || !user) throw ApiError.unauthorized('Incorrect email or password');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const tokens = await issueTokens(user, ctx);
  return { ...tokens, user: await getProfile(user.id) };
}

/** Rotates the refresh token: old one is revoked, a new pair is issued. */
export async function refresh(rawToken: string | undefined, ctx: Ctx) {
  if (!rawToken) throw ApiError.unauthorized();
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: true } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
    // Reuse of a revoked token suggests theft: revoke the user's whole family.
    if (stored?.revokedAt) await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw ApiError.unauthorized('Session expired, please sign in again');
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const tokens = await issueTokens(stored.user, ctx);
  return { ...tokens, user: await getProfile(stored.userId) };
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw ApiError.badRequest('Current password is incorrect');
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
