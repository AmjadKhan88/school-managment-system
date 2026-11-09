import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessPayload {
  sub: string;
  schoolId: string;
}

export const signAccessToken = (payload: AccessPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as SignOptions);

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload & jwt.JwtPayload;

// Refresh tokens are opaque random strings; only a SHA-256 hash is stored.
export const generateRefreshToken = () =>
  crypto.randomBytes(48).toString("hex");
export const hashToken = (t: string) =>
  crypto.createHash("sha256").update(t).digest("hex");
