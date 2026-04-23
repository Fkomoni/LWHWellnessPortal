import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { logAudit } from '../services/audit.service';

export function auditMiddleware(action: string, resource: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalSend = res.json.bind(res);

    res.json = function (body) {
      const status = res.statusCode < 400 ? 'SUCCESS' : 'FAILURE';
      logAudit({
        userId: req.user?.sub,
        userRole: req.user?.role,
        action,
        resource,
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'],
        status,
      }).catch(() => {/* fire-and-forget */});
      return originalSend(body);
    };

    next();
  };
}
