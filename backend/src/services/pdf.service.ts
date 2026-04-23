import { db } from '../config/database';
import { logger } from '../utils/logger';

// Generates a plain-text pay advice (PDF generation library to be added for production)
// In production: use puppeteer or pdfkit to generate a proper PDF

export async function generatePayAdvice(providerId: string, periodStart: Date, periodEnd: Date): Promise<{
  reference: string;
  totalClaims: number;
  totalAmount: number;
  content: string; // text content (replace with actual PDF in production)
}> {
  // Get all approved/pending claims for provider in period
  const claims = await db.claim.findMany({
    where: {
      providerId,
      status: { in: ['PENDING', 'SUBMITTED'] },
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    include: {
      session: {
        include: { member: { select: { firstName: true, lastName: true, memberRef: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const provider = await db.provider.findUnique({
    where: { id: providerId },
    select: { gymName: true, gymCode: true, email: true },
  });

  if (!provider) throw new Error('Provider not found');

  const totalAmount = claims.reduce((sum, c) => sum + c.amount, 0);
  const period = `${periodStart.toISOString().slice(0, 7)}`;
  const reference = `PAY-${period}-${provider.gymCode}`.toUpperCase();

  // Build text content (stub — replace with PDF library in production)
  const lines: string[] = [
    '═══════════════════════════════════════════════════════',
    '        LEADWAY WELLNESS PORTAL — PAY ADVICE',
    '═══════════════════════════════════════════════════════',
    `Reference:   ${reference}`,
    `Provider:    ${provider.gymName} (${provider.gymCode})`,
    `Period:      ${periodStart.toDateString()} – ${periodEnd.toDateString()}`,
    `Generated:   ${new Date().toDateString()}`,
    '───────────────────────────────────────────────────────',
    'SESSION CLAIMS',
    '───────────────────────────────────────────────────────',
    ...claims.map((c, i) => {
      const m = c.session.member;
      return `${String(i + 1).padStart(3)}. ${m.memberRef.padEnd(15)} ${m.firstName} ${m.lastName.padEnd(20)} ₦${c.amount.toLocaleString()}`;
    }),
    '───────────────────────────────────────────────────────',
    `TOTAL CLAIMS: ${claims.length}`,
    `TOTAL AMOUNT: ₦${totalAmount.toLocaleString()}`,
    '═══════════════════════════════════════════════════════',
    'Leadway Health HMO — Confidential',
  ];

  const content = lines.join('\n');

  // Create or update pay advice record
  const payAdvice = await db.payAdvice.upsert({
    where: { reference },
    update: { totalClaims: claims.length, totalAmount },
    create: {
      providerId,
      reference,
      periodStart,
      periodEnd,
      totalClaims: claims.length,
      totalAmount,
    },
  });

  // Link claims to pay advice
  if (claims.length > 0) {
    await db.claim.updateMany({
      where: { id: { in: claims.map((c) => c.id) } },
      data: { payAdviceId: payAdvice.id, status: 'SUBMITTED', submittedAt: new Date() },
    });
  }

  logger.info('Pay advice generated', { reference, totalClaims: claims.length, totalAmount });
  return { reference, totalClaims: claims.length, totalAmount, content };
}
