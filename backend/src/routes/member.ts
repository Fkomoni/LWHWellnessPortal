import { Router, Response } from 'express';
import { db } from '../config/database';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { auditMiddleware } from '../middleware/auditLog';
import { apiRateLimiter, otpGenerateRateLimiter } from '../middleware/rateLimiter';
import { generateSessionOTP } from '../services/otp.service';
import { logAudit } from '../services/audit.service';
import { generateSessionOtpSchema, rateGymSchema, paginationSchema } from '../validators/member.validator';
import { Role } from '@prisma/client';

const router = Router();

// All member routes require ENROLLEE role
router.use(requireAuth, requireRole(Role.ENROLLEE), apiRateLimiter);

// GET /api/member/dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response): Promise<void> => {
  const memberId = req.user!.sub;

  const member = await db.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      memberRef: true,
      sessionsPerMonth: true,
      sessionsUsed: true,
      resetDate: true,
      spouseId: true,
    },
  });

  if (!member) {
    res.status(404).json({ error: 'Member not found', code: 'NOT_FOUND' });
    return;
  }

  // Get spouse info if applicable
  let spouse = null;
  if (member.spouseId) {
    spouse = await db.member.findUnique({
      where: { id: member.spouseId },
      select: { firstName: true, lastName: true, sessionsUsed: true, sessionsPerMonth: true },
    });
  }

  // Recent sessions
  const recentSessions = await db.session.findMany({
    where: { memberId },
    orderBy: { sessionDate: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      whatsappVerified: true,
      fwaFlagged: true,
      sessionDate: true,
      provider: { select: { gymName: true, location: true } },
      otpRecords: false,
    },
    include: {
      provider: { select: { gymName: true, location: true } },
    },
  });

  // Nearby gyms (simplified — no geolocation for prototype)
  const nearbyGyms = await db.provider.findMany({
    where: { isActive: true },
    select: { id: true, gymName: true, location: true, lga: true },
    take: 10,
  });

  res.json({
    member: {
      ...member,
      sessionsRemaining: member.sessionsPerMonth - member.sessionsUsed,
    },
    spouse,
    recentSessions,
    nearbyGyms,
  });
});

// POST /api/member/generate-otp — generate a session OTP for gym visit
router.post(
  '/generate-otp',
  otpGenerateRateLimiter,
  validate(generateSessionOtpSchema),
  auditMiddleware('SESSION_OTP_GENERATE', 'member'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const memberId = req.user!.sub;
    const { gymCode } = req.body as { gymCode: string };
    const ip = req.ip ?? 'unknown';

    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { phone: true, sessionsPerMonth: true, sessionsUsed: true, isActive: true },
    });

    if (!member || !member.isActive) {
      res.status(403).json({ error: 'Account inactive', code: 'ACCOUNT_INACTIVE' });
      return;
    }

    if (member.sessionsUsed >= member.sessionsPerMonth) {
      res.status(400).json({ error: 'Monthly session limit reached', code: 'SESSION_LIMIT_REACHED' });
      return;
    }

    const gym = await db.provider.findUnique({ where: { gymCode }, select: { id: true, gymName: true } });
    if (!gym) {
      res.status(404).json({ error: 'Gym not found', code: 'GYM_NOT_FOUND' });
      return;
    }

    const { otp, expiresAt } = await generateSessionOTP(memberId, member.phone, ip);

    await logAudit({
      userId: memberId,
      userRole: 'ENROLLEE',
      action: 'SESSION_OTP_GENERATE',
      resource: 'member',
      resourceId: gym.id,
      ipAddress: ip,
      status: 'SUCCESS',
      details: { gymCode, gymName: gym.gymName },
    });

    res.json({
      otp,
      expiresAt,
      gym: { name: gym.gymName, code: gymCode },
      message: 'Show this OTP to the gym receptionist. Valid for 2 hours.',
    });
  },
);

// GET /api/member/sessions — session history with pagination
router.get('/sessions', validateQuery(paginationSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const memberId = req.user!.sub;
  const { page, limit } = req.query as unknown as { page: number; limit: number };

  const [sessions, total] = await Promise.all([
    db.session.findMany({
      where: { memberId },
      orderBy: { sessionDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        provider: { select: { gymName: true, location: true, lga: true } },
        rating: { select: { rating: true } },
      },
    }),
    db.session.count({ where: { memberId } }),
  ]);

  res.json({ sessions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// POST /api/member/rate-gym
router.post('/rate-gym', validate(rateGymSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const memberId = req.user!.sub;
  const { sessionId, rating } = req.body as { sessionId: string; rating: number };

  const session = await db.session.findUnique({
    where: { id: sessionId, memberId },
    select: { id: true, providerId: true },
  });

  if (!session) {
    res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });
    return;
  }

  const existing = await db.gymRating.findUnique({ where: { sessionId } });
  if (existing) {
    res.status(409).json({ error: 'Already rated this session', code: 'ALREADY_RATED' });
    return;
  }

  await db.gymRating.create({
    data: { memberId, sessionId, providerId: session.providerId, rating },
  });

  res.json({ message: 'Rating submitted. Thank you!' });
});

export default router;
