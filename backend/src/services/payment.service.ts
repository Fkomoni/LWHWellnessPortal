import { env } from '../config/env';
import { db } from '../config/database';
import { logger } from '../utils/logger';

// iFitness 20% Leadway discount pricing (₦ per session)
const PRICING = {
  STANDARD_MONTHLY: { sessions: 12, baseAmount: 24000, discount: 0.2 },   // ₦24k → ₦19.2k
  IFITNESS_MONTHLY: { sessions: 12, baseAmount: 36000, discount: 0.2 },   // ₦36k → ₦28.8k
  IFITNESS_QUARTERLY: { sessions: 36, baseAmount: 100000, discount: 0.2 }, // ₦100k → ₦80k
  IFITNESS_ANNUAL: { sessions: 144, baseAmount: 380000, discount: 0.2 },   // ₦380k → ₦304k
  ADDITIONAL_SESSION: { sessions: 1, baseAmount: 2500, discount: 0 },
};

export type PlanKey = keyof typeof PRICING;

export function getTopUpBreakdown(plan: PlanKey) {
  const p = PRICING[plan];
  const discountAmount = p.baseAmount * p.discount;
  const chargeAmount = p.baseAmount - discountAmount;
  return {
    sessions: p.sessions,
    baseAmount: p.baseAmount,
    discount: p.discount * 100, // as percentage
    discountAmount,
    chargeAmount,
    perSession: Math.round(chargeAmount / p.sessions),
  };
}

export function getAllPlans() {
  return Object.entries(PRICING).map(([key, p]) => {
    const discountAmount = p.baseAmount * p.discount;
    return {
      key,
      sessions: p.sessions,
      baseAmount: p.baseAmount,
      discount: p.discount * 100,
      discountAmount,
      chargeAmount: p.baseAmount - discountAmount,
    };
  });
}

export async function initializePayment(
  memberId: string,
  plan: PlanKey,
  email: string,
): Promise<{ authorizationUrl: string; reference: string }> {
  const breakdown = getTopUpBreakdown(plan);

  if (!env.PAYSTACK_SECRET_KEY) {
    // Mock for prototype
    const mockRef = `LWH-MOCK-${Date.now()}`;
    await db.topUp.create({
      data: {
        memberId,
        sessionCount: breakdown.sessions,
        amount: breakdown.chargeAmount,
        discountApplied: breakdown.discountAmount,
        plan,
        paymentRef: mockRef,
        provider: 'PAYSTACK_MOCK',
        status: 'PENDING',
      },
    });
    return { authorizationUrl: `${env.APP_URL}/member/top-up/mock?ref=${mockRef}`, reference: mockRef };
  }

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: Math.round(breakdown.chargeAmount * 100), // Paystack uses kobo
      metadata: { memberId, plan, sessions: breakdown.sessions },
      callback_url: `${env.APP_URL}/member/top-up/callback`,
    }),
  });

  const data = await res.json() as { data: { authorization_url: string; reference: string } };

  await db.topUp.create({
    data: {
      memberId,
      sessionCount: breakdown.sessions,
      amount: breakdown.chargeAmount,
      discountApplied: breakdown.discountAmount,
      plan,
      paymentRef: data.data.reference,
      status: 'PENDING',
    },
  });

  return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
}

export async function verifyPayment(reference: string): Promise<{ success: boolean; sessions?: number }> {
  const topUp = await db.topUp.findUnique({ where: { paymentRef: reference } });
  if (!topUp) return { success: false };

  if (!env.PAYSTACK_SECRET_KEY) {
    // Mock — approve immediately
    await db.$transaction(async (tx) => {
      await tx.topUp.update({ where: { paymentRef: reference }, data: { status: 'SUCCESS', paidAt: new Date() } });
      await tx.member.update({ where: { id: topUp.memberId }, data: { sessionsPerMonth: { increment: topUp.sessionCount } } });
    });
    return { success: true, sessions: topUp.sessionCount };
  }

  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json() as { data: { status: string } };

  if (data.data.status === 'success') {
    await db.$transaction(async (tx) => {
      await tx.topUp.update({ where: { paymentRef: reference }, data: { status: 'SUCCESS', paidAt: new Date() } });
      await tx.member.update({ where: { id: topUp.memberId }, data: { sessionsPerMonth: { increment: topUp.sessionCount } } });
    });
    logger.info('Top-up verified', { reference, sessions: topUp.sessionCount });
    return { success: true, sessions: topUp.sessionCount };
  }

  await db.topUp.update({ where: { paymentRef: reference }, data: { status: 'FAILED' } });
  return { success: false };
}
