import { env } from './config/env';
import { db } from './config/database';
import { logger } from './utils/logger';
import app from './app';
import { startPickupScheduler, stopPickupScheduler } from './services/prescription.service';

const PORT = parseInt(env.PORT, 10);

async function bootstrap() {
  try {
    await db.$connect();
    logger.info('Database connected');

    const server = app.listen(PORT, () => {
      logger.info(`LWH Wellness API listening on port ${PORT} [${env.NODE_ENV}]`);
    });

    // Prescription pickup sweep (T+6h trigger, retry, escalation).
    startPickupScheduler();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      stopPickupScheduler();
      server.close(async () => {
        await db.$disconnect();
        logger.info('Database disconnected');
        process.exit(0);
      });
      // Force exit after 10 seconds
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start server', { error: err });
    process.exit(1);
  }
}

bootstrap();
