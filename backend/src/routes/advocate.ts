import { Router, Response } from 'express';
import { db } from '../config/database';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { generateSessionOTP } from '../services/otp.service';
import { logAudit } from '../services/audit.service';
import { sendEmail, sendOtpEmail, createInAppNotification } from '../services/notification.service';
import { z } from 'zod';
import { Role, OtpGeneratedBy, ProviderStatus } from '@prisma/client';

const router = Router();
router.use(requireAuth, requireRole(Role.ADVOCATE), apiRateLimiter);

const memberSearchSchema = z.object({ q: z.string().min(2).max(50), page: z.string().regex(/^\d+$/).default('1').transform(Number) });
const fwaCaseQuerySchema = z.object({ status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED']).optional(), page: z.string().regex(/^\d+$/).default('1').transform(Number) });

// GET /api/advocate/dashboard
router.get('/dashboard', async (_req: AuthRequest, res: Response): Promise<void> => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalToday, activeMembers, openFwaCases, activeProviders] = await Promise.all([
    db.session.count({ where: { sessionDate: { gte: today } } }),
    db.member.count({ where: { isActive: true, role: Role.ENROLLEE } }),
    db.fwaCase.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    db.provider.count({ where: { status: ProviderStatus.ACTIVE } }),
  ]);

  const topGyms = await db.session.groupBy({ by: ['providerId'], where: { sessionDate: { gte: monthStart } }, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5 });
  const gymIds = topGyms.map((g) => g.providerId);
  const gymDetails = await db.provider.findMany({ where: { id: { in: gymIds } }, select: { id: true, gymName: true, location: true } });
  const topGymsWithNames = topGyms.map((g) => ({ ...g, gym: gymDetails.find((d) => d.id === g.providerId) }));

  const recentFwaFlags = await db.fwaCase.findMany({
    where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { provider: { select: { gymName: true } } },
  });

  res.json({ stats: { totalToday, activeMembers, openFwaCases, activeProviders }, topGyms: topGymsWithNames, recentFwaFlags });
});

// GET /api/advocate/members
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
    skip: (page - 1) * limit, take: limit,
    select: { id: true, memberRef: true, firstName: true, lastName: true, phone: true, isActive: true, sessionsUsed: true, sessionsPerMonth: true, planType: true },
  });
  res.json({ members });
});

// GET /api/advocate/members/:id — 360° view
router.get('/members/:id', async (_req: AuthRequest, res: Response): Promise<void> => {
  const { id } = _req.params;
  const member = await db.member.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { sessionDate: 'desc' }, take: 30, include: { provider: { select: { gymName: true, location: true } } } },
      ratings: { select: { rating: true, createdAt: true } },
      topUps: { orderBy: { createdAt: 'desc' }, take: 10 },
      otpRecords: { where: { purpose: 'SESSION' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, generatedBy: true, createdAt: true, usedAt: true, expiresAt: true, ipAddress: true } },
    },
  });
  if (!member) { res.status(404).json({ error: 'Member not found', code: 'NOT_FOUND' }); return; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { refreshTokens: _, ...safe } = member as typeof member & { refreshTokens?: unknown };
  res.json({ member: safe });
});

