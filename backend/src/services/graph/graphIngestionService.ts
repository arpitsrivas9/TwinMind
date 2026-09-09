import { getGraphStore } from './graphStore';
import { extractGraphElementsFromText } from './entityExtractor';
import { logger } from '../../lib/logger';
import type { GraphEntityData, GraphRelationshipData } from './types';

export class GraphIngestionService {
  private store = getGraphStore();

  /**
   * Ingests entities and relationships from a conversation message.
   */
  async ingestFromMessage(
    userId: string,
    messageId: string,
    content: string,
    conversationId: string,
  ): Promise<{ entities: GraphEntityData[]; relationships: GraphRelationshipData[] }> {
    try {
      const extracted = await extractGraphElementsFromText(content, `Message in conversation ${conversationId}`);
      if (extracted.entities.length === 0) {
        return { entities: [], relationships: [] };
      }

      const entityMap = new Map<string, GraphEntityData>();
      const createdEntities: GraphEntityData[] = [];

      // 1. Ensure User entity exists
      const userEntity = await this.store.createEntity({
        userId,
        type: 'USER',
        name: 'Owner',
        confidence: 1.0,
      });
      entityMap.set('user', userEntity);

      // 2. Upsert extracted entities
      for (const e of extracted.entities) {
        const entity = await this.store.createEntity({
          userId,
          type: e.type,
          name: e.name,
          description: e.description,
          confidence: e.confidence,
          metadata: { sourceMessageId: messageId, conversationId },
        });
        entityMap.set(e.name.toLowerCase(), entity);
        createdEntities.push(entity);

        // If it's a project, automatically link User -> WORKS_ON -> Project
        if (e.type === 'PROJECT') {
          await this.store.createRelationship({
            userId,
            sourceEntityId: userEntity.id,
            targetEntityId: entity.id,
            type: 'WORKS_ON',
            confidence: 0.95,
            sourceType: 'MESSAGE',
            sourceId: messageId,
          });
        }
      }

      // 3. Create extracted relationships
      const createdRelationships: GraphRelationshipData[] = [];
      for (const r of extracted.relationships) {
        const source = entityMap.get(r.sourceName.toLowerCase());
        const target = entityMap.get(r.targetName.toLowerCase());

        if (source && target && source.id !== target.id) {
          const rel = await this.store.createRelationship({
            userId,
            sourceEntityId: source.id,
            targetEntityId: target.id,
            type: r.relationType,
            confidence: r.confidence,
            sourceType: 'MESSAGE',
            sourceId: messageId,
            metadata: { conversationId },
          });
          createdRelationships.push(rel);
        }
      }

      logger.info('Graph elements ingested from message', {
        userId,
        messageId,
        entitiesCount: createdEntities.length,
        relationsCount: createdRelationships.length,
      });

      return { entities: createdEntities, relationships: createdRelationships };
    } catch (err) {
      logger.warn('Failed to ingest graph elements from message', { messageId, error: err });
      return { entities: [], relationships: [] };
    }
  }

  /**
   * Ingests entities and relationships from a durable memory fact.
   */
  async ingestFromMemory(
    userId: string,
    memory: { id: string; type: string; content: string; summary?: string | null },
  ): Promise<void> {
    try {
      const extracted = await extractGraphElementsFromText(memory.content, `Memory type: ${memory.type}`);

      const userEntity = await this.store.createEntity({
        userId,
        type: 'USER',
        name: 'Owner',
        confidence: 1.0,
      });

      for (const e of extracted.entities) {
        const entity = await this.store.createEntity({
          userId,
          type: e.type,
          name: e.name,
          description: e.description || memory.summary || null,
          confidence: e.confidence,
          metadata: { memoryId: memory.id },
        });

        // Link User to Goal or Project
        if (e.type === 'GOAL') {
          await this.store.createRelationship({
            userId,
            sourceEntityId: userEntity.id,
            targetEntityId: entity.id,
            type: 'HAS_GOAL',
            confidence: 0.95,
            sourceType: 'MEMORY',
            sourceId: memory.id,
          });
        } else if (e.type === 'PROJECT') {
          await this.store.createRelationship({
            userId,
            sourceEntityId: userEntity.id,
            targetEntityId: entity.id,
            type: 'WORKS_ON',
            confidence: 0.95,
            sourceType: 'MEMORY',
            sourceId: memory.id,
          });
        }
      }
    } catch (err) {
      logger.warn('Failed to ingest graph from memory', { memoryId: memory.id, error: err });
    }
  }

  /**
   * Ingests document into graph, extracting topics, projects, and linking the document entity.
   */
  async ingestFromDocument(
    userId: string,
    documentId: string,
    filename: string,
    textContent: string,
  ): Promise<GraphEntityData> {
    // 1. Create DOCUMENT entity
    const docEntity = await this.store.createEntity({
      userId,
      type: 'DOCUMENT',
      name: filename,
      description: `Document: ${filename}`,
      confidence: 1.0,
      metadata: { documentId },
    });

    try {
      // 2. Extract topics, projects, goals from document text excerpt
      const sample = textContent.slice(0, 5000);
      const extracted = await extractGraphElementsFromText(sample, `Document ${filename}`);

      for (const e of extracted.entities) {
        if (e.type === 'DOCUMENT') continue; // Avoid redundant self-docs

        const relatedEntity = await this.store.createEntity({
          userId,
          type: e.type,
          name: e.name,
          description: e.description,
          confidence: e.confidence,
        });

        // Connect Document or Project
        if (e.type === 'PROJECT') {
          await this.store.createRelationship({
            userId,
            sourceEntityId: relatedEntity.id,
            targetEntityId: docEntity.id,
            type: 'HAS_DOCUMENT',
            confidence: 0.95,
            sourceType: 'DOCUMENT',
            sourceId: documentId,
          });
        } else {
          await this.store.createRelationship({
            userId,
            sourceEntityId: docEntity.id,
            targetEntityId: relatedEntity.id,
            type: 'ABOUT',
            confidence: 0.9,
            sourceType: 'DOCUMENT',
            sourceId: documentId,
          });
        }
      }
    } catch (err) {
      logger.warn('Failed to extract topics from document for graph', { documentId, error: err });
    }

    return docEntity;
  }

  /**
   * Clean up graph edges and entities when a source document or memory is deleted.
   */
  async handleSourceDeletion(userId: string, sourceType: string, sourceId: string): Promise<void> {
    try {
      // Clean edges that originated from this source
      await this.store.cleanSourceRelationships(userId, sourceType, sourceId);

      // If a document was deleted, delete its corresponding DOCUMENT entity
      if (sourceType === 'DOCUMENT') {
        const docEntities = await this.store.listEntities(userId, { type: 'DOCUMENT', limit: 100 });
        for (const doc of docEntities.entities) {
          const meta = doc.metadata as Record<string, unknown> | undefined;
          if (meta?.documentId === sourceId) {
            await this.store.deleteEntity(userId, doc.id);
          }
        }
      }
    } catch (err) {
      logger.warn('Error during graph source deletion cleanup', { userId, sourceType, sourceId, error: err });
    }
  }
}

let activeGraphIngestionService: GraphIngestionService | null = null;

export function getGraphIngestionService(): GraphIngestionService {
  if (!activeGraphIngestionService) {
    activeGraphIngestionService = new GraphIngestionService();
  }
  return activeGraphIngestionService;
}

