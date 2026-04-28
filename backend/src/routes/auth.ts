import { Router, Request, Response } from 'express';
import { db } from '../config/database';
import { generateAuthOTP, verifyAuthOTP } from '../services/otp.service';
import { signAccessToken, issueRefreshToken, rotateRefreshToken, revokeAllTokens } from '../services/jwt.service';
import { logAudit } from '../services/audit.service';
import { validate } from '../middleware/validate';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { authRateLimiter, otpGenerateRateLimiter, dobAuthRateLimiter } from '../middleware/rateLimiter';
import { requestOtpSchema, verifyOtpSchema, refreshTokenSchema, loginDobSchema, providerLoginSchema } from '../validators/auth.validator';
import { authenticateByDob, PrognosisUpstreamError } from '../services/member.service';
import { authenticateProvider } from '../services/prognosis.service';
import { env } from '../config/env';
import { generateSecureToken } from '../utils/crypto';
import { Role } from '@prisma/client';

const router = Router();

// POST /api/auth/request-otp
router.post(
  '/request-otp',
  authRateLimiter,
  otpGenerateRateLimiter,
  validate(requestOtpSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { phone, role } = req.body as { phone: string; role: Role };
    const ip = req.ip ?? 'unknown';

    try {
      // Look up member by phone + role
      const member = await db.member.findFirst({
        where: { phone, role, isActive: true },
        select: { id: true, firstName: true, memberRef: true },
      });

      // Security: always return the same response whether member exists or not (prevents user enumeration)
      const { otp, expiresAt } = await generateAuthOTP(phone, ip);

      await logAudit({
        userId: member?.id,
        action: 'AUTH_OTP_REQUEST',
        resource: 'auth',
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
        status: member ? 'SUCCESS' : 'FAILURE',
        details: { role, memberFound: !!member },
      });

      // In production, send via WhatsApp/SMS — never expose in response
      // For prototype: return OTP only in development mode
      const responseBody: Record<string, unknown> = {
        message: 'OTP sent to your registered phone number',
        expiresAt,
      };

      if (env.OTP_VISIBLE_IN_DEV === 'true' && env.NODE_ENV !== 'production') {
        responseBody['_devOtp'] = otp;
        responseBody['_devNote'] = 'OTP visible in development mode only — remove in production';
      }

      res.json(responseBody);
    } catch (err) {
      await logAudit({ action: 'AUTH_OTP_REQUEST', resource: 'auth', ipAddress: ip, status: 'FAILURE' });
      throw err;
    }
  },
);

// POST /api/auth/verify-otp
router.post(
  '/verify-otp',
  authRateLimiter,
  validate(verifyOtpSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { phone, otp, role } = req.body as { phone: string; otp: string; role: Role };
    const ip = req.ip ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? '';

    const result = await verifyAuthOTP(phone, otp);

    if (!result.valid) {
      await logAudit({ action: 'AUTH_OTP_VERIFY', resource: 'auth', ipAddress: ip, status: 'FAILURE', details: { reason: result.reason } });
      const statusCode = result.reason === 'MAX_ATTEMPTS' ? 429 : 401;
      res.status(statusCode).json({ error: 'OTP verification failed', code: result.reason });
      return;
    }

    // Look up member after OTP validated
    const member = await db.member.findFirst({
      where: { phone, role, isActive: true },
      select: { id: true, firstName: true, lastName: true, memberRef: true, role: true },
    });

    if (!member) {
      await logAudit({ action: 'AUTH_LOGIN', resource: 'auth', ipAddress: ip, status: 'FAILURE', details: { reason: 'MEMBER_NOT_FOUND' } });
      res.status(401).json({ error: 'No active account found for this phone and role', code: 'MEMBER_NOT_FOUND' });
      return;
    }

    const sessionId = generateSecureToken(16);
    const accessToken = signAccessToken({ sub: member.id, role: member.role, sessionId });
    const refreshToken = await issueRefreshToken(member.id, ip, userAgent);

    await logAudit({
      userId: member.id,
      userRole: member.role,
      action: 'AUTH_LOGIN',
      resource: 'auth',
      ipAddress: ip,
      userAgent,
      status: 'SUCCESS',
    });

    // Refresh token in httpOnly cookie — not accessible via JS (XSS protection)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    res.json({
      accessToken,
      user: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        memberRef: member.memberRef,
        role: member.role,
      },
    });
  },
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  validate(refreshTokenSchema),
  async (req: Request, res: Response): Promise<void> => {
    const rawToken = (req.body as { refreshToken: string }).refreshToken
      || req.cookies['refreshToken'];

    if (!rawToken) {
      res.status(401).json({ error: 'Refresh token required', code: 'UNAUTHORIZED' });
      return;
    }

    try {
      const { accessToken, refreshToken, member } = await rotateRefreshToken(
        rawToken,
        req.ip ?? 'unknown',
        req.headers['user-agent'] ?? '',
      );

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
      });

      res.json({ accessToken, role: member.role });
    } catch {
      res.status(401).json({ error: 'Session expired. Please log in again.', code: 'TOKEN_INVALID' });
    }
  },
);

