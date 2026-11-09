import { Request, Response } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import * as service from './auth.service';

const COOKIE = 'refresh_token';
const cookieOpts = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};
const ctx = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

export const login = asyncHandler(async (req, res) => {
  const { refreshToken, ...data } = await service.login(req.body.email, req.body.password, ctx(req));
  res.cookie(COOKIE, refreshToken, cookieOpts).json({ success: true, data });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken, ...data } = await service.refresh(req.cookies?.[COOKIE], ctx(req));
  res.cookie(COOKIE, refreshToken, cookieOpts).json({ success: true, data });
});

export const logout = asyncHandler(async (req, res) => {
  await service.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, { path: cookieOpts.path }).json({ success: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getProfile(req.user!.id) });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  await service.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
  res.clearCookie(COOKIE, { path: cookieOpts.path }).json({ success: true, message: 'Password updated. Please sign in again.' });
});
