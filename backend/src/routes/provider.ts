import { Router, Response } from 'express';
import { db } from '../config/database';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { generateSessionOTP } from '../services/otp.service';
import { verifySessionOTP } from '../services/otp.service';
import { logAudit } from '../services/audit.service';
import { sendSessionConfirmationWhatsApp, sendFwaAlertToProvider, sendOtpEmail } from '../services/notification.service';
import { generatePayAdvice } from '../services/pdf.service';
import { validateSessionOtpSchema, checkEligibilitySchema } from '../validators/provider.validator';
import { z } from 'zod';
import { Role, SessionStatus, OtpGeneratedBy } from '@prisma/client';

const router = Router();

router.use(requireAuth, requireRole(Role.PROVIDER), apiRateLimiter);

// GET /api/provider/dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response): Promise<void> => {
  const providerId = req.user!.sub;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todaySessions, monthSessions, pendingClaims, recentSessions, fwaAlerts] = await Promise.all([
    db.session.count({ where: { providerId, sessionDate: { gte: today } } }),
    db.session.count({ where: { providerId, sessionDate: { gte: monthStart } } }),
    db.claim.count({ where: { providerId, status: 'PENDING' } }),
    db.session.findMany({
      where: { providerId, sessionDate: { gte: today } },
      orderBy: { sessionDate: 'desc' },
      take: 20,
      include: { member: { select: { firstName: true, lastName: true, memberRef: true } } },
    }),
    db.fwaCase.findMany({
      where: { providerId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const pendingAmount = await db.claim.aggregate({ where: { providerId, status: 'PENDING' }, _sum: { amount: true } });

  res.json({
    stats: { todaySessions, monthSessions, pendingClaims, pendingAmount: pendingAmount._sum.amount ?? 0 },
    recentSessions, fwaAlerts,
  });
});

// POST /api/provider/validate-session
router.post(
  '/validate-session',
  validate(validateSessionOtpSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const providerId = req.user!.sub;
    const { otp, memberId: memberRef } = req.body as { otp: string; memberId: string };
    const ip = req.ip ?? 'unknown';

    const member = await db.member.findFirst({
      where: { memberRef, isActive: true },
      select: { id: true, firstName: true, lastName: true, memberRef: true, phone: true, sessionsUsed: true, sessionsPerMonth: true },
    });

    if (!member) {
      await logAudit({ userId: providerId, userRole: 'PROVIDER', action: 'SESSION_VALIDATE', resource: 'provider', ipAddress: ip, status: 'FAILURE', details: { reason: 'MEMBER_NOT_FOUND', memberRef } });
      res.status(404).json({ error: 'Member not found or inactive', code: 'MEMBER_NOT_FOUND' });
      return;
    }

    if (member.sessionsUsed >= member.sessionsPerMonth) {
      res.status(400).json({ error: 'Member has reached monthly session limit', code: 'SESSION_LIMIT_REACHED' });
      return;
    }

    const otpResult = await verifySessionOTP(otp, true);

    if (!otpResult.valid || otpResult.memberId !== member.id) {
      await logAudit({ userId: providerId, userRole: 'PROVIDER', action: 'SESSION_VALIDATE', resource: 'provider', ipAddress: ip, status: 'FAILURE', details: { reason: otpResult.reason, memberRef } });
      res.status(401).json({ error: 'Invalid or expired OTP', code: 'OTP_INVALID' });
      return;
    }

    const provider = await db.provider.findUnique({ where: { id: providerId }, select: { gymName: true } });

    const session = await db.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          memberId: member.id, providerId,
          sessionOtpId: otpResult.otpId!,
          generatedBy: otpResult.generatedBy ?? OtpGeneratedBy.MEMBER,
          status: SessionStatus.CONFIRMED,
        },
      });
      await tx.member.update({ where: { id: member.id }, data: { sessionsUsed: { increment: 1 } } });
      await tx.claim.create({ data: { sessionId: s.id, providerId, amount: 1500 } });
      return s;
    });

    // Send WhatsApp confirmation to member (async — don't await)
    sendSessionConfirmationWhatsApp(member.phone, provider?.gymName ?? 'the gym', session.id).catch(() => {});

    await logAudit({ userId: providerId, userRole: 'PROVIDER', action: 'SESSION_VALIDATE', resource: 'provider', resourceId: session.id, ipAddress: ip, status: 'SUCCESS', details: { memberRef } });

    res.json({
      message: 'Session validated successfully',
      session: { id: session.id, memberName: `${member.firstName} ${member.lastName}`, status: 'CONFIRMED' },
    });
  },
);

