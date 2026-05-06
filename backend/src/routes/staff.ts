import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../config/database';
import { validate } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { logAudit } from '../services/audit.service';
import {
  signStaffAccessToken,
  requireStaff,
  StaffAuthRequest,
} from '../middleware/staffAuth';
import {
  staffLoginSchema,
  respondPrescriptionSchema,
  createPrescriptionSchema,
} from '../validators/staff.validator';
import {
  handleMemberResponse,
  runPickupSweep,
} from '../services/prescription.service';
import { PrescriptionStatus, PrescriptionEventType } from '@prisma/client';

const router = Router();

// ─── Auth ────────────────────────────────────────────────────────────────

// POST /api/staff/auth/login
router.post(
  '/auth/login',
  authRateLimiter,
  validate(staffLoginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as { email: string; password: string };
    const ip = req.ip ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? '';

    const staff = await db.staff.findUnique({ where: { email } });
    // Constant-time-ish: always run a bcrypt compare even if user not found.
    const placeholder = '$2a$12$invalidsalt00000000000uMQXcVJ8mFgYpRZZNmyeUHb1q3MAhcK';
    const ok = await bcrypt.compare(password, staff?.passwordHash ?? placeholder);

    if (!staff || !staff.isActive || !ok) {
      await logAudit({
        action: 'STAFF_LOGIN',
        resource: 'staff_auth',
        ipAddress: ip,
        userAgent,
        status: 'FAILURE',
        details: { email, reason: !staff ? 'NOT_FOUND' : !staff.isActive ? 'INACTIVE' : 'BAD_PASSWORD' },
      });
      res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
      return;
    }

    await db.staff.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });

    const accessToken = signStaffAccessToken({
      sub: staff.id,
      email: staff.email,
      staffRole: staff.role,
    });

    await logAudit({
      userId: staff.id,
      userRole: `STAFF:${staff.role}`,
      action: 'STAFF_LOGIN',
      resource: 'staff_auth',
      ipAddress: ip,
      userAgent,
      status: 'SUCCESS',
    });

    res.json({
      accessToken,
      user: {
        id: staff.id,
        email: staff.email,
        fullName: staff.fullName,
        role: staff.role,
      },
    });
  },
);

// GET /api/staff/auth/me
router.get('/auth/me', requireStaff, async (req: StaffAuthRequest, res: Response): Promise<void> => {
  const staff = await db.staff.findUnique({
    where: { id: req.staff!.sub },
    select: { id: true, email: true, fullName: true, role: true, lastLoginAt: true },
  });
  if (!staff) {
    res.status(404).json({ error: 'Staff not found' });
    return;
  }
  res.json({ user: staff });
});

// ─── Prescriptions ───────────────────────────────────────────────────────

// GET /api/staff/prescriptions?status=NOT_PICKED
router.get(
  '/prescriptions',
  requireStaff,
  async (req: StaffAuthRequest, res: Response): Promise<void> => {
    const status = req.query.status as PrescriptionStatus | undefined;
    const search = (req.query.q as string | undefined)?.trim();
    const items = await db.prescription.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { prescriptionRef: { contains: search, mode: 'insensitive' as const } },
                { memberFirstName: { contains: search, mode: 'insensitive' as const } },
                { memberLastName: { contains: search, mode: 'insensitive' as const } },
                { memberRef: { contains: search, mode: 'insensitive' as const } },
                { pharmacyName: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { sentToPharmacyAt: 'desc' },
      take: 200,
    });

    // Quick KPIs for the dashboard cards.
    const grouped = await db.prescription.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const kpi: Record<string, number> = {};
    grouped.forEach((g) => {
      kpi[g.status] = g._count._all;
    });

    res.json({ items, kpi });
  },
);

// GET /api/staff/prescriptions/:id
router.get(
  '/prescriptions/:id',
  requireStaff,
  async (req: StaffAuthRequest, res: Response): Promise<void> => {
    const prescription = await db.prescription.findUnique({
      where: { id: req.params.id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!prescription) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ prescription });
  },
);

// POST /api/staff/prescriptions  — manual / API-fed creation
router.post(
  '/prescriptions',
  requireStaff,
  validate(createPrescriptionSchema),
  async (req: StaffAuthRequest, res: Response): Promise<void> => {
    const body = req.body as Parameters<typeof db.prescription.create>[0]['data'] & {
      sentToPharmacyAt?: Date;
    };
    const created = await db.prescription.create({
      data: {
        ...body,
        sentToPharmacyAt: body.sentToPharmacyAt ?? new Date(),
      },
    });
    await db.prescriptionEvent.create({
      data: {
        prescriptionId: created.id,
        type: PrescriptionEventType.CREATED,
        staffId: req.staff!.sub,
        payload: { source: 'staff_portal' },
      },
    });
    res.status(201).json({ prescription: created });
  },
);

// POST /api/staff/prescriptions/:id/respond — drive the conversation tree
router.post(
  '/prescriptions/:id/respond',
  requireStaff,
  validate(respondPrescriptionSchema),
  async (req: StaffAuthRequest, res: Response): Promise<void> => {
    const { choice, note } = req.body as { choice: string; note?: string };
    try {
      const out = await handleMemberResponse({
        prescriptionId: req.params.id,
        staffId: req.staff!.sub,
        choice: choice as Parameters<typeof handleMemberResponse>[0]['choice'],
        note,
      });
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

// POST /api/staff/prescriptions/:id/mark-picked-up
router.post(
  '/prescriptions/:id/mark-picked-up',
  requireStaff,
  async (req: StaffAuthRequest, res: Response): Promise<void> => {
    const updated = await db.prescription.update({
      where: { id: req.params.id },
      data: { status: PrescriptionStatus.PICKED_UP, pickedUpAt: new Date(), flagged: false },
    });
    await db.prescriptionEvent.create({
      data: {
        prescriptionId: updated.id,
        type: PrescriptionEventType.STATUS_CHANGE,
        staffId: req.staff!.sub,
        payload: { newStatus: 'PICKED_UP' },
      },
    });
    res.json({ prescription: updated });
  },
);

// POST /api/staff/prescriptions/run-sweep — manual trigger of T+6h scan
router.post(
  '/prescriptions/run-sweep',
  requireStaff,
  async (_req: StaffAuthRequest, res: Response): Promise<void> => {
    const result = await runPickupSweep();
    res.json({ result });
  },
);

export default router;
