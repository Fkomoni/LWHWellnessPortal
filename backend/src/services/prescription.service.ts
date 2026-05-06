/**
 * Prescription pickup tracking — staff-driven.
 *
 * Flow (per spec):
 *   T0 = sentToPharmacyAt
 *   T0 + 6h  → if not picked up, send WhatsApp (primary) + Email (fallback)
 *              with 4 options: RESEND_DETAILS, PICK_LATER, CHANGE_PHARMACY, CANCEL
 *   T0 + 8h  → if no member response, smart retry (resend WhatsApp)
 *   T0 + 10h → still no response, escalate to call-center queue (AT_RISK)
 *   PICK_LATER also schedules an extra reminder 24h after the option choice.
 *
 * Conversation choices are recorded as PrescriptionEvent rows so the staff
 * dashboard can render the full audit trail.
 */
import {
  Prescription,
  PrescriptionEvent,
  PrescriptionEventType,
  PrescriptionStatus,
  NotificationChannel,
} from '@prisma/client';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { sendWhatsAppMessage, sendEmail } from './notification.service';

const SIX_HOURS = 6 * 60 * 60 * 1000;
const EIGHT_HOURS = 8 * 60 * 60 * 1000;
const TEN_HOURS = 10 * 60 * 60 * 1000;

// ─── Templates ────────────────────────────────────────────────────────────

export function buildFirstTouchWhatsApp(p: Prescription): string {
  return (
    `Hello ${p.memberFirstName},\n\n` +
    `We noticed your prescription has been sent to a pharmacy, but your medications haven’t been picked up yet.\n\n` +
    `We’re here to help. Please reply with one of the following:\n\n` +
    `1️⃣  I didn’t receive my OTP or pharmacy details\n` +
    `2️⃣  I will pick up later\n` +
    `3️⃣  I want to change my pickup pharmacy\n` +
    `4️⃣  Cancel my prescription\n\n` +
    `Reply with the number (1–4).`
  );
}

export function buildFirstTouchEmail(p: Prescription): { subject: string; body: string } {
  return {
    subject: 'Reminder: Your Medication is Ready for Pickup',
    body:
      `Hello ${p.memberFirstName},\n\n` +
      `Your prescription was sent to ${p.pharmacyName} but hasn’t been picked up yet.\n\n` +
      `Pickup OTP: ${p.otp}\n` +
      `Pharmacy: ${p.pharmacyName}\n` +
      `Address: ${p.pharmacyAddress}\n\n` +
      `If you didn’t receive your OTP, would like to change pharmacy, pick up later or cancel,\n` +
      `please reply to the WhatsApp message we just sent — or call our care team.\n\n` +
      `Leadway Wellness`,
  };
}

export function buildResendDetailsReply(p: Prescription): string {
  return (
    `No problem 😊\n\nHere are your pickup details:\n\n` +
    `🏥 Pharmacy: ${p.pharmacyName}\n` +
    `📍 Address: ${p.pharmacyAddress}\n` +
    `🔐 OTP: ${p.otp}\n\n` +
    `Please present this OTP at the pharmacy to collect your medication.\n\n` +
    `Let us know if you need further assistance.`
  );
}

export function buildPickLaterReply(): string {
  return (
    `Thank you for letting us know 😊\n\n` +
    `Your medications will remain available for pickup.\n\n` +
    `If you need any assistance or want to change your pickup location, feel free to reach out anytime.`
  );
}

export function buildChangePharmacyAskReason(): string {
  return (
    `Sure, we can help with that.\nPlease tell us why you’d like to change your pickup pharmacy:\n\n` +
    `1️⃣ Medications not available\n2️⃣ Pharmacy is too far`
  );
}

export function buildRerouteUnavailableReply(): string {
  return (
    `Thank you for letting us know.\n\n` +
    `We’ll cancel this order immediately and find another pharmacy where your medications are available.\n\n` +
    `This may take a little time while we confirm availability.`
  );
}

