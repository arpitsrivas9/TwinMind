import { env, validateEnv } from '../src/config/env';

describe('TwinMind Environment Configuration & Fail-Fast Startup Validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('exposes validated environment configuration with required variables', () => {
    expect(env.databaseUrl).toBeDefined();
    expect(typeof env.databaseUrl).toBe('string');
    expect(env.databaseUrl.length).toBeGreaterThan(0);

    expect(env.jwtSecret).toBeDefined();
    expect(typeof env.jwtSecret).toBe('string');
    expect(env.jwtSecret.length).toBeGreaterThan(0);

    // Development non-sensitive defaults
    expect(env.port).toBe(4000);
    expect(env.corsOrigin).toBe('http://localhost:3000');
    expect(env.frontendUrl).toBe('http://localhost:3000');
  });

  it('successfully passes validateEnv when required variables are present', () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it('fails fast when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow('DATABASE_URL is required');
  });

  it('fails fast when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => validateEnv()).toThrow('JWT_SECRET is required');
  });

  it('does not leak secret values in error messages', () => {
    delete process.env.DATABASE_URL;
    try {
      validateEnv();
      fail('Should have thrown an error');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toBe('DATABASE_URL is required');
      expect(msg).not.toContain('postgresql');
      expect(msg).not.toContain('localhost');
      expect(msg).not.toContain('password');
    }
  });

  it('does not provide hardcoded password fallback for Neo4j', () => {
    // When NEO4J_PASSWORD is not set in environment, it should default to empty string, never a hardcoded secret
    delete process.env.NEO4J_PASSWORD;
    // Inspect the configured env neo4jPassword
    expect(env.neo4jPassword).not.toBe('twinmindgraph');
  });
});

