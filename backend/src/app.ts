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
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './lib/logger';

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('combined'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/api/conversations/:id/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'twinmind-backend' });
});

app.use(notFoundHandler);
app.use(errorHandler);

logger.info('TwinMind backend initialized', { port: env.port });

export default app;
