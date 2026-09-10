import request from 'supertest';
import app from '../src/app';

describe('TwinMind TwinSearch™ Documents API Test Suite', () => {
  jest.setTimeout(30000);

  let tokenUserA: string;
  let tokenUserB: string;
  let docIdUserA: string;

  beforeAll(async () => {
    const emailA = `doc_owner_a_${Date.now()}@example.com`;
    const resA = await request(app).post('/api/auth/signup').send({
      name: 'Doc Owner A',
      email: emailA,
      password: 'Password123!',
    });
    tokenUserA = resA.body.data.token;

    const emailB = `doc_attacker_b_${Date.now()}@example.com`;
    const resB = await request(app).post('/api/auth/signup').send({
      name: 'Doc Attacker B',
      email: emailB,
      password: 'Password123!',
    });
    tokenUserB = resB.body.data.token;
  });

  describe('1. Document Upload & Validation', () => {
    it('should reject unauthenticated upload requests', async () => {
      const res = await request(app)
        .post('/api/documents/upload')
        .attach('file', Buffer.from('Confidential report content'), 'report.txt');

      expect(res.status).toBe(401);
    });

    it('should reject unsupported file extensions (.exe)', async () => {
      const res = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .attach('file', Buffer.from('malicious binary'), 'malware.exe');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported file extension');
    });

    it('should successfully upload and process a valid text document', async () => {
      const content = '# TwinMind Architecture\n\nTwinMind is a personal AI system featuring TwinMemory and TwinSearch with hybrid vector retrieval.';
      const res = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .attach('file', Buffer.from(content), 'architecture.md');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.originalFilename).toBe('architecture.md');
      expect(res.body.data.mimeType).toBe('text/markdown');
      docIdUserA = res.body.data.id;
    });

    it('should handle duplicate file uploads gracefully (checksum deduplication)', async () => {
      const content = '# TwinMind Architecture\n\nTwinMind is a personal AI system featuring TwinMemory and TwinSearch with hybrid vector retrieval.';
      const res = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .attach('file', Buffer.from(content), 'architecture.md');

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.id).toBeDefined();
    });
  });

  describe('2. Document Listing & Retrieval', () => {
    it('should list documents for authenticated User A', async () => {
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.documents.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.documents.some((d: { id: string }) => d.id === docIdUserA)).toBe(true);
    });

    it('should return empty document list for User B (User Isolation)', async () => {
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(0);
      expect(res.body.data.total).toBe(0);
    });

    it('should retrieve document details with chunks for owner', async () => {
      // Wait briefly for background processing to finish
      await new Promise((r) => setTimeout(r, 1500));

      const res = await request(app)
        .get(`/api/documents/${docIdUserA}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(docIdUserA);
      expect(res.body.data.chunks).toBeDefined();
    });
  });

  describe('3. Reprocessing & Management', () => {
    it('should allow owner to reprocess document', async () => {
      const res = await request(app)
        .post(`/api/documents/${docIdUserA}/reprocess`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(['PROCESSING', 'READY']).toContain(res.body.data.status);

      // Settle background processing before deletion test
      await new Promise((r) => setTimeout(r, 1500));
    });
  });

  describe('4. IDOR Protection (Strict Security Isolation)', () => {
    it('should prevent User B from reading User A document', async () => {
      const res = await request(app)
        .get(`/api/documents/${docIdUserA}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent User B from reprocessing User A document', async () => {
      const res = await request(app)
        .post(`/api/documents/${docIdUserA}/reprocess`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent User B from deleting User A document', async () => {
      const res = await request(app)
        .delete(`/api/documents/${docIdUserA}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Document Deletion', () => {
    it('should allow owner to delete document and purge stored assets', async () => {
      const res = await request(app)
        .delete(`/api/documents/${docIdUserA}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it is gone
      const verifyRes = await request(app)
        .get(`/api/documents/${docIdUserA}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(verifyRes.status).toBe(404);
    });
  });
});
