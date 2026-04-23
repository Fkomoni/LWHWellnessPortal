import { Router } from 'express';
import authRouter from './auth';
import memberRouter from './member';
import providerRouter from './provider';
import advocateRouter from './advocate';
import webhookRouter from './webhook';

const router = Router();

router.use('/auth', authRouter);
router.use('/member', memberRouter);
router.use('/provider', providerRouter);
router.use('/advocate', advocateRouter);
// Webhooks have their own raw body parsing needs — no JSON size limit
router.use('/webhooks', webhookRouter);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'lwh-wellness-api' });
});

export default router;