// POST /api/advocate/generate-otp-for-member — advocate generates and emails OTP to member+provider
const advocateOtpSchema = z.object({
  memberId: z.string().cuid(),
  gymCode: z.string().min(3).max(20),
});
router.post('/generate-otp-for-member', validate(advocateOtpSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const advocateId = req.user!.sub;
  const { memberId, gymCode } = req.body as { memberId: string; gymCode: string };
  const ip = req.ip ?? 'unknown';

  const [member, gym, advocate] = await Promise.all([
    db.member.findUnique({ where: { id: memberId }, select: { id: true, firstName: true, lastName: true, phone: true, email: true, sessionsUsed: true, sessionsPerMonth: true } }),
    db.provider.findUnique({ where: { gymCode }, select: { id: true, gymName: true, email: true } }),
    db.member.findUnique({ where: { id: advocateId }, select: { firstName: true, lastName: true } }),
  ]);

  if (!member || !gym) { res.status(404).json({ error: 'Member or gym not found', code: 'NOT_FOUND' }); return; }
  if (member.sessionsUsed >= member.sessionsPerMonth) { res.status(400).json({ error: 'Member has reached session limit', code: 'SESSION_LIMIT_REACHED' }); return; }

  const { otp, expiresAt } = await generateSessionOTP(member.id, member.phone, ip);

  await db.otpRecord.updateMany({
    where: { memberId: member.id, purpose: 'SESSION', usedAt: null, expiresAt: { gt: new Date() } },
    data: { generatedBy: OtpGeneratedBy.ADVOCATE, generatedById: advocateId },
  });

  const advocateName = `${advocate?.firstName ?? ''} ${advocate?.lastName ?? ''}`.trim();

  // Send to member AND provider simultaneously (as per brief)
  const promises: Promise<unknown>[] = [];
  if (member.email) promises.push(sendOtpEmail(member.email, otp, `${member.firstName} ${member.lastName}`, gym.gymName, 'ADVOCATE'));
  if (gym.email) {
    promises.push(sendEmail({
      to: gym.email, subject: `Member OTP — ${member.firstName} ${member.lastName}`,
      body: `A Leadway Advocate (${advocateName}) has generated an OTP for member ${member.firstName} ${member.lastName} (ref: ${member.phone}).\n\nOTP: ${otp}\nExpires: ${expiresAt.toISOString()}\n\nPlease use this to validate their session.`,
      emailType: 'ADVOCATE_OTP_TO_PROVIDER', senderId: advocateId, senderName: advocateName,
    }));
  }
  await Promise.allSettled(promises);

  await logAudit({
    userId: advocateId, userRole: 'ADVOCATE', action: 'ADVOCATE_OTP_GENERATED_FOR_MEMBER',
    resource: 'advocate', resourceId: member.id, ipAddress: ip, status: 'SUCCESS',
    details: { memberRef: member.phone, gymCode, advocateName },
  });

  res.json({ message: 'OTP generated and emailed to member and provider', expiresAt, member: { name: `${member.firstName} ${member.lastName}` }, gym: { name: gym.gymName } });
});

// POST /api/advocate/send-gym-email — send gym network info to member
const gymEmailSchema = z.object({
  memberId: z.string().cuid(),
  subject: z.string().min(3).max(200),
  body: z.string().min(10).max(5000),
});
router.post('/send-gym-email', validate(gymEmailSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const advocateId = req.user!.sub;
  const { memberId, subject, body } = req.body as { memberId: string; subject: string; body: string };

  const [member, advocate] = await Promise.all([
    db.member.findUnique({ where: { id: memberId }, select: { email: true, firstName: true } }),
    db.member.findUnique({ where: { id: advocateId }, select: { firstName: true, lastName: true } }),
  ]);

  if (!member?.email) { res.status(400).json({ error: 'Member has no email on file', code: 'NO_EMAIL' }); return; }

  const advocateName = `${advocate?.firstName ?? ''} ${advocate?.lastName ?? ''}`.trim();

  await sendEmail({
    to: member.email, subject, body,
    emailType: 'GYM_NETWORK_INFO',
    senderId: advocateId, senderName: advocateName,
    recipientId: memberId,
  });

  res.json({ message: 'Email sent and logged successfully' });
});

// GET /api/advocate/providers — gym network with status management
router.get('/providers', async (_req: AuthRequest, res: Response): Promise<void> => {
  const providers = await db.provider.findMany({
    orderBy: { gymName: 'asc' },
    include: {
      _count: { select: { sessions: true, claims: true, fwaCases: true } },
    },
  });
  res.json({ providers });
});

// PATCH /api/advocate/providers/:id/status — update provider status
const providerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_REVIEW']),
  note: z.string().max(500).optional(),
});
router.patch('/providers/:id/status', validate(providerStatusSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const advocateId = req.user!.sub;
  const { id } = req.params;
  const { status, note } = req.body as { status: ProviderStatus; note?: string };

  await db.provider.update({ where: { id }, data: { status, statusNote: note } });

  await logAudit({
    userId: advocateId, userRole: 'ADVOCATE', action: 'PROVIDER_STATUS_CHANGE',
    resource: 'provider', resourceId: id, ipAddress: req.ip ?? 'unknown', status: 'SUCCESS',
    details: { newStatus: status, note },
  });

  res.json({ message: `Provider status updated to ${status}` });
});

