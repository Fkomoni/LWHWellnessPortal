import { z } from 'zod';

export const generateSessionOtpSchema = z.object({
  gymCode: z.string().min(3).max(20).regex(/^[A-Z0-9-]+$/, 'Invalid gym code'),
});

export const rateGymSchema = z.object({
  sessionId: z.string().cuid('Invalid session ID'),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).default('1').transform(Number),
  limit: z.string().regex(/^\d+$/).default('20').transform((v) => Math.min(Number(v), 50)),
});
