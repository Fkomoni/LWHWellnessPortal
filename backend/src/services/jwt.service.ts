import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../config/database';
import { hashToken, generateSecureToken } from '../utils/crypto';
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;         // memberId
  role: Role;
  sessionId: string;  // unique per login — enables single-session invalidation
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
    issuer: 'lwh-wellness-portal',
    audience: 'lwh-client',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'lwh-wellness-portal',
    audience: 'lwh-client',
  }) as JwtPayload;
}

export async function issueRefreshToken(
  memberId: string,
  ipAddress: string,
  userAgent: string,
): Promise<string> {
  const rawToken = generateSecureToken(48);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.refreshToken.create({
    data: { memberId, tokenHash, expiresAt, ipAddress, userAgent },
  });

  return rawToken;
}

export async function rotateRefreshToken(
  rawToken: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ accessToken: string; refreshToken: string; member: { id: string; role: Role } }> {
  const tokenHash = hashToken(rawToken);

  const stored = await db.refreshToken.findUnique({ where: { tokenHash }, include: { member: true } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    // Rotate all tokens for this user on reuse detection (refresh token reuse attack)
    if (stored) {
      await db.refreshToken.updateMany({ where: { memberId: stored.memberId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  // Revoke old token (rotate)
  await db.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } });

  const newRefreshToken = await issueRefreshToken(stored.memberId, ipAddress, userAgent);
  const sessionId = generateSecureToken(16);
  const accessToken = signAccessToken({ sub: stored.memberId, role: stored.member.role, sessionId });

  return { accessToken, refreshToken: newRefreshToken, member: { id: stored.memberId, role: stored.member.role } };
}

export async function revokeAllTokens(memberId: string): Promise<void> {
  await db.refreshToken.updateMany({ where: { memberId, revokedAt: null }, data: { revokedAt: new Date() } });
}