// GET /api/advocate/fwa
router.get('/fwa', validateQuery(fwaCaseQuerySchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, page } = req.query as unknown as { status?: string; page: number };
  const limit = 20;
  const where = status ? { status: status as 'OPEN' } : {};
  const [cases, total] = await Promise.all([
    db.fwaCase.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { provider: { select: { gymName: true, location: true } } } }),
    db.fwaCase.count({ where }),
  ]);
  res.json({ cases, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// PATCH /api/advocate/fwa/:id/close — close case + auto-reverse claim
const closeFwaSchema = z.object({
  resolution: z.string().min(10).max(2000),
  reverseClaimm: z.boolean().default(true),
});
router.patch('/fwa/:id/close', validate(closeFwaSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const advocateId = req.user!.sub;
  const { id } = req.params;
  const { resolution, reverseClaimm: reverseClaim } = req.body as { resolution: string; reverseClaimm: boolean };

  const fwaCase = await db.fwaCase.findUnique({ where: { id }, include: { session: { include: { claim: true } } } });
  if (!fwaCase) { res.status(404).json({ error: 'FWA case not found', code: 'NOT_FOUND' }); return; }
  if (fwaCase.status === 'RESOLVED') { res.status(400).json({ error: 'Case already resolved', code: 'ALREADY_RESOLVED' }); return; }

  await db.$transaction(async (tx) => {
    await tx.fwaCase.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedBy: advocateId, resolvedAt: new Date(), resolution, claimReversed: reverseClaim },
    });

    // Auto-reverse the linked claim if present and requested
    if (reverseClaim && fwaCase.session?.claim) {
      await tx.claim.update({
        where: { id: fwaCase.session.claim.id },
        data: { status: 'REVERSED', reversedAt: new Date(), reversalNote: `FWA case ${fwaCase.caseRef} resolved — ${resolution}` },
      });
      // Update session status
      if (fwaCase.sessionId) {
        await tx.session.update({ where: { id: fwaCase.sessionId }, data: { status: 'CANCELLED' } });
      }
    }
  });

  // Notify member
  if (fwaCase.memberId) {
    createInAppNotification(fwaCase.memberId, 'FWA Case Resolved', `Case ${fwaCase.caseRef} has been resolved. ${reverseClaim ? 'The associated claim has been reversed.' : ''}`).catch(() => {});
  }

  await logAudit({
    userId: advocateId, userRole: 'ADVOCATE', action: 'FWA_CASE_CLOSED',
    resource: 'advocate', resourceId: id, ipAddress: req.ip ?? 'unknown', status: 'SUCCESS',
    details: { caseRef: fwaCase.caseRef, reverseClaim, resolution },
  });

  res.json({ message: `Case ${fwaCase.caseRef} resolved${reverseClaim ? ' and claim reversed' : ''}` });
});

// GET /api/advocate/communication-log
router.get('/communication-log', async (req: AuthRequest, res: Response): Promise<void> => {
  const page = Number(req.query['page'] ?? 1);
  const limit = 30;
  const [logs, total] = await Promise.all([
    db.communicationLog.findMany({ orderBy: { sentAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    db.communicationLog.count(),
  ]);
  res.json({ logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/advocate/reports/utilisation
router.get('/reports/utilisation', async (_req: AuthRequest, res: Response): Promise<void> => {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [sessionsByGym, claimsByStatus, totalSessions, planBreakdown] = await Promise.all([
    db.session.groupBy({ by: ['providerId'], where: { sessionDate: { gte: monthStart } }, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    db.claim.groupBy({ by: ['status'], _count: { id: true }, _sum: { amount: true } }),
    db.session.count({ where: { sessionDate: { gte: monthStart } } }),
    db.member.groupBy({ by: ['planType'], where: { role: 'ENROLLEE', isActive: true }, _count: { id: true } }),
  ]);
  res.json({ sessionsByGym, claimsByStatus, totalSessions, planBreakdown });
});

export default router;
