import { z } from 'zod';

export const validateSessionOtpSchema = z.object({
  otp: z.string().length(6).regex(/^\d{6}$/),
  memberId: z.string().min(1).max(30),
});

export const checkEligibilitySchema = z.object({
  memberRef: z.string().min(3).max(30).regex(/^[A-Z0-9/\-]+$/, 'Invalid member reference format'),
});
