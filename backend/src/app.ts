import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import conversationRoutes from './routes/conversationRoutes';
import aiRoutes from './routes/aiRoutes';
import messageRoutes from './routes/messageRoutes';
import memoryRoutes from './routes/memoryRoutes';
import documentRoutes from './routes/documentRoutes';
import searchRoutes from './routes/searchRoutes';
import graphRoutes from './routes/graphRoutes';
import voiceRoutes from './routes/voiceRoutes';
import trustRoutes from './routes/trustRoutes';
import deviceRoutes from './routes/deviceRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './lib/logger';

const app = express();

const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) return true;
  if (origin === env.corsOrigin || origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') {
    return true;
  }
  if (env.nodeEnv !== 'production') {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('combined'));

// Authentication and health routes are mounted before rate limiting to prevent lockouts
app.use('/api/auth', authRoutes);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'twinmind-backend' });
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'production' ? 1000 : 100000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  skip: () => env.nodeEnv === 'development' || env.nodeEnv === 'test',
});

app.use('/api', apiLimiter);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/trust', trustRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/conversations/:id/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

logger.info('TwinMind backend initialized', { port: env.port });

export default app;