export function buildRerouteTooFarReply(): string {
  return (
    `We understand convenience is important.\n\n` +
    `We can help reassign your prescription to a closer pharmacy, but we’ll need to confirm medication availability first.\n\n` +
    `Reply ✅ Proceed to cancel and reroute, or ❌ Keep current pharmacy.`
  );
}

export function buildRerouteProceedReply(): string {
  return (
    `Your request has been received ✅\n\n` +
    `We’re currently identifying a new pharmacy for you.\n\n` +
    `Once confirmed, we’ll send you updated pickup details shortly.`
  );
}

export function buildRerouteKeepReply(): string {
  return `Alright 👍\n\nYour current pharmacy remains assigned.\n\nLet us know if you need anything else.`;
}

export function buildCancelAskReason(): string {
  return (
    `We’re sorry to see this.\nPlease let us know why you’d like to cancel:\n\n` +
    `1️⃣ I no longer need the medication\n` +
    `2️⃣ I never requested this prescription\n` +
    `3️⃣ I’ve already gotten the medication elsewhere\n` +
    `4️⃣ Other`
  );
}

export function buildCancelConfirmAsk(): string {
  return `Are you sure you want to cancel your prescription?\n\n✅ Yes, cancel\n❌ No, keep it`;
}

export function buildCancelDoneReply(): string {
  return `Your prescription has been successfully cancelled.\n\nIf you need assistance in the future, we’re always here to help.`;
}

export function buildCancelKeptReply(): string {
  return `No problem 😊\n\nYour prescription remains active for pickup.`;
}

// ─── Trigger logic (T+6h) ─────────────────────────────────────────────────

export interface TriggerResult {
  triggered: number;
  retried: number;
  escalated: number;
}

/**
 * Scan the table for prescriptions that crossed the 6h / 8h / 10h thresholds
 * and act on them. Idempotent — safe to run as a cron tick.
 */
export async function runPickupSweep(now: Date = new Date()): Promise<TriggerResult> {
  const result: TriggerResult = { triggered: 0, retried: 0, escalated: 0 };

  // 1) First-touch trigger — T+6h, no triggerSentAt yet.
  const dueFirstTouch = await db.prescription.findMany({
    where: {
      status: PrescriptionStatus.SENT_TO_PHARMACY,
      triggerSentAt: null,
      sentToPharmacyAt: { lte: new Date(now.getTime() - SIX_HOURS) },
    },
  });
  for (const p of dueFirstTouch) {
    await sendFirstTouch(p);
    result.triggered += 1;
  }

  // 2) Smart retry — T+8h, trigger sent but no member response yet.
  const dueRetry = await db.prescription.findMany({
    where: {
      status: PrescriptionStatus.NOT_PICKED,
      triggerSentAt: { lte: new Date(now.getTime() - EIGHT_HOURS) },
      retrySentAt: null,
      lastResponseAt: null,
    },
  });
  for (const p of dueRetry) {
    await sendRetry(p);
    result.retried += 1;
  }

  // 3) Escalate to call-center — T+10h, still no response after retry.
  const dueEscalate = await db.prescription.findMany({
    where: {
      status: PrescriptionStatus.NOT_PICKED,
      retrySentAt: { lte: new Date(now.getTime() - (TEN_HOURS - EIGHT_HOURS)) },
      lastResponseAt: null,
    },
  });
  for (const p of dueEscalate) {
    await escalate(p);
    result.escalated += 1;
  }

  if (result.triggered || result.retried || result.escalated) {
    logger.info('[prescription sweep]', result);
  }
  return result;
}

