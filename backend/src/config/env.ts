import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('3001'),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  OTP_EXPIRY_MINUTES: z.string().regex(/^\d+$/).default('120'),
  OTP_MAX_ATTEMPTS: z.string().regex(/^\d+$/).default('5'),
  SESSION_OTP_LENGTH: z.string().regex(/^\d+$/).default('6'),
  BCRYPT_ROUNDS: z.string().regex(/^\d+$/).default('12'),
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).default('900000'),
  RATE_LIMIT_AUTH_MAX: z.string().regex(/^\d+$/).default('5'),
  RATE_LIMIT_API_MAX: z.string().regex(/^\d+$/).default('100'),
  SESSION_IDLE_TIMEOUT_MINUTES: z.string().regex(/^\d+$/).default('30'),
  // WhatsApp
  WHATSAPP_API_URL: z.string().url().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_FROM_NUMBER: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
  // Email
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_FROM_NAME: z.string().default('Leadway Wellness Portal'),
  // Payment
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  // Maps
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  // App URL for email links
  APP_URL: z.string().url().default('http://localhost:5173'),
  // Dev only
  OTP_VISIBLE_IN_DEV: z.string().default('false'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:');
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
