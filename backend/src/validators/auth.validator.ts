import { z } from 'zod';

// Nigerian phone numbers: +234XXXXXXXXXX or 080XXXXXXXX
const phoneRegex = /^(\+?234|0)[7-9][01]\d{8}$/;

export const requestOtpSchema = z.object({
  phone: z
    .string()
    .regex(phoneRegex, 'Enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678)')
    .transform((p) => p.replace(/^0/, '+234')), // normalise to E.164
  role: z.enum(['ENROLLEE', 'PROVIDER', 'ADVOCATE']),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(phoneRegex).transform((p) => p.replace(/^0/, '+234')),
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  role: z.enum(['ENROLLEE', 'PROVIDER', 'ADVOCATE']),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});
