import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

export function generateSecureOTP(length = 6): string {
  // Cryptographically secure OTP — never use Math.random()
  const digits = '0123456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => digits[b % 10])
    .join('');
}

export async function hashOTP(otp: string): Promise<string> {
  const rounds = parseInt(env.BCRYPT_ROUNDS, 10);
  return bcrypt.hash(otp, rounds);
}

export async function verifyOTPHash(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

export function hashToken(token: string): string {
  // SHA-256 hash for refresh token storage — fast lookup, no need for bcrypt
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sanitizeForLog(data: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_FIELDS = ['otp', 'password', 'token', 'secret', 'phone', 'email'];
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) =>
      SENSITIVE_FIELDS.some((f) => k.toLowerCase().includes(f)) ? [k, '[REDACTED]'] : [k, v],
    ),
  );
}
