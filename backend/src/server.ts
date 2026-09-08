import app from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

const startServer = async () => {
  try {
    await prisma.$connect();
    app.listen(env.port, () => {
      logger.info('TwinMind API server started', { port: env.port });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

startServer();
