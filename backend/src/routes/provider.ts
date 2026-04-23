import { Router, Response } from 'express';
import { db } from '../config/database';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { verifySessionOTP } from '../services/otp.service';
import { logAudit } from '../services/audit.service';
import { validateSessionOtpSchema, checkEligibilitySchema } from '../validators/provider.validator';
import { Role, SessionStatus } from '@prisma/client';

const router = Router();

router.use(requireAuth, requireRole(Role.PROVIDER), apiRateLimiter);

// GET /api/provider/dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response): Promise<void> => {
  const providerId = req.user!.sub;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todaySessions, monthSessions, pendingClaims, recentSessions, fwaAlerts] = await Promise.all([
    db.session.count({ where: { providerId, sessionDate: { gte: today } } }),
    db.session.count({ where: { providerId, sessionDate: { gte: monthStart } } }),
    db.claim.count({ where: { providerId, status: 'PENDING' } }),
    db.session.findMany({
      where: { providerId, sessionDate: { gte: today } },
      orderBy: { sessionDate: 'desc' },
      take: 20,
      include: {
        member: { select: { firstName: true, lastName: true, memberRef: true } },
      },
    }),
    db.fwaCase.findMany({
      where: { providerId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const pendingAmount = await db.claim.aggregate({
    where: { providerId, status: 'PENDING' },
    _sum: { amount: true },
  });

  res.json({
    stats: {
      todaySessions,
      monthSessions,
      pendingClaims,
      pendingAmount: pendingAmount._sum.amount ?? 0,
    },
    recentSessions,
    fwaAlerts,
  });
});

// POST /api/provider/validate-session — validate enrollee session OTP
router.post(
  '/validate-session',
  validate(validateSessionOtpSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const providerId = req.user!.sub;
    const { otp, memberId: memberRef } = req.body as { otp: string; memberId: string };
    const ip = req.ip ?? 'unknown';

    const member = await db.member.findFirst({
      where: { memberRef, isActive: true },
      select: { id: true, firstName: true, lastName: true, memberRef: true, sessionsUsed: true, sessionsPerMonth: true },
    });

    if (!member) {
      await logAudit({ userId: providerId, userRole: 'PROVIDER', action: 'SESSION_VALIDATE', resource: 'provider', ipAddress: ip, status: 'FAILURE', details: { reason: 'MEMBER_NOT_FOUND', memberRef } });
      res.status(404).json({ error: 'Member not found or inactive', code: 'MEMBER_NOT_FOUND' });
      return;
    }

    const otpResult = await verifySessionOTP(otp, true);

    if (!otpResult.valid || otpResult.memberId !== member.id) {
      await logAudit({ userId: providerId, userRole: 'PROVIDER', action: 'SESSION_VALIDATE', resource: 'provider', ipAddress: ip, status: 'FAILURE', details: { reason: otpResult.reason, memberRef } });
      res.status(401).json({ error: 'Invalid or expired OTP', code: 'OTP_INVALID' });
      return;
    }

    if (member.sessionsUsed >= member.sessionsPerMonth) {
      res.status(400).json({ error: 'Member has reached monthly session limit', code: 'SESSION_LIMIT_REACHED' });
      return;
    }

    // Create session record & increment member session count in a transaction
    const session = await db.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          memberId: member.id,
          providerId,
          sessionOtpId: otpResult.otpId!,
          status: SessionStatus.CONFIRMED,
        },
      });
      await tx.member.update({ where: { id: member.id }, data: { sessionsUsed: { increment: 1 } } });
      await tx.claim.create({ data: { sessionId: s.id, providerId, amount: 1500 } }); // ₦1,500 per session
      return s;
    });

    await logAudit({ userId: providerId, userRole: 'PROVIDER', action: 'SESSION_VALIDATE', resource: 'provider', resourceId: session.id, ipAddress: ip, status: 'SUCCESS', details: { memberRef } });

    res.json({
      message: 'Session validated successfully',
      session: { id: session.id, memberName: `${member.firstName} ${member.lastName}`, status: 'CONFIRMED' },
    });
  },
);

// POST /api/provider/check-eligibility
router.post(
  '/check-eligibility',
  validate(checkEligibilitySchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { memberRef } = req.body as { memberRef: string };

    const member = await db.member.findFirst({
      where: { memberRef, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        memberRef: true,
        sessionsPerMonth: true,
        sessionsUsed: true,
        resetDate: true,
      },
    });

    if (!member) {
      res.json({ eligible: false, reason: 'Member not found or coverage inactive' });
      return;
    }

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
  },
);

// GET /api/provider/claims
router.get('/claims', async (req: AuthRequest, res: Response): Promise<void> => {
  const providerId = req.user!.sub;

  const claims = await db.claim.findMany({
    where: { providerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      session: {
        include: { member: { select: { firstName: true, lastName: true, memberRef: true } } },
      },
    },
  });

  res.json({ claims });
});

export default router;
