import { Router } from 'express';
import authRouter from './auth';
import memberRouter from './member';
import providerRouter from './provider';
import advocateRouter from './advocate';

const router = Router();

router.use('/auth', authRouter);
router.use('/member', memberRouter);
router.use('/provider', providerRouter);
router.use('/advocate', advocateRouter);

// Health check — no auth required
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'lwh-wellness-api' });
});

export default router;
