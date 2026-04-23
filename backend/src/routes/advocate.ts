import { Router, Response } from 'express';
import { db } from '../config/database';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth, requireRole(Role.ADVOCATE), apiRateLimiter);

const memberSearchSchema = z.object({
  q: z.string().min(2).max(50),
  page: z.string().regex(/^\d+$/).default('1').transform(Number),
});

const fwaCaseSchema = z.object({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED']).optional(),
  page: z.string().regex(/^\d+$/).default('1').transform(Number),
});

// GET /api/advocate/dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalToday, activeMembers, openFwaCases, activeProviders] = await Promise.all([
    db.session.count({ where: { sessionDate: { gte: today } } }),
    db.member.count({ where: { isActive: true, role: Role.ENROLLEE } }),
    db.fwaCase.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    db.provider.count({ where: { isActive: true } }),
  ]);

  // Top gyms by session volume (current month)
  const topGyms = await db.session.groupBy({
    by: ['providerId'],
    where: { sessionDate: { gte: monthStart } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  const gymIds = topGyms.map((g) => g.providerId);
  const gymDetails = await db.provider.findMany({
    where: { id: { in: gymIds } },
    select: { id: true, gymName: true, location: true },
  });

  const topGymsWithNames = topGyms.map((g) => ({
    ...g,
    gym: gymDetails.find((d) => d.id === g.providerId),
  }));

  // Recent FWA flags
  const recentFwaFlags = await db.fwaCase.findMany({
    where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      provider: { select: { gymName: true } },
    },
  });

  res.json({
    stats: { totalToday, activeMembers, openFwaCases, activeProviders },
    topGyms: topGymsWithNames,
    recentFwaFlags,
  });
});

// GET /api/advocate/members — member 360° search
router.get('/members', validateQuery(memberSearchSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const { q, page } = req.query as unknown as { q: string; page: number };
  const limit = 20;

  const members = await db.member.findMany({
    where: {
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { memberRef: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
      role: Role.ENROLLEE,
    },
    skip: (page - 1) * limit,
    take: limit,
    select: {
      id: true,
      memberRef: true,
      firstName: true,
      lastName: true,
      phone: true,
      isActive: true,
      sessionsUsed: true,
      sessionsPerMonth: true,
    },
  });

  res.json({ members });
});

// GET /api/advocate/members/:id — full member 360° view
router.get('/members/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const member = await db.member.findUnique({
    where: { id },
    include: {
      sessions: {
        orderBy: { sessionDate: 'desc' },
        take: 20,
        include: { provider: { select: { gymName: true, location: true } } },
      },
      ratings: { select: { rating: true, createdAt: true } },
    },
  });

  if (!member) {
    res.status(404).json({ error: 'Member not found', code: 'NOT_FOUND' });
    return;
  }

  // Remove sensitive fields before returning
  const { ...memberData } = member;
  res.json({ member: memberData });
});

// GET /api/advocate/fwa — FWA case list
router.get('/fwa', validateQuery(fwaCaseSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, page } = req.query as unknown as { status?: string; page: number };
  const limit = 20;

  const where = status ? { status: status as 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'ESCALATED' } : {};

  const [cases, total] = await Promise.all([
    db.fwaCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        provider: { select: { gymName: true, location: true } },
      },
    }),
    db.fwaCase.count({ where }),
  ]);

  res.json({ cases, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/advocate/reports/utilisation
router.get('/reports/utilisation', async (_req: AuthRequest, res: Response): Promise<void> => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [sessionsByGym, claimsByStatus, totalSessions] = await Promise.all([
    db.session.groupBy({
      by: ['providerId'],
      where: { sessionDate: { gte: monthStart } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    db.claim.groupBy({ by: ['status'], _count: { id: true }, _sum: { amount: true } }),
    db.session.count({ where: { sessionDate: { gte: monthStart } } }),
  ]);

  res.json({ sessionsByGym, claimsByStatus, totalSessions });
});

export default router;
