import app from './app';
import { env, validateEnv } from './config/env';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { seedDevAccount } from './services/devAuthService';

// Validate required environment variables at application startup
validateEnv();

const startServer = async () => {
  const server = app.listen(env.port, () => {
    logger.info('TwinMind API server started', { port: env.port });
  });

  try {
    await prisma.$connect();
    logger.info('PostgreSQL database connected successfully');
    await seedDevAccount();
  } catch (error) {
    logger.warn('Database connection unavailable at startup. Operating with pending database reconnect.', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return server;
};

startServer();
