import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, json, colorize, simple } = winston.format;

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp(), json()),
  defaultMeta: { service: 'lwh-wellness-api' },
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'production' ? combine(timestamp(), json()) : combine(colorize(), simple()),
    }),
  ],
});

// Structured audit event — always goes to info level for SIEM ingestion
export function auditEvent(params: {
  action: string;
  userId?: string;
  userRole?: string;
  resource: string;
  resourceId?: string;
  ipAddress: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: Record<string, unknown>;
}) {
  logger.info('AUDIT', { ...params, type: 'AUDIT_EVENT' });
}
