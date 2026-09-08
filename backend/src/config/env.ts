import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://twinmind:twinmind@localhost:5432/twinmind?schema=public',
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-me',
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  aiMaxInputCharacters: Number(process.env.AI_MAX_INPUT_CHARACTERS || 12000),
  aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1200),
  aiContextMessageLimit: Number(process.env.AI_CONTEXT_MESSAGE_LIMIT || 20),
  aiRequestWindowMs: Number(process.env.AI_REQUEST_WINDOW_MS || 15 * 60 * 1000),
  aiRequestLimit: Number(process.env.AI_REQUEST_LIMIT || 30),
};
