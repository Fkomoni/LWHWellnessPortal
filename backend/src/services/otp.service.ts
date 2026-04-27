import { db } from '../config/database';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../utils/crypto';
import { env } from '../config/env';
import { OtpPurpose, OtpGeneratedBy } from '@prisma/client';

export interface OtpResult {
  otp: string;        // raw OTP — send to user, never log
  expiresAt: Date;
  otpId: string;
}

export async function generateAuthOTP(phone: string, ipAddress: string): Promise<OtpResult> {
  const otp = generateSecureOTP(6);
  const otpHash = await hashOTP(otp);
  const expiresAt = new Date(Date.now() + parseInt(env.OTP_EXPIRY_MINUTES, 10) * 60 * 1000);

  // Invalidate any prior unused AUTH OTPs for this phone
  await db.otpRecord.updateMany({
    where: { phone, purpose: OtpPurpose.AUTH, usedAt: null, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() }, // expire immediately
  });

  const record = await db.otpRecord.create({
    data: { phone, otpHash, purpose: OtpPurpose.AUTH, expiresAt, ipAddress },
  });

  return { otp, expiresAt, otpId: record.id };
}

export async function generateSessionOTP(memberId: string, phone: string, ipAddress: string): Promise<OtpResult> {
  const otp = generateSecureOTP(6);
  const otpHash = await hashOTP(otp);
  const expiresAt = new Date(Date.now() + parseInt(env.OTP_EXPIRY_MINUTES, 10) * 60 * 1000);

  const record = await db.otpRecord.create({
    data: { memberId, phone, otpHash, purpose: OtpPurpose.SESSION, expiresAt, ipAddress },
  });

  return { otp, expiresAt, otpId: record.id };
}

export interface OtpVerifyResult {
  valid: boolean;
  memberId?: string;
  reason?: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'MAX_ATTEMPTS' | 'INVALID';
}

export async function verifyAuthOTP(phone: string, otp: string): Promise<OtpVerifyResult> {
  const maxAttempts = parseInt(env.OTP_MAX_ATTEMPTS, 10);

  const record = await db.otpRecord.findFirst({
    where: {
      phone,
      purpose: OtpPurpose.AUTH,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return { valid: false, reason: 'NOT_FOUND' };
  if (record.attempts >= maxAttempts) return { valid: false, reason: 'MAX_ATTEMPTS' };

  // Increment attempts before comparing (prevents timing-based bypass)
  await db.otpRecord.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });

  const match = await verifyOTPHash(otp, record.otpHash);
  if (!match) return { valid: false, reason: 'INVALID' };

  await db.otpRecord.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  return { valid: true, memberId: record.memberId ?? undefined };
}

export async function verifySessionOTP(
  otpCode: string,
  providedByProvider: boolean,
): Promise<{ valid: boolean; otpId?: string; memberId?: string; generatedBy?: OtpGeneratedBy; reason?: string }> {
  const maxAttempts = parseInt(env.OTP_MAX_ATTEMPTS, 10);

  const record = await db.otpRecord.findFirst({
    where: {
      purpose: OtpPurpose.SESSION,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return { valid: false, reason: 'NOT_FOUND' };
  if (record.attempts >= maxAttempts) return { valid: false, reason: 'MAX_ATTEMPTS' };

  await db.otpRecord.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });

  const match = await verifyOTPHash(otpCode, record.otpHash);
  if (!match) return { valid: false, reason: 'INVALID' };

  await db.otpRecord.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  return { valid: true, otpId: record.id, memberId: record.memberId ?? undefined, generatedBy: record.generatedBy };
}
