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

// Wellness provider login — email + password authenticated upstream by Prognosis.
export const providerLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(256),
});

// Member ID + DOB primary login (ENROLLEE only)
export const loginDobSchema = z.object({
  // Allows the literal '/' Prognosis uses in IDs (e.g. "21000645/0").
  // The raw string is passed to the Prognosis URL without encoding — Zod
  // validation here makes that safe.
  memberRef: z
    .string()
    .regex(/^[A-Za-z0-9/\-]+$/, 'Invalid Member ID format')
    .min(1)
    .max(50)
    .transform((s) => s.trim()),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .transform((s) => new Date(s + 'T00:00:00.000Z')),
});
