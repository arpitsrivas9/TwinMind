import { prisma } from '../src/lib/prisma';
import { PostgresGraphStore } from '../src/services/graph/graphStore';
import { retrieveGraphAwareKnowledgeForPrompt } from '../src/services/rag/ragService';
import { formatRetrievedGraphContext } from '../src/services/promptService';

describe('TwinGraph™ Graph-Aware RAG Test Suite', () => {
  const store = new PostgresGraphStore();
  let user: { id: string };
  let doc: { id: string };

  beforeAll(async () => {
    user = await prisma.user.create({
      data: {
        name: 'Graph RAG User',
        email: `graph_rag_${Date.now()}@example.com`,
        passwordHash: 'dummyhash',
      },
    });

    // Create a document and chunk
    doc = await prisma.document.create({
      data: {
        userId: user.id,
        filename: 'auth_spec.pdf',
        originalFilename: 'Authentication Architecture.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: 'auth_spec.pdf',
        checksum: 'checksum123',
        status: 'READY',
      },
    });

    await prisma.documentChunk.create({
      data: {
        documentId: doc.id,
        userId: user.id,
        chunkIndex: 0,
        content:
          'TwinMind authentication architecture is built on JWT access tokens and secure refresh token rotation.',
        pageNumber: 7,
        tokenCount: 18,
        embedding: [0.1, 0.2, 0.3],
      },
    });

    // Create graph entities linking Project -> Document
    const projEntity = await store.createEntity({
      userId: user.id,
      type: 'PROJECT',
      name: 'TwinMind',
    });

    const docEntity = await store.createEntity({
      userId: user.id,
      type: 'DOCUMENT',
      name: 'Authentication Architecture.pdf',
      metadata: { documentId: doc.id },
    });

    const topicEntity = await store.createEntity({
      userId: user.id,
      type: 'TOPIC',
      name: 'Authentication',
    });

    await store.createRelationship({
      userId: user.id,
      sourceEntityId: projEntity.id,
      targetEntityId: docEntity.id,
      type: 'HAS_DOCUMENT',
      confidence: 0.98,
      sourceType: 'DOCUMENT',
      sourceId: doc.id,
    });

    await store.createRelationship({
      userId: user.id,
      sourceEntityId: projEntity.id,
      targetEntityId: topicEntity.id,
      type: 'RELATED_TO',
      confidence: 0.95,
      sourceType: 'CONVERSATION',
      sourceId: 'conv_456',
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });

  describe('1. Graph-Aware Contextual Retrieval', () => {
    it('should retrieve both document chunks and graph relationships for an entity query', async () => {
      const result = await retrieveGraphAwareKnowledgeForPrompt(
        user.id,
        'What is connected to the authentication work in my TwinMind project?',
      );

      // Should have retrieved document chunks
      expect(result.documents.length).toBeGreaterThan(0);
      expect(result.documents[0].documentTitle).toBe('Authentication Architecture.pdf');
      expect(result.documents[0].pageNumber).toBe(7);

      // Should have retrieved graph relationships
      expect(result.graphRelationships.length).toBeGreaterThan(0);
      const relTypes = result.graphRelationships.map((r) => r.relationType);
      expect(relTypes).toContain('HAS_DOCUMENT');
      expect(relTypes).toContain('RELATED_TO');
    });

    it('should format retrieved graph context with strict prompt injection defenses', () => {
      const sampleRels = [
        {
          sourceName: 'TwinMind',
          sourceType: 'PROJECT',
          relationType: 'HAS_DOCUMENT',
          targetName: 'Authentication Architecture.pdf',
          targetType: 'DOCUMENT',
          confidence: 0.98,
          sourceContext: 'DOCUMENT (doc_123)',
        },
      ];

      const formatted = formatRetrievedGraphContext(sampleRels);

      expect(formatted).toContain('<retrieved_knowledge_graph>');
      expect(formatted).toContain('</retrieved_knowledge_graph>');
      expect(formatted).toContain('SECURITY NOTICE');
      expect(formatted).toContain('PROJECT "TwinMind" HAS_DOCUMENT DOCUMENT "Authentication Architecture.pdf"');
      expect(formatted).toContain('Confidence: 98%');
    });
  });
});