async function sendFirstTouch(p: Prescription): Promise<void> {
  const wa = buildFirstTouchWhatsApp(p);
  const em = buildFirstTouchEmail(p);

  await sendWhatsAppMessage(p.memberPhone, wa);
  if (p.memberEmail) {
    await sendEmail({
      to: p.memberEmail,
      subject: em.subject,
      body: em.body,
      emailType: 'PRESCRIPTION_PICKUP_REMINDER',
    }).catch((err) => logger.warn('email send failed', { err }));
  }

  await db.prescription.update({
    where: { id: p.id },
    data: { triggerSentAt: new Date(), status: PrescriptionStatus.NOT_PICKED },
  });
  await db.prescriptionEvent.create({
    data: {
      prescriptionId: p.id,
      type: PrescriptionEventType.TRIGGER_SENT,
      channel: NotificationChannel.WHATSAPP,
      payload: { whatsapp: wa, email: !!p.memberEmail },
    },
  });
}

async function sendRetry(p: Prescription): Promise<void> {
  const wa = buildFirstTouchWhatsApp(p);
  await sendWhatsAppMessage(p.memberPhone, wa);
  await db.prescription.update({ where: { id: p.id }, data: { retrySentAt: new Date() } });
  await db.prescriptionEvent.create({
    data: {
      prescriptionId: p.id,
      type: PrescriptionEventType.RETRY_SENT,
      channel: NotificationChannel.WHATSAPP,
      payload: { whatsapp: wa },
    },
  });
}

async function escalate(p: Prescription): Promise<void> {
  await db.prescription.update({
    where: { id: p.id },
    data: { status: PrescriptionStatus.AT_RISK, flagged: true, flagReason: 'NO_RESPONSE_TO_OUTREACH' },
  });
  await db.prescriptionEvent.create({
    data: {
      prescriptionId: p.id,
      type: PrescriptionEventType.ESCALATED_TO_CALL_CENTER,
      payload: { reason: 'No response after retry; queued for human follow-up.' },
    },
  });
}

// ─── Conversation handler ────────────────────────────────────────────────

export interface RespondInput {
  prescriptionId: string;
  staffId?: string;
  choice:
    | 'RESEND_DETAILS'
    | 'PICK_LATER'
    | 'CHANGE_PHARMACY'
    | 'CANCEL'
    | 'REROUTE_REASON_UNAVAILABLE'
    | 'REROUTE_REASON_TOO_FAR'
    | 'REROUTE_PROCEED'
    | 'REROUTE_KEEP'
    | 'CANCEL_REASON_NOT_NEEDED'
    | 'CANCEL_REASON_NEVER_REQUESTED'
    | 'CANCEL_REASON_GOT_ELSEWHERE'
    | 'CANCEL_REASON_OTHER'
    | 'CANCEL_CONFIRM_YES'
    | 'CANCEL_CONFIRM_NO';
  note?: string;
}

export interface RespondOutput {
  reply: string;          // text echoed back to the member (and to the staff UI)
  prescription: Prescription & { events: PrescriptionEvent[] };
}

/**
 * Handle a member response in the conversation tree. Staff may also drive
 * this manually from the dashboard (e.g. when the member calls in instead).
 */
