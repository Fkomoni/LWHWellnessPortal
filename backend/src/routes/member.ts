import { Router, Response } from 'express';
import { db } from '../config/database';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { auditMiddleware } from '../middleware/auditLog';
import { apiRateLimiter, otpGenerateRateLimiter } from '../middleware/rateLimiter';
import { generateSessionOTP } from '../services/otp.service';
import { logAudit } from '../services/audit.service';
import { createInAppNotification } from '../services/notification.service';
import { initializePayment, verifyPayment, getAllPlans } from '../services/payment.service';
import { generateSessionOtpSchema, rateGymSchema, paginationSchema } from '../validators/member.validator';
import { z } from 'zod';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth, requireRole(Role.ENROLLEE), apiRateLimiter);

// GET /api/member/dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response): Promise<void> => {
  const memberId = req.user!.sub;

  const member = await db.member.findUnique({
    where: { id: memberId },
    select: {
      id: true, firstName: true, lastName: true, memberRef: true,
      sessionsPerMonth: true, sessionsUsed: true, resetDate: true,
      spouseId: true, email: true, planType: true,
    },
  });

  if (!member) { res.status(404).json({ error: 'Member not found', code: 'NOT_FOUND' }); return; }

  let spouse = null;
  if (member.spouseId) {
    spouse = await db.member.findUnique({
      where: { id: member.spouseId },
      select: { firstName: true, lastName: true, sessionsUsed: true, sessionsPerMonth: true },
    });
  }

  const recentSessions = await db.session.findMany({
    where: { memberId },
    orderBy: { sessionDate: 'desc' },
    take: 5,
    include: { provider: { select: { gymName: true, location: true } } },
  });

  const nearbyGyms = await db.provider.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, gymName: true, location: true, lga: true, latitude: true, longitude: true, amenities: true, hours: true },
    take: 20,
  });

  const unreadCount = await db.notification.count({ where: { memberId, readAt: null } });

  res.json({
    member: { ...member, sessionsRemaining: member.sessionsPerMonth - member.sessionsUsed },
    spouse,
    recentSessions,
    nearbyGyms,
    unreadNotifications: unreadCount,
  });
});

// POST /api/member/generate-otp
router.post(
  '/generate-otp',
  otpGenerateRateLimiter,
  validate(generateSessionOtpSchema),
  auditMiddleware('SESSION_OTP_GENERATE', 'member'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const memberId = req.user!.sub;
    const { gymCode } = req.body as { gymCode: string };
    const ip = req.ip ?? 'unknown';

    const [member, gym] = await Promise.all([
      db.member.findUnique({
        where: { id: memberId },
        select: { phone: true, email: true, firstName: true, sessionsPerMonth: true, sessionsUsed: true, isActive: true },
      }),
      db.provider.findUnique({ where: { gymCode }, select: { id: true, gymName: true, status: true } }),
    ]);

    if (!member?.isActive) { res.status(403).json({ error: 'Account inactive', code: 'ACCOUNT_INACTIVE' }); return; }
    if (!gym || gym.status !== 'ACTIVE') { res.status(404).json({ error: 'Gym not found or inactive', code: 'GYM_NOT_FOUND' }); return; }
    if (member.sessionsUsed >= member.sessionsPerMonth) {
      res.status(400).json({ error: 'Monthly session limit reached. Top up to continue.', code: 'SESSION_LIMIT_REACHED' });
      return;
    }

    const { otp, expiresAt } = await generateSessionOTP(memberId, member.phone, ip);

    await logAudit({
      userId: memberId, userRole: 'ENROLLEE', action: 'SESSION_OTP_GENERATE',
      resource: 'member', resourceId: gym.id, ipAddress: ip,
      status: 'SUCCESS', details: { gymCode, gymName: gym.gymName },
    });

    res.json({
      otp, expiresAt,
      gym: { name: gym.gymName, code: gymCode },
      message: 'Show this OTP to the gym receptionist. Valid for 2 hours.',
    });
  },
);

// GET /api/member/sessions
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
  const { sessionId, rating, comment } = req.body as { sessionId: string; rating: number; comment?: string };

  const session = await db.session.findUnique({ where: { id: sessionId, memberId }, select: { id: true, providerId: true } });
  if (!session) { res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' }); return; }

  const existing = await db.gymRating.findUnique({ where: { sessionId } });
  if (existing) { res.status(409).json({ error: 'Already rated this session', code: 'ALREADY_RATED' }); return; }

  await db.gymRating.create({ data: { memberId, sessionId, providerId: session.providerId, rating, comment } });
  res.json({ message: 'Rating submitted. Thank you!' });
});

// GET /api/member/gyms — gym finder
router.get('/gyms', async (_req: AuthRequest, res: Response): Promise<void> => {
  const gyms = await db.provider.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, gymCode: true, gymName: true, location: true, address: true,
      lga: true, state: true, latitude: true, longitude: true, amenities: true, hours: true,
    },
    orderBy: { gymName: 'asc' },
  });
  res.json({ gyms });
});

// GET /api/member/notifications
router.get('/notifications', async (req: AuthRequest, res: Response): Promise<void> => {
  const memberId = req.user!.sub;
  const notifications = await db.notification.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json({ notifications });
});

// PATCH /api/member/notifications/:id/read
router.patch('/notifications/:id/read', async (req: AuthRequest, res: Response): Promise<void> => {
  const memberId = req.user!.sub;
  await db.notification.updateMany({
    where: { id: req.params['id'], memberId },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

// PATCH /api/member/notifications/read-all
router.patch('/notifications/read-all', async (req: AuthRequest, res: Response): Promise<void> => {
  const memberId = req.user!.sub;
  await db.notification.updateMany({ where: { memberId, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

// GET /api/member/top-up/plans
router.get('/top-up/plans', (_req: AuthRequest, res: Response): void => {
  res.json({ plans: getAllPlans() });
});

// POST /api/member/top-up/initiate
const initiateTopUpSchema = z.object({
  plan: z.enum(['STANDARD_MONTHLY', 'IFITNESS_MONTHLY', 'IFITNESS_QUARTERLY', 'IFITNESS_ANNUAL', 'ADDITIONAL_SESSION']),
});
router.post('/top-up/initiate', validate(initiateTopUpSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const memberId = req.user!.sub;
  const { plan } = req.body as { plan: string };

  const member = await db.member.findUnique({ where: { id: memberId }, select: { email: true } });
  if (!member?.email) { res.status(400).json({ error: 'Email required for payment', code: 'EMAIL_REQUIRED' }); return; }

  const result = await initializePayment(memberId, plan as Parameters<typeof initializePayment>[1], member.email);
  res.json(result);
});

// GET /api/member/top-up/verify/:reference
router.get('/top-up/verify/:reference', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await verifyPayment(req.params['reference'] ?? '');
  if (result.success) {
    await createInAppNotification(
      req.user!.sub,
      'Top-up Successful',
      `${result.sessions} sessions added to your account.`,
    );
  }
  res.json(result);
});

export default router;
