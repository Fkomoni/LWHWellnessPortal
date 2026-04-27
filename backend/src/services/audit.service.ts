import { Prisma } from '@prisma/client';
import { db } from '../config/database';
import { auditEvent } from '../utils/logger';
import { sanitizeForLog } from '../utils/crypto';

interface AuditParams {
  userId?: string;
  userRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: Record<string, unknown>;
}

export async function logAudit(params: AuditParams): Promise<void> {
  const sanitisedDetails = params.details ? sanitizeForLog(params.details) : undefined;

  // Write to DB (persistent, 7-year NAICOM retention)
  await db.auditLog.create({
    data: {
      userId: params.userId,
      userRole: params.userRole,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      status: params.status,
      details: (sanitisedDetails ?? {}) as Prisma.InputJsonValue,
    },
  }).catch(() => {
    // DB write failure must not break the main flow — log to stdout instead
    auditEvent({ ...params, details: sanitisedDetails });
  });

  // Always emit to logger (for SIEM / log aggregation)
  auditEvent({ ...params, details: sanitisedDetails });
}
