import { Router, Request, Response } from 'express';
import { db } from '../config/database';
import { env } from '../config/env';
import { logAudit } from '../services/audit.service';
import { createInAppNotification, sendFwaAlertToProvider } from '../services/notification.service';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const router = Router();

// WhatsApp webhook — receives member Yes/No responses to session confirmations
// GET /api/webhooks/whatsapp — webhook verification (360Dialog handshake)
router.get('/whatsapp', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_SECRET) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

// POST /api/webhooks/whatsapp — incoming messages
router.post('/whatsapp', async (req: Request, res: Response): Promise<void> => {
  // Verify webhook signature (360Dialog / Meta)
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (env.WHATSAPP_WEBHOOK_SECRET && signature) {
    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', env.WHATSAPP_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  res.status(200).json({ status: 'received' }); // always 200 immediately to WhatsApp

  // Process asynchronously
  processWhatsAppMessage(req.body).catch((err) => logger.error('WhatsApp webhook error', { err }));
});

interface WAMessage {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ id: string; from: string; text?: { body: string }; timestamp: string }>;
      };
    }>;
  }>;
}

async function processWhatsAppMessage(body: WAMessage) {
  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (!messages?.length) return;

  for (const msg of messages) {
    const phone = msg.from;
    const text = msg.text?.body?.trim().toUpperCase() ?? '';
    const messageId = msg.id;

    // Deduplicate
    const existing = await db.whatsAppMessage.findUnique({ where: { messageId } });
    if (existing?.processed) continue;

    await db.whatsAppMessage.upsert({
      where: { messageId },
      update: { processed: false },
      create: { phone, messageId, body: msg.text?.body ?? '' },
    });

    // Find member by phone
    const member = await db.member.findFirst({ where: { phone }, select: { id: true, firstName: true } });
    if (!member) continue;

    // Find most recent unconfirmed session with WhatsApp confirmation pending
    const pendingSession = await db.session.findFirst({
      where: { memberId: member.id, whatsappSentAt: { not: null }, memberResponse: null },
      orderBy: { whatsappSentAt: 'desc' },
      include: { provider: { select: { email: true, gymName: true, id: true } } },
    });

    if (!pendingSession) continue;

    if (text === 'YES' || text.includes('YES')) {
      // Confirm session
      await db.session.update({
        where: { id: pendingSession.id },
        data: { whatsappVerified: true, memberResponse: 'YES', memberResponseAt: new Date() },
      });
      await db.whatsAppMessage.update({ where: { messageId }, data: { processed: true, sessionId: pendingSession.id } });
      await createInAppNotification(member.id, 'Session Confirmed ✅', `Your gym visit has been confirmed via WhatsApp.`);

    } else if (text === 'NO' || text.includes('NO')) {
      // Extract last visit from message if provided, e.g. "NO, last visited 20 April"
      const lastVisitMatch = text.match(/(\d+\s+\w+|\w+\s+\d+)/);
      const lastVisitDate = lastVisitMatch ? new Date(lastVisitMatch[0]) : null;

      // Flag session and create FWA case
      const caseRef = `FWA-${new Date().getFullYear()}-${String(await db.fwaCase.count() + 1).padStart(3, '0')}`;

      await db.$transaction(async (tx) => {
        await tx.session.update({
          where: { id: pendingSession.id },
          data: {
            whatsappVerified: false, fwaFlagged: true,
            memberResponse: 'NO', memberResponseAt: new Date(),
            lastVisitDate: lastVisitDate && !isNaN(lastVisitDate.getTime()) ? lastVisitDate : null,
          },
        });

        await tx.fwaCase.create({
          data: {
            caseRef, memberId: member.id, providerId: pendingSession.providerId,
            sessionId: pendingSession.id,
            flagType: 'MEMBER_DENIED_VISIT',
            status: 'OPEN',
            description: `Member denied visiting ${pendingSession.provider.gymName}. WhatsApp response: "${msg.text?.body}"`,
            memberStatement: msg.text?.body,
            lastVisitDate: lastVisitDate && !isNaN(lastVisitDate.getTime()) ? lastVisitDate : null,
          },
        });
      });

      await db.whatsAppMessage.update({ where: { messageId }, data: { processed: true, sessionId: pendingSession.id } });

      // Notify member via in-app
      await createInAppNotification(member.id, 'Fraud Alert Raised 🚨',
        `Your denial has been recorded. Case ${caseRef} has been opened for investigation.`);

      // Alert provider (async)
      if (pendingSession.provider.email) {
        sendFwaAlertToProvider(pendingSession.provider.email, caseRef, member.firstName).catch(() => {});
      }

      await logAudit({
        userId: member.id, action: 'FWA_AUTO_FLAGGED_VIA_WHATSAPP',
        resource: 'webhook', resourceId: pendingSession.id,
        ipAddress: 'whatsapp-webhook', status: 'SUCCESS',
        details: { caseRef, sessionId: pendingSession.id },
      });
    }
  }
}

// Paystack webhook — payment confirmation
router.post('/paystack', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-paystack-signature'] as string | undefined;

  if (env.PAYSTACK_WEBHOOK_SECRET && signature) {
    const hash = crypto.createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== signature) { res.status(401).json({ error: 'Invalid signature' }); return; }
  }

  res.status(200).json({ status: 'ok' });

  const event = req.body as { event?: string; data?: { reference?: string } };
  if (event.event === 'charge.success' && event.data?.reference) {
    const { verifyPayment } = await import('../services/payment.service');
    await verifyPayment(event.data.reference).catch(() => {});
  }
});

export default router;
