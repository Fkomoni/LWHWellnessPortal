import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode ?? 500;

  logger.error('Unhandled error', {
    message: err.message,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Never expose stack traces or internal details in production
  res.status(statusCode).json({
    error: statusCode === 500 ? 'An internal server error occurred' : err.message,
    code: err.code ?? 'INTERNAL_ERROR',
    ...(env.NODE_ENV !== 'production' && statusCode === 500 && { debug: err.message }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'Resource not found', code: 'NOT_FOUND' });
}
