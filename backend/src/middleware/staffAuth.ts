import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { StaffRole } from '@prisma/client';

export interface StaffJwtPayload {
  sub: string;          // staff.id
  email: string;
  staffRole: StaffRole;
  kind: 'staff';
  iat?: number;
  exp?: number;
}

export interface StaffAuthRequest extends Request {
  staff?: StaffJwtPayload;
}

const STAFF_TTL = '8h';

export function signStaffAccessToken(payload: Omit<StaffJwtPayload, 'iat' | 'exp' | 'kind'>): string {
  return jwt.sign(
    { ...payload, kind: 'staff' as const },
    env.JWT_ACCESS_SECRET,
    { expiresIn: STAFF_TTL, issuer: 'lwh-wellness-portal', audience: 'lwh-staff' } as jwt.SignOptions,
  );
}

export function verifyStaffAccessToken(token: string): StaffJwtPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'lwh-wellness-portal',
    audience: 'lwh-staff',
  }) as StaffJwtPayload;
  if (payload.kind !== 'staff') throw new Error('Not a staff token');
  return payload;
}

export function requireStaff(req: StaffAuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' });
    return;
  }
  try {
    req.staff = verifyStaffAccessToken(authHeader.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Token is invalid or expired', code: 'TOKEN_INVALID' });
  }
}

export function requireStaffRole(...roles: StaffRole[]) {
  return (req: StaffAuthRequest, res: Response, next: NextFunction): void => {
    if (!req.staff) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }
    if (!roles.includes(req.staff.staffRole)) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}
