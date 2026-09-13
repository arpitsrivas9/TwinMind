import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function validateEnv(): void {
  requireEnv('DATABASE_URL');
  requireEnv('JWT_SECRET');
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
  aiMaxInputCharacters: Number(process.env.AI_MAX_INPUT_CHARACTERS || 12000),
  aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1200),
  aiContextMessageLimit: Number(process.env.AI_CONTEXT_MESSAGE_LIMIT || 20),
  aiRequestWindowMs: Number(process.env.AI_REQUEST_WINDOW_MS || 15 * 60 * 1000),
  aiRequestLimit: Number(process.env.AI_REQUEST_LIMIT || 30),
  storageProvider: process.env.STORAGE_PROVIDER || 'local',
  storageLocalDir: process.env.STORAGE_LOCAL_DIR || 'uploads/documents',
  maxFileSize: Number(process.env.MAX_FILE_SIZE || 25 * 1024 * 1024),
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'gemini',
  embeddingModel: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
  vectorDbUrl: process.env.VECTOR_DB_URL || 'http://localhost:8000',
  ragTopK: Number(process.env.RAG_TOP_K || 4),
  ragSimilarityThreshold: Number(process.env.RAG_SIMILARITY_THRESHOLD || 0.45),
  chunkSize: Number(process.env.CHUNK_SIZE || 1000),
  chunkOverlap: Number(process.env.CHUNK_OVERLAP || 150),
  graphStoreProvider: process.env.GRAPH_STORE_PROVIDER || 'hybrid',
  neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4jUser: process.env.NEO4J_USER || 'neo4j',
  neo4jPassword: process.env.NEO4J_PASSWORD || '',
  graphMaxTraversalDepth: Number(process.env.GRAPH_MAX_TRAVERSAL_DEPTH || 2),
  graphTraversalNodeLimit: Number(process.env.GRAPH_TRAVERSAL_NODE_LIMIT || 30),
  graphRagEntityBoost: Number(process.env.GRAPH_RAG_ENTITY_BOOST || 1.25),
  // Development default account (fail-closed: strictly disabled in production)
  devDefaultUsername: process.env.NODE_ENV === 'development' ? (process.env.DEV_DEFAULT_USERNAME || '').trim().replace(/^["']|["']$/g, '') : '',
  devDefaultPassword: process.env.NODE_ENV === 'development' ? (process.env.DEV_DEFAULT_PASSWORD || '').trim().replace(/^["']|["']$/g, '') : '',
};

