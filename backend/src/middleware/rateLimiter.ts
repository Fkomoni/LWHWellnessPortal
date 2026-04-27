import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const windowMs = parseInt(env.RATE_LIMIT_WINDOW_MS, 10);

// Strict limit for authentication endpoints (OTP request + verify)
export const authRateLimiter = rateLimit({
  windowMs,
  max: parseInt(env.RATE_LIMIT_AUTH_MAX, 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  keyGenerator: (req) => {
    // Key on IP + phone combination to prevent distributed attacks
    const phone = (req.body as { phone?: string }).phone ?? '';
    return `${req.ip}:${phone}`;
  },
});

// General API rate limit
export const apiRateLimiter = rateLimit({
  windowMs,
  max: parseInt(env.RATE_LIMIT_API_MAX, 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

// DOB login — keyed on IP + memberRef to resist credential-stuffing per member
export const dobAuthRateLimiter = rateLimit({
  windowMs,
  max: parseInt(env.RATE_LIMIT_AUTH_MAX, 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  keyGenerator: (req) => {
    const memberRef = (req.body as { memberRef?: string }).memberRef ?? '';
    return `${req.ip}:${memberRef}`;
  },
});

// OTP generation — very strict (1 per 60 seconds per IP)
export const otpGenerateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Please wait 60 seconds before requesting another OTP.',
    code: 'OTP_TOO_FREQUENT',
  },
});