// POST /api/auth/login-dob — primary ENROLLEE login via Member ID + date of birth
router.post(
  '/login-dob',
  dobAuthRateLimiter,
  validate(loginDobSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { memberRef, dob } = req.body as { memberRef: string; dob: Date };
    const ip = req.ip ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? '';

    let member: Awaited<ReturnType<typeof authenticateByDob>>;
    try {
      member = await authenticateByDob(memberRef, dob);
    } catch (err) {
      if (err instanceof PrognosisUpstreamError) {
        await logAudit({ action: 'AUTH_LOGIN_DOB', resource: 'auth', ipAddress: ip, status: 'FAILURE', details: { reason: 'UPSTREAM_ERROR' } });
        res.status(503).json({ error: 'Authentication service temporarily unavailable. Please try again.', code: 'UPSTREAM_ERROR' });
      } else {
        throw err;
      }
      return;
    }

    if (!member) {
      await logAudit({
        action: 'AUTH_LOGIN_DOB',
        resource: 'auth',
        ipAddress: ip,
        userAgent,
        status: 'FAILURE',
        details: { reason: 'INVALID_CREDENTIALS' },
      });
      res.status(401).json({ error: 'Invalid Member ID or date of birth', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const sessionId = generateSecureToken(16);
    const accessToken = signAccessToken({ sub: member.id, role: member.role, sessionId });
    const refreshToken = await issueRefreshToken(member.id, ip, userAgent);

    // Cache schemeId for gym lookups — fire-and-forget, never block the login response
    if (member.schemeId) {
      db.member.update({ where: { id: member.id }, data: { schemeId: member.schemeId } }).catch(() => {});
    }

    await logAudit({
      userId: member.id,
      userRole: member.role,
      action: 'AUTH_LOGIN_DOB',
      resource: 'auth',
      ipAddress: ip,
      userAgent,
      status: 'SUCCESS',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    res.json({
      accessToken,
      user: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        memberRef: member.memberRef,
        role: member.role,
      },
    });
  },
);

// POST /api/auth/provider-login — Prognosis email+password auth for gym providers
router.post(
  '/provider-login',
  dobAuthRateLimiter,
  validate(providerLoginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password, otp } = req.body as { email: string; password: string; otp?: string };
    const ip = req.ip ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? '';

    let providerAuth: Awaited<ReturnType<typeof authenticateProvider>>;
    try {
      providerAuth = await authenticateProvider(email, password, otp);
    } catch (err) {
      await logAudit({ action: 'PROVIDER_LOGIN', resource: 'auth', ipAddress: ip, status: 'FAILURE', details: { reason: 'UPSTREAM_ERROR', email } });
      if (err instanceof PrognosisUpstreamError) {
        res.status(503).json({ error: 'Authentication service temporarily unavailable. Please try again.', code: 'UPSTREAM_ERROR' });
      } else {
        throw err;
      }
      return;
    }

    // Credentials valid but OTP required — Prognosis has sent the code
    if (providerAuth === 'OTP_REQUIRED') {
      res.status(200).json({ needsOtp: true, message: 'A 5-digit OTP has been sent to your registered email or phone. Enter it to continue.' });
      return;
    }

    if (!providerAuth) {
      await logAudit({ action: 'PROVIDER_LOGIN', resource: 'auth', ipAddress: ip, userAgent, status: 'FAILURE', details: { reason: 'INVALID_CREDENTIALS', email } });
      res.status(401).json({ error: otp ? 'Invalid OTP. Please check and try again.' : 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const provider = await db.provider.findUnique({
      where: { gymCode: providerAuth.providerCode },
      select: { id: true, gymCode: true, gymName: true, status: true },
    });

    if (!provider || provider.status !== 'ACTIVE') {
      await logAudit({ action: 'PROVIDER_LOGIN', resource: 'auth', ipAddress: ip, status: 'FAILURE', details: { reason: 'PROVIDER_NOT_FOUND', providerCode: providerAuth.providerCode } });
      res.status(403).json({ error: 'Gym not registered or currently suspended in the portal. Contact Leadway Health.', code: 'PROVIDER_NOT_FOUND' });
      return;
    }

    // Providers get an 8-hour token — long enough for a full working shift.
    // No refresh token: providers log in fresh each day.
    const sessionId = generateSecureToken(16);
    const accessToken = signAccessToken({ sub: provider.id, role: Role.PROVIDER, sessionId }, '8h');

    await logAudit({ userId: provider.id, userRole: 'PROVIDER', action: 'PROVIDER_LOGIN', resource: 'auth', ipAddress: ip, userAgent, status: 'SUCCESS', details: { gymCode: provider.gymCode } });

    res.json({
      accessToken,
      user: {
        id: provider.id,
        gymName: provider.gymName,
        gymCode: provider.gymCode,
        role: Role.PROVIDER,
      },
    });
  },
);

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.sub) {
    await revokeAllTokens(req.user.sub);
    await logAudit({
      userId: req.user.sub,
      userRole: req.user.role,
      action: 'AUTH_LOGOUT',
      resource: 'auth',
      ipAddress: req.ip ?? 'unknown',
      status: 'SUCCESS',
    });
  }

  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logged out successfully' });
});

export default router;