// POST /api/provider/generate-otp-for-member — member present but cannot self-generate
const generateForMemberSchema = z.object({
  memberRef: z.string().min(3).max(30),
});
router.post(
  '/generate-otp-for-member',
  validate(generateForMemberSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const providerId = req.user!.sub;
    const { memberRef } = req.body as { memberRef: string };
    const ip = req.ip ?? 'unknown';

    const member = await db.member.findFirst({
      where: { memberRef, isActive: true },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, sessionsUsed: true, sessionsPerMonth: true },
    });

    if (!member) { res.status(404).json({ error: 'Member not found', code: 'NOT_FOUND' }); return; }
    if (member.sessionsUsed >= member.sessionsPerMonth) {
      res.status(400).json({ error: 'Member has reached monthly session limit', code: 'SESSION_LIMIT_REACHED' });
      return;
    }

    const provider = await db.provider.findUnique({ where: { id: providerId }, select: { gymName: true, gymCode: true } });

    const { otp, expiresAt } = await generateSessionOTP(member.id, member.phone, ip);

    // Flag OTP as provider-generated in otp_records
    await db.otpRecord.updateMany({
      where: { memberId: member.id, purpose: 'SESSION', usedAt: null, expiresAt: { gt: new Date() } },
      data: { generatedBy: OtpGeneratedBy.PROVIDER, generatedById: providerId },
    });

    await logAudit({
      userId: providerId, userRole: 'PROVIDER', action: 'PROVIDER_OTP_GENERATED_FOR_MEMBER',
      resource: 'provider', resourceId: member.id, ipAddress: ip, status: 'SUCCESS',
      details: { memberRef, gymCode: provider?.gymCode },
    });

    // Send OTP to member via WhatsApp
    if (member.email) {
      sendOtpEmail(member.email, otp, `${member.firstName} ${member.lastName}`, provider?.gymName ?? 'the gym', 'PROVIDER').catch(() => {});
    }

    res.json({
      otp, expiresAt,
      note: 'This OTP has been flagged as provider-generated in the audit trail.',
      member: { name: `${member.firstName} ${member.lastName}`, ref: memberRef },
    });
  },
);

// POST /api/provider/check-eligibility
router.post('/check-eligibility', validate(checkEligibilitySchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const { memberRef } = req.body as { memberRef: string };

  const member = await db.member.findFirst({
    where: { memberRef, isActive: true },
    select: { id: true, firstName: true, lastName: true, memberRef: true, sessionsPerMonth: true, sessionsUsed: true, resetDate: true },
  });

  if (!member) { res.json({ eligible: false, reason: 'Member not found or coverage inactive' }); return; }

  const sessionsRemaining = member.sessionsPerMonth - member.sessionsUsed;
  res.json({
    eligible: sessionsRemaining > 0,
    member: {
      name: `${member.firstName} ${member.lastName}`,
      memberRef: member.memberRef,
      sessionsRemaining,
      sessionsPerMonth: member.sessionsPerMonth,
      resetDate: member.resetDate,
    },
  });
});

// GET /api/provider/claims
const claimsQuerySchema = z.object({
  status: z.enum(['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVERSED']).optional(),
  page: z.string().regex(/^\d+$/).default('1').transform(Number),
});
router.get('/claims', async (req: AuthRequest, res: Response): Promise<void> => {
  const providerId = req.user!.sub;
  const page = Number(req.query['page'] ?? 1);
  const status = req.query['status'] as string | undefined;
  const limit = 50;

  const where = { providerId, ...(status ? { status: status as 'PENDING' } : {}) };

  const [claims, total, summary] = await Promise.all([
    db.claim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        session: {
          include: { member: { select: { firstName: true, lastName: true, memberRef: true } } },
        },
      },
    }),
    db.claim.count({ where }),
    db.claim.groupBy({ by: ['status'], where: { providerId }, _count: { id: true }, _sum: { amount: true } }),
  ]);

  res.json({ claims, summary, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// POST /api/provider/claims/submit — batch submit pending claims
router.post('/claims/submit', async (req: AuthRequest, res: Response): Promise<void> => {
  const providerId = req.user!.sub;

  const pendingClaims = await db.claim.findMany({ where: { providerId, status: 'PENDING' }, select: { id: true } });

  if (pendingClaims.length === 0) {
    res.status(400).json({ error: 'No pending claims to submit', code: 'NO_PENDING_CLAIMS' });
    return;
  }

  await db.claim.updateMany({
    where: { id: { in: pendingClaims.map((c) => c.id) }, providerId },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });

  await logAudit({
    userId: providerId, userRole: 'PROVIDER', action: 'CLAIMS_BATCH_SUBMIT',
    resource: 'provider', ipAddress: req.ip ?? 'unknown', status: 'SUCCESS',
    details: { count: pendingClaims.length },
  });

  res.json({ message: `${pendingClaims.length} claims submitted successfully`, count: pendingClaims.length });
});

// POST /api/provider/claims/pay-advice — generate pay advice PDF
router.post('/claims/pay-advice', async (req: AuthRequest, res: Response): Promise<void> => {
  const providerId = req.user!.sub;
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const result = await generatePayAdvice(providerId, periodStart, periodEnd);

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${result.reference}.txt"`);
  res.send(result.content);
});

export default router;