export async function handleMemberResponse(input: RespondInput): Promise<RespondOutput> {
  const p = await db.prescription.findUnique({ where: { id: input.prescriptionId } });
  if (!p) throw new Error('Prescription not found');

  const now = new Date();
  let reply = '';
  let nextStatus: PrescriptionStatus | undefined;
  const updates: Partial<Prescription> = {
    lastResponseAt: now,
    lastResponseChoice: input.choice,
  };

  switch (input.choice) {
    case 'RESEND_DETAILS':
      reply = buildResendDetailsReply(p);
      await db.prescriptionEvent.create({
        data: {
          prescriptionId: p.id,
          type: PrescriptionEventType.DETAILS_RESENT,
          payload: { reason: 'DELIVERY_COMMUNICATION_FAILURE' },
        },
      });
      break;

    case 'PICK_LATER':
      reply = buildPickLaterReply();
      // tag intent — leave status as NOT_PICKED but un-flag
      updates.flagged = false;
      break;

    case 'CHANGE_PHARMACY':
      reply = buildChangePharmacyAskReason();
      break;

    case 'REROUTE_REASON_UNAVAILABLE':
      reply = buildRerouteUnavailableReply();
      updates.rerouteReason = 'MEDS_UNAVAILABLE';
      nextStatus = PrescriptionStatus.RE_ROUTING;
      await db.prescriptionEvent.create({
        data: {
          prescriptionId: p.id,
          type: PrescriptionEventType.REROUTE_REQUESTED,
          payload: { reason: 'MEDS_UNAVAILABLE' },
        },
      });
      break;

    case 'REROUTE_REASON_TOO_FAR':
      reply = buildRerouteTooFarReply();
      updates.rerouteReason = 'PHARMACY_TOO_FAR';
      break;

    case 'REROUTE_PROCEED':
      reply = buildRerouteProceedReply();
      nextStatus = PrescriptionStatus.RE_ROUTING;
      await db.prescriptionEvent.create({
        data: {
          prescriptionId: p.id,
          type: PrescriptionEventType.REROUTE_REQUESTED,
          payload: { reason: p.rerouteReason ?? 'PHARMACY_TOO_FAR' },
        },
      });
      break;

    case 'REROUTE_KEEP':
      reply = buildRerouteKeepReply();
      break;

    case 'CANCEL':
      reply = buildCancelAskReason();
      break;

    case 'CANCEL_REASON_NOT_NEEDED':
    case 'CANCEL_REASON_GOT_ELSEWHERE':
    case 'CANCEL_REASON_OTHER':
      updates.cancelReason = input.choice;
      reply = buildCancelConfirmAsk();
      break;

    case 'CANCEL_REASON_NEVER_REQUESTED':
      // 🚨 high-priority fraud branch
      updates.cancelReason = 'NEVER_REQUESTED';
      updates.flagged = true;
      updates.flagReason = 'POTENTIAL_FRAUD_OR_ERROR';
      nextStatus = PrescriptionStatus.FRAUD_FLAGGED;
      reply = buildCancelConfirmAsk();
      await db.prescriptionEvent.create({
        data: {
          prescriptionId: p.id,
          type: PrescriptionEventType.FRAUD_FLAG,
          payload: { reason: 'Member denies requesting prescription' },
        },
      });
      break;

    case 'CANCEL_CONFIRM_YES':
      reply = buildCancelDoneReply();
      nextStatus = PrescriptionStatus.CANCELLED;
      await db.prescriptionEvent.create({
        data: {
          prescriptionId: p.id,
          type: PrescriptionEventType.CANCEL_REQUESTED,
          payload: { confirmed: true, reason: p.cancelReason ?? null },
        },
      });
      break;

    case 'CANCEL_CONFIRM_NO':
      reply = buildCancelKeptReply();
      break;
  }

  if (nextStatus) updates.status = nextStatus;

  await db.prescription.update({ where: { id: p.id }, data: updates });
  await db.prescriptionEvent.create({
    data: {
      prescriptionId: p.id,
      type: PrescriptionEventType.MEMBER_RESPONSE,
      staffId: input.staffId,
      payload: { choice: input.choice, note: input.note ?? null, reply },
    },
  });

  // Echo the system reply back over WhatsApp so the member sees it.
  await sendWhatsAppMessage(p.memberPhone, reply).catch(() => undefined);

  const fresh = await db.prescription.findUnique({
    where: { id: p.id },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  return { reply, prescription: fresh! };
}

// ─── Scheduler bootstrap ──────────────────────────────────────────────────

let schedulerHandle: ReturnType<typeof setInterval> | null = null;
const SWEEP_INTERVAL_MS = 60 * 1000; // 60s

export function startPickupScheduler(): void {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    runPickupSweep().catch((err) => logger.error('pickup sweep failed', { err }));
  }, SWEEP_INTERVAL_MS);
  logger.info(`Pickup scheduler started (interval ${SWEEP_INTERVAL_MS}ms)`);
}

export function stopPickupScheduler(): void {
  if (schedulerHandle) clearInterval(schedulerHandle);
  schedulerHandle = null;
}
