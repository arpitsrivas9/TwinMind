import request from 'supertest';
import app from '../src/app';

describe('TwinMind TwinGraph™ REST API Test Suite', () => {
  jest.setTimeout(30000);

  let tokenUserA: string;
  let tokenUserB: string;
  let entityA1Id: string;
  let entityA2Id: string;
  let relAId: string;

  beforeAll(async () => {
    const emailA = `graph_owner_a_${Date.now()}@example.com`;
    const resA = await request(app).post('/api/auth/signup').send({
      name: 'Graph Owner A',
      email: emailA,
      password: 'Password123!',
    });
    tokenUserA = resA.body.data.token;

    const emailB = `graph_attacker_b_${Date.now()}@example.com`;
    const resB = await request(app).post('/api/auth/signup').send({
      name: 'Graph Attacker B',
      email: emailB,
      password: 'Password123!',
    });
    tokenUserB = resB.body.data.token;
  });

  describe('1. Authentication & Route Guards', () => {
    it('should reject unauthenticated overview request', async () => {
      const res = await request(app).get('/api/graph/overview');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated entity creation', async () => {
      const res = await request(app).post('/api/graph/entities').send({
        type: 'PROJECT',
        name: 'Secret Project',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('2. Entity Management (CRUD)', () => {
    it('should create an entity with valid data', async () => {
      const res = await request(app)
        .post('/api/graph/entities')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          type: 'PROJECT',
          name: 'TwinMind OS',
          description: 'Personal AI Operating System',
          confidence: 0.95,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('TwinMind OS');
      expect(res.body.data.type).toBe('PROJECT');
      entityA1Id = res.body.data.id;
    });

    it('should reject invalid entity data', async () => {
      const res = await request(app)
        .post('/api/graph/entities')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          type: 'INVALID_TYPE',
          name: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should create a second entity for relationship testing', async () => {
      const res = await request(app)
        .post('/api/graph/entities')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          type: 'DOCUMENT',
          name: 'Architecture Spec',
          description: 'Core design blueprint',
        });

      expect(res.status).toBe(201);
      entityA2Id = res.body.data.id;
    });

    it('should list entities for User A with pagination & filters', async () => {
      const res = await request(app)
        .get('/api/graph/entities?type=PROJECT')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.entities.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.entities.some((e: any) => e.id === entityA1Id)).toBe(true);
    });

    it('should get a single entity by ID with relationships', async () => {
      const res = await request(app)
        .get(`/api/graph/entities/${entityA1Id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.entity.id).toBe(entityA1Id);
      expect(Array.isArray(res.body.data.relationships)).toBe(true);
    });

    it('should update an existing entity', async () => {
      const res = await request(app)
        .patch(`/api/graph/entities/${entityA1Id}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          description: 'Updated AI Operating System Description',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe('Updated AI Operating System Description');
    });
  });

  describe('3. Relationship Management & Traversal', () => {
    it('should create a relationship between two entities', async () => {
      const res = await request(app)
        .post('/api/graph/relationships')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          sourceEntityId: entityA1Id,
          targetEntityId: entityA2Id,
          type: 'HAS_DOCUMENT',
          confidence: 0.9,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sourceEntityId).toBe(entityA1Id);
      expect(res.body.data.targetEntityId).toBe(entityA2Id);
      expect(res.body.data.type).toBe('HAS_DOCUMENT');
      relAId = res.body.data.id;
    });

    it('should list relationships for an entity', async () => {
      const res = await request(app)
        .get(`/api/graph/relationships?entityId=${entityA1Id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((r: any) => r.id === relAId)).toBe(true);
    });

    it('should execute bounded graph traversal', async () => {
      const res = await request(app)
        .post('/api/graph/query')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          startEntityId: entityA1Id,
          maxDepth: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('startEntity');
      expect(res.body.data.nodes.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.relationships.length).toBeGreaterThanOrEqual(1);
    });

    it('should query project context by project name', async () => {
      const res = await request(app)
        .get('/api/graph/projects/TwinMind%20OS/context')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.project.name).toBe('TwinMind OS');
      expect(res.body.data.documents.length).toBeGreaterThanOrEqual(1);
    });

    it('should return overview metrics for User A', async () => {
      const res = await request(app)
        .get('/api/graph/overview')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalEntities).toBeGreaterThanOrEqual(2);
      expect(res.body.data.totalRelationships).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Tenant Isolation & IDOR Protection', () => {
    it('should return empty overview for User B with zero entities and relationships', async () => {
      const res = await request(app)
        .get('/api/graph/overview')
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalEntities).toBe(0);
      expect(res.body.data.totalRelationships).toBe(0);
    });

    it('should prevent User B from reading User A entity', async () => {
      const res = await request(app)
        .get(`/api/graph/entities/${entityA1Id}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent User B from updating User A entity', async () => {
      const res = await request(app)
        .patch(`/api/graph/entities/${entityA1Id}`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(404);
    });

    it('should prevent User B from deleting User A entity', async () => {
      const res = await request(app)
        .delete(`/api/graph/entities/${entityA1Id}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
    });

    it('should prevent User B from deleting User A relationship', async () => {
      const res = await request(app)
        .delete(`/api/graph/relationships/${relAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
    });

    it('should reject unauthorized graph traversal query for User B attempting to access User A entity', async () => {
      const res = await request(app)
        .post('/api/graph/query')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({
          startEntityId: entityA1Id,
          maxDepth: 2,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Entity & Relationship Deletion', () => {
    it('should delete relationship for User A', async () => {
      const res = await request(app)
        .delete(`/api/graph/relationships/${relAId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should delete entity for User A and verify removal', async () => {
      const res = await request(app)
        .delete(`/api/graph/entities/${entityA1Id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);

      const checkRes = await request(app)
        .get(`/api/graph/entities/${entityA1Id}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(checkRes.status).toBe(404);
    });
  });
});

