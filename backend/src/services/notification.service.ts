import { Prisma, NotificationChannel } from '@prisma/client';
import { env } from '../config/env';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { getPrognosisToken, invalidatePrognosisToken, PROGNOSIS_HEADERS } from './prognosis.service';

// ─── WhatsApp ─────────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  if (!env.WHATSAPP_API_URL || !env.WHATSAPP_API_KEY) {
    logger.info('[WhatsApp MOCK] Would send to ' + phone + ': ' + message);
    return true; // mock success for prototype
  }

  try {
    const res = await fetch(env.WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': env.WHATSAPP_API_KEY,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    });
    return res.ok;
  } catch (err) {
    logger.error('WhatsApp send failed', { phone: '[REDACTED]', err });
    return false;
  }
}

export async function sendSessionConfirmationWhatsApp(
  phone: string,
  gymName: string,
  sessionId: string,
): Promise<void> {
  const message =
    `*Leadway Wellness* ✅\n\n` +
    `A gym session was just logged at *${gymName}* using your benefit.\n\n` +
    `Did you visit this gym today?\n` +
    `Reply *YES* to confirm or *NO* if you did not visit.\n\n` +
    `Session Ref: ${sessionId.slice(0, 8).toUpperCase()}`;

  const sent = await sendWhatsAppMessage(phone, message);

  await db.session.update({
    where: { id: sessionId },
    data: { ...(sent && { whatsappSentAt: new Date() }) },
  });
}

export async function sendFwaAlertToProvider(
  providerEmail: string,
  caseRef: string,
  memberName: string,
): Promise<void> {
  const subject = `FWA Investigation Opened — ${caseRef}`;
  const body =
    `An FWA (Fraud, Waste & Abuse) investigation has been opened for member ${memberName}.\n` +
    `Case Reference: ${caseRef}\n\n` +
    `The member has disputed a session logged at your gym. ` +
    `Our FWA team will be in touch. Please retain all relevant records.\n\n` +
    `Leadway Wellness Portal`;

  await sendEmail({ to: providerEmail, subject, body, emailType: 'FWA_PROVIDER_ALERT' });
}

// ─── Email ─────────────────────────────────────────────────────────────────

interface EmailParams {
  to: string;
  subject: string;
  body: string;
  emailType: string;
  senderId?: string;
  senderName?: string;
  recipientId?: string;
  metadata?: Record<string, unknown>;
}

async function callSendEmailAlert(token: string, params: EmailParams): Promise<Response> {
  return fetch(`${env.PROGNOSIS_API_URL}/api/EnrolleeProfile/SendEmailAlert`, {
    method: 'POST',
    headers: { ...PROGNOSIS_HEADERS, Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      EmailAddress: params.to,
      CC: '',
      BCC: '',
      Subject: params.subject,
      MessageBody: params.body,
      Attachments: null,
      Category: params.emailType,
      UserId: 0,
      ProviderId: 0,
      ServiceId: 0,
      Reference: '',
      TransactionType: '',
    }),
  });
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  const senderName = params.senderName ?? 'Leadway Wellness Portal';
  const senderEmail = 'noreply@leadwayhealth.com';

  if (!env.PROGNOSIS_USERNAME || !env.PROGNOSIS_PASSWORD) {
    logger.info('[Email MOCK]', { to: params.to, subject: params.subject, type: params.emailType });
    await logCommunication({ ...params, senderName, senderEmail });
    return true;
  }

  try {
    let token = await getPrognosisToken();
    let res = await callSendEmailAlert(token, params);

    // On 401 the token expired early — invalidate, fetch fresh, retry once.
    if (res.status === 401) {
      invalidatePrognosisToken();
      token = await getPrognosisToken();
      res = await callSendEmailAlert(token, params);
    }

    if (!res.ok) {
      logger.error('Prognosis email API HTTP error', { status: res.status, type: params.emailType });
      return false;
    }

    // Prognosis returns HTTP 200 even on failure — detect by body content.
    const text = await res.text();
    if (text.toLowerCase().includes('fail')) {
      logger.error('Prognosis email API returned failure', { response: text, type: params.emailType });
      return false;
    }

    await logCommunication({ ...params, senderName, senderEmail });
    return true;
  } catch (err) {
    logger.error('Email send failed', { to: '[REDACTED]', err });
    return false;
  }
}

async function logCommunication(params: EmailParams & { senderName: string; senderEmail: string }) {
  await db.communicationLog.create({
    data: {
      senderId: params.senderId ?? 'system',
      senderName: params.senderName,
      recipientId: params.recipientId,
      recipientEmail: params.to,
      subject: params.subject,
      body: params.body,
      emailType: params.emailType,
      metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function sendOtpEmail(
  email: string,
  otp: string,
  memberName: string,
  gymName: string,
  generatedBy: string,
): Promise<void> {
  const subject = 'Your Leadway Wellness Session OTP';
  const body =
    `Dear ${memberName},\n\n` +
    `Your session OTP for ${gymName} has been generated ${generatedBy !== 'MEMBER' ? `on your behalf by a Leadway advocate` : ''}.\n\n` +
    `OTP: *${otp}*\n\n` +
    `Present this code to the gym receptionist. It expires in 2 hours.\n\n` +
    `If you did not request this, please contact Leadway immediately.\n\n` +
    `Leadway Wellness Portal`;

  await sendEmail({ to: email, subject, body, emailType: 'OTP_DELIVERY' });
}

// ─── In-app Notifications ─────────────────────────────────────────────────

export async function createInAppNotification(
  memberId: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.notification.create({
    data: {
      memberId,
      title,
      body,
      channel: NotificationChannel.IN_APP,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
