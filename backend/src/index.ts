import app from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

const port = env.port;

app.listen(port, () => {
  logger.info('TwinMind API started', { port });
});
