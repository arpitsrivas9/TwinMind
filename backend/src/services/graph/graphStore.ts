import neo4j, { Driver, Session } from 'neo4j-driver';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { AppError } from '../../middleware/errorHandler';
import { resolveCanonicalKey } from './entityResolution';
import type {
  EntityType,
  RelationshipType,
  GraphEntityData,
  GraphRelationshipData,
  CreateEntityInput,
  UpdateEntityInput,
  CreateRelationshipInput,
  TraversalOptions,
  GraphTraversalResult,
  GraphTraversalNode,
  ListEntitiesOptions,
  GraphOverviewStats,
} from './types';

export interface IGraphStore {
  createEntity(input: CreateEntityInput): Promise<GraphEntityData>;
  getEntity(userId: string, id: string): Promise<GraphEntityData | null>;
  findEntityByName(userId: string, type: EntityType, name: string): Promise<GraphEntityData | null>;
  updateEntity(userId: string, id: string, updates: UpdateEntityInput): Promise<GraphEntityData>;
  deleteEntity(userId: string, id: string): Promise<void>;
  listEntities(userId: string, options?: ListEntitiesOptions): Promise<{ entities: GraphEntityData[]; total: number }>;

  createRelationship(input: CreateRelationshipInput): Promise<GraphRelationshipData>;
  getRelationships(userId: string, entityId: string, options?: TraversalOptions): Promise<GraphRelationshipData[]>;
  deleteRelationship(userId: string, id: string): Promise<void>;

  traverse(userId: string, startEntityId: string, maxDepth?: number, options?: TraversalOptions): Promise<GraphTraversalResult>;
  getOverview(userId: string): Promise<GraphOverviewStats>;
  cleanSourceRelationships(userId: string, sourceType: string, sourceId: string): Promise<number>;
}

/**
 * PostgreSQL implementation of GraphStore.
 * Guarantees ACID transactions, strict tenant isolation, cascade deletes,
 * and reliable operation without external container dependencies.
 */
export class PostgresGraphStore implements IGraphStore {
  async createEntity(input: CreateEntityInput): Promise<GraphEntityData> {
    const normalizedName = resolveCanonicalKey(input.name);
    if (!normalizedName) {
      throw new AppError('Entity name must not be empty', 400);
    }

    const confidence = input.confidence !== undefined ? Math.min(1.0, Math.max(0.1, input.confidence)) : 1.0;

    const entity = await prisma.graphEntity.upsert({
      where: {
        userId_type_normalizedName: {
          userId: input.userId,
          type: input.type,
          normalizedName,
        },
      },
      update: {
        name: input.name, // Keep latest descriptive casing
        description: input.description ?? undefined,
        confidence: Math.max(confidence),
        metadata: input.metadata ? (input.metadata as any) : undefined,
      },
      create: {
        userId: input.userId,
        type: input.type,
        name: input.name,
        normalizedName,
        description: input.description || null,
        confidence,
        metadata: input.metadata ? (input.metadata as any) : undefined,
      },
    });

    return {
      id: entity.id,
      userId: entity.userId,
      type: entity.type as EntityType,
      name: entity.name,
      normalizedName: entity.normalizedName,
      description: entity.description,
      confidence: entity.confidence,
      metadata: entity.metadata as Record<string, unknown> | null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async getEntity(userId: string, id: string): Promise<GraphEntityData | null> {
    const entity = await prisma.graphEntity.findFirst({
      where: { id, userId },
    });

    if (!entity) return null;

    return {
      id: entity.id,
      userId: entity.userId,
      type: entity.type as EntityType,
      name: entity.name,
      normalizedName: entity.normalizedName,
      description: entity.description,
      confidence: entity.confidence,
      metadata: entity.metadata as Record<string, unknown> | null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async findEntityByName(userId: string, type: EntityType, name: string): Promise<GraphEntityData | null> {
    const normalizedName = resolveCanonicalKey(name);
    if (!normalizedName) return null;

    const entity = await prisma.graphEntity.findUnique({
      where: {
        userId_type_normalizedName: {
          userId,
          type,
          normalizedName,
        },
      },
    });

    if (!entity) return null;

    return {
      id: entity.id,
      userId: entity.userId,
      type: entity.type as EntityType,
      name: entity.name,
      normalizedName: entity.normalizedName,
      description: entity.description,
      confidence: entity.confidence,
      metadata: entity.metadata as Record<string, unknown> | null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async updateEntity(userId: string, id: string, updates: UpdateEntityInput): Promise<GraphEntityData> {
    const existing = await this.getEntity(userId, id);
    if (!existing) {
      throw new AppError('Entity not found or unauthorized', 404);
    }

    const data: any = {};
    if (updates.name !== undefined) {
      data.name = updates.name;
      data.normalizedName = resolveCanonicalKey(updates.name);
    }
    if (updates.description !== undefined) {
      data.description = updates.description;
    }
    if (updates.confidence !== undefined) {
      data.confidence = Math.min(1.0, Math.max(0.1, updates.confidence));
    }
    if (updates.metadata !== undefined) {
      data.metadata = updates.metadata;
    }

    const updated = await prisma.graphEntity.update({
      where: { id },
      data,
    });

    return {
      id: updated.id,
      userId: updated.userId,
      type: updated.type as EntityType,
      name: updated.name,
      normalizedName: updated.normalizedName,
      description: updated.description,
      confidence: updated.confidence,
      metadata: updated.metadata as Record<string, unknown> | null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteEntity(userId: string, id: string): Promise<void> {
    const existing = await this.getEntity(userId, id);
    if (!existing) {
      throw new AppError('Entity not found or unauthorized', 404);
    }

    await prisma.graphEntity.delete({
      where: { id },
    });
  }

  async listEntities(userId: string, options: ListEntitiesOptions = {}): Promise<{ entities: GraphEntityData[]; total: number }> {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (options.type) where.type = options.type;
    if (options.search?.trim()) {
      where.OR = [
        { name: { contains: options.search.trim(), mode: 'insensitive' } },
        { description: { contains: options.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.graphEntity.count({ where }),
      prisma.graphEntity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return {
      total,
      entities: items.map((entity) => ({
        id: entity.id,
        userId: entity.userId,
        type: entity.type as EntityType,
        name: entity.name,
        normalizedName: entity.normalizedName,
        description: entity.description,
        confidence: entity.confidence,
        metadata: entity.metadata as Record<string, unknown> | null,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      })),
    };
  }

  async createRelationship(input: CreateRelationshipInput): Promise<GraphRelationshipData> {
    if (input.sourceEntityId === input.targetEntityId) {
      throw new AppError('Cannot create self-referencing relationship', 400);
    }

    // Verify both entities exist and belong to user
    const [source, target] = await Promise.all([
      this.getEntity(input.userId, input.sourceEntityId),
      this.getEntity(input.userId, input.targetEntityId),
    ]);

    if (!source || !target) {
      throw new AppError('Source or target entity not found or unauthorized', 404);
    }

    const confidence = input.confidence !== undefined ? Math.min(1.0, Math.max(0.1, input.confidence)) : 0.9;

    const rel = await prisma.graphRelationship.upsert({
      where: {
        userId_sourceEntityId_targetEntityId_type: {
          userId: input.userId,
          sourceEntityId: input.sourceEntityId,
          targetEntityId: input.targetEntityId,
          type: input.type,
        },
      },
      update: {
        confidence: Math.max(confidence),
        sourceType: input.sourceType || undefined,
        sourceId: input.sourceId || undefined,
        metadata: input.metadata ? (input.metadata as any) : undefined,
      },
      create: {
        userId: input.userId,
        sourceEntityId: input.sourceEntityId,
        targetEntityId: input.targetEntityId,
        type: input.type,
        confidence,
        sourceType: input.sourceType || null,
        sourceId: input.sourceId || null,
        metadata: input.metadata ? (input.metadata as any) : undefined,
      },
    });

    return {
      id: rel.id,
      userId: rel.userId,
      sourceEntityId: rel.sourceEntityId,
      targetEntityId: rel.targetEntityId,
      type: rel.type as RelationshipType,
      confidence: rel.confidence,
      sourceType: rel.sourceType,
      sourceId: rel.sourceId,
      metadata: rel.metadata as Record<string, unknown> | null,
      createdAt: rel.createdAt,
      updatedAt: rel.updatedAt,
      sourceEntity: source,
      targetEntity: target,
    };
  }

  async getRelationships(userId: string, entityId: string, options: TraversalOptions = {}): Promise<GraphRelationshipData[]> {
    const direction = options.direction || 'BOTH';
    const where: any = { userId };

    if (direction === 'OUT') {
      where.sourceEntityId = entityId;
    } else if (direction === 'IN') {
      where.targetEntityId = entityId;
    } else {
      where.OR = [{ sourceEntityId: entityId }, { targetEntityId: entityId }];
    }

    if (options.relationshipTypes && options.relationshipTypes.length > 0) {
      where.type = { in: options.relationshipTypes };
    }

    if (options.minConfidence !== undefined) {
      where.confidence = { gte: options.minConfidence };
    }

    const rels = await prisma.graphRelationship.findMany({
      where,
      include: {
        sourceEntity: true,
        targetEntity: true,
      },
      take: options.limit || 50,
      orderBy: { confidence: 'desc' },
    });

    return rels.map((r) => ({
      id: r.id,
      userId: r.userId,
      sourceEntityId: r.sourceEntityId,
      targetEntityId: r.targetEntityId,
      type: r.type as RelationshipType,
      confidence: r.confidence,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      metadata: r.metadata as Record<string, unknown> | null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      sourceEntity: {
        id: r.sourceEntity.id,
        userId: r.sourceEntity.userId,
        type: r.sourceEntity.type as EntityType,
        name: r.sourceEntity.name,
        normalizedName: r.sourceEntity.normalizedName,
        description: r.sourceEntity.description,
        confidence: r.sourceEntity.confidence,
        metadata: r.sourceEntity.metadata as Record<string, unknown> | null,
        createdAt: r.sourceEntity.createdAt,
        updatedAt: r.sourceEntity.updatedAt,
      },
      targetEntity: {
        id: r.targetEntity.id,
        userId: r.targetEntity.userId,
        type: r.targetEntity.type as EntityType,
        name: r.targetEntity.name,
        normalizedName: r.targetEntity.normalizedName,
        description: r.targetEntity.description,
        confidence: r.targetEntity.confidence,
        metadata: r.targetEntity.metadata as Record<string, unknown> | null,
        createdAt: r.targetEntity.createdAt,
        updatedAt: r.targetEntity.updatedAt,
      },
    }));
  }

  async deleteRelationship(userId: string, id: string): Promise<void> {
    const rel = await prisma.graphRelationship.findFirst({
      where: { id, userId },
    });

    if (!rel) {
      throw new AppError('Relationship not found or unauthorized', 404);
    }

    await prisma.graphRelationship.delete({
      where: { id },
    });
  }

  async traverse(
    userId: string,
    startEntityId: string,
    maxDepth = env.graphMaxTraversalDepth,
    options: TraversalOptions = {},
  ): Promise<GraphTraversalResult> {
    const startEntity = await this.getEntity(userId, startEntityId);
    if (!startEntity) {
      throw new AppError('Start entity not found or unauthorized', 404);
    }

    const boundedDepth = Math.min(3, Math.max(1, maxDepth));
    const nodeLimit = options.limit || env.graphTraversalNodeLimit;

    const visitedEntityIds = new Set<string>([startEntityId]);
    const visitedRelIds = new Set<string>();
    const resultNodes: GraphTraversalNode[] = [];
    const resultRels: GraphRelationshipData[] = [];

    let currentQueue: Array<{ entityId: string; depth: number }> = [{ entityId: startEntityId, depth: 0 }];

    while (currentQueue.length > 0 && resultNodes.length < nodeLimit) {
      const { entityId, depth } = currentQueue.shift()!;
      if (depth >= boundedDepth) continue;

      const directRels = await this.getRelationships(userId, entityId, options);

      for (const rel of directRels) {
        if (!visitedRelIds.has(rel.id)) {
          visitedRelIds.add(rel.id);
          resultRels.push(rel);
        }

        const neighborEntity = rel.sourceEntityId === entityId ? rel.targetEntity! : rel.sourceEntity!;

        if (options.targetEntityTypes && !options.targetEntityTypes.includes(neighborEntity.type)) {
          continue;
        }

        if (!visitedEntityIds.has(neighborEntity.id) && resultNodes.length < nodeLimit) {
          visitedEntityIds.add(neighborEntity.id);
          resultNodes.push({
            entity: neighborEntity,
            depth: depth + 1,
            relationshipVia: rel,
          });
          currentQueue.push({ entityId: neighborEntity.id, depth: depth + 1 });
        }
      }
    }

    return {
      startEntity,
      nodes: resultNodes,
      relationships: resultRels,
    };
  }

  async getOverview(userId: string): Promise<GraphOverviewStats> {
    const [totalEntities, totalRelationships, entities] = await Promise.all([
      prisma.graphEntity.count({ where: { userId } }),
      prisma.graphRelationship.count({ where: { userId } }),
      prisma.graphEntity.findMany({
        where: { userId },
        include: {
          _count: {
            select: { outEdges: true, inEdges: true },
          },
        },
      }),
    ]);

    const entityCountByType: Record<EntityType, number> = {
      USER: 0,
      PERSON: 0,
      PROJECT: 0,
      DOCUMENT: 0,
      TASK: 0,
      GOAL: 0,
      MEETING: 0,
      CONVERSATION: 0,
      MEMORY: 0,
      ORGANIZATION: 0,
      TOPIC: 0,
    };

    for (const e of entities) {
      const type = e.type as EntityType;
      if (entityCountByType[type] !== undefined) {
        entityCountByType[type]++;
      }
    }

    const topHubEntities = entities
      .map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type as EntityType,
        connectionCount: e._count.outEdges + e._count.inEdges,
      }))
      .sort((a, b) => b.connectionCount - a.connectionCount)
      .slice(0, 10);

    return {
      totalEntities,
      totalRelationships,
      entityCountByType,
      topHubEntities,
    };
  }

  async cleanSourceRelationships(userId: string, sourceType: string, sourceId: string): Promise<number> {
    const deleted = await prisma.graphRelationship.deleteMany({
      where: {
        userId,
        sourceType,
        sourceId,
      },
    });

    logger.info('Cleaned graph relationships for deleted source', { userId, sourceType, sourceId, count: deleted.count });
    return deleted.count;
  }
}

/**
 * Neo4j implementation of GraphStore.
 * Interacts with Neo4j cluster / single instance via Cypher with session management.
 */
export class Neo4jGraphStore implements IGraphStore {
  private driver: Driver | null = null;
  private postgresFallback: PostgresGraphStore;

  constructor() {
    this.postgresFallback = new PostgresGraphStore();
    try {
      if (env.neo4jUri) {
        this.driver = neo4j.driver(
          env.neo4jUri,
          neo4j.auth.basic(env.neo4jUser, env.neo4jPassword),
          { maxConnectionPoolSize: 25 },
        );
      }
    } catch (err) {
      logger.warn('Neo4j driver initialization failed, relying on PostgreSQL store', { error: err });
    }
  }

  private async getSession(): Promise<Session | null> {
    if (!this.driver) return null;
    try {
      const session = this.driver.session();
      // Fast check
      await session.run('RETURN 1 AS ping');
      return session;
    } catch {
      return null;
    }
  }

  async createEntity(input: CreateEntityInput): Promise<GraphEntityData> {
    // 1. Primary write to Postgres
    const entity = await this.postgresFallback.createEntity(input);

    // 2. Synchronize to Neo4j if available
    const session = await this.getSession();
    if (session) {
      try {
        await session.run(
          `
          MERGE (e:Entity { id: $id })
          SET e.userId = $userId,
              e.type = $type,
              e.name = $name,
              e.normalizedName = $normalizedName,
              e.description = $description,
              e.confidence = $confidence,
              e.updatedAt = datetime()
          WITH e
          CALL apoc.create.addLabels(e, [$type]) YIELD node
          RETURN node
          `,
          {
            id: entity.id,
            userId: entity.userId,
            type: entity.type,
            name: entity.name,
            normalizedName: entity.normalizedName,
            description: entity.description || '',
            confidence: entity.confidence,
          },
        );
      } catch (err) {
        logger.warn('Neo4j entity sync failed', { error: err });
      } finally {
        await session.close();
      }
    }

    return entity;
  }

  async getEntity(userId: string, id: string): Promise<GraphEntityData | null> {
    return this.postgresFallback.getEntity(userId, id);
  }

  async findEntityByName(userId: string, type: EntityType, name: string): Promise<GraphEntityData | null> {
    return this.postgresFallback.findEntityByName(userId, type, name);
  }

  async updateEntity(userId: string, id: string, updates: UpdateEntityInput): Promise<GraphEntityData> {
    const entity = await this.postgresFallback.updateEntity(userId, id, updates);

    const session = await this.getSession();
    if (session) {
      try {
        await session.run(
          `
          MATCH (e:Entity { id: $id, userId: $userId })
          SET e.name = $name,
              e.description = $description,
              e.confidence = $confidence,
              e.updatedAt = datetime()
          `,
          {
            id: entity.id,
            userId: entity.userId,
            name: entity.name,
            description: entity.description || '',
            confidence: entity.confidence,
          },
        );
      } catch (err) {
        logger.warn('Neo4j entity update sync failed', { error: err });
      } finally {
        await session.close();
      }
    }

    return entity;
  }

  async deleteEntity(userId: string, id: string): Promise<void> {
    await this.postgresFallback.deleteEntity(userId, id);

    const session = await this.getSession();
    if (session) {
      try {
        await session.run(
          `MATCH (e:Entity { id: $id, userId: $userId }) DETACH DELETE e`,
          { id, userId },
        );
      } catch (err) {
        logger.warn('Neo4j entity delete sync failed', { error: err });
      } finally {
        await session.close();
      }
    }
  }

  async listEntities(userId: string, options?: ListEntitiesOptions): Promise<{ entities: GraphEntityData[]; total: number }> {
    return this.postgresFallback.listEntities(userId, options);
  }

  async createRelationship(input: CreateRelationshipInput): Promise<GraphRelationshipData> {
    const rel = await this.postgresFallback.createRelationship(input);

    const session = await this.getSession();
    if (session) {
      try {
        await session.run(
          `
          MATCH (a:Entity { id: $sourceId, userId: $userId })
          MATCH (b:Entity { id: $targetId, userId: $userId })
          MERGE (a)-[r:RELATIONSHIP { id: $relId }]->(b)
          SET r.type = $type,
              r.confidence = $confidence,
              r.sourceType = $sourceType,
              r.sourceId = $evidenceId,
              r.updatedAt = datetime()
          `,
          {
            sourceId: input.sourceEntityId,
            targetId: input.targetEntityId,
            userId: input.userId,
            relId: rel.id,
            type: input.type,
            confidence: rel.confidence,
            sourceType: input.sourceType || '',
            evidenceId: input.sourceId || '',
          },
        );
      } catch (err) {
        logger.warn('Neo4j relationship sync failed', { error: err });
      } finally {
        await session.close();
      }
    }

    return rel;
  }

  async getRelationships(userId: string, entityId: string, options?: TraversalOptions): Promise<GraphRelationshipData[]> {
    return this.postgresFallback.getRelationships(userId, entityId, options);
  }

  async deleteRelationship(userId: string, id: string): Promise<void> {
    await this.postgresFallback.deleteRelationship(userId, id);

    const session = await this.getSession();
    if (session) {
      try {
        await session.run(
          `MATCH ()-[r:RELATIONSHIP { id: $id, userId: $userId }]->() DELETE r`,
          { id, userId },
        );
      } catch (err) {
        logger.warn('Neo4j relationship delete sync failed', { error: err });
      } finally {
        await session.close();
      }
    }
  }

  async traverse(userId: string, startEntityId: string, maxDepth?: number, options?: TraversalOptions): Promise<GraphTraversalResult> {
    return this.postgresFallback.traverse(userId, startEntityId, maxDepth, options);
  }

  async getOverview(userId: string): Promise<GraphOverviewStats> {
    return this.postgresFallback.getOverview(userId);
  }

  async cleanSourceRelationships(userId: string, sourceType: string, sourceId: string): Promise<number> {
    const count = await this.postgresFallback.cleanSourceRelationships(userId, sourceType, sourceId);

    const session = await this.getSession();
    if (session) {
      try {
        await session.run(
          `MATCH ()-[r:RELATIONSHIP { userId: $userId, sourceType: $sourceType, sourceId: $sourceId }]->() DELETE r`,
          { userId, sourceType, sourceId },
        );
      } catch (err) {
        logger.warn('Neo4j cleanSourceRelationships sync failed', { error: err });
      } finally {
        await session.close();
      }
    }

    return count;
  }
}

let activeGraphStore: IGraphStore | null = null;

export function getGraphStore(): IGraphStore {
  if (!activeGraphStore) {
    if (env.graphStoreProvider === 'neo4j' || env.graphStoreProvider === 'hybrid') {
      activeGraphStore = new Neo4jGraphStore();
    } else {
      activeGraphStore = new PostgresGraphStore();
    }
  }
  return activeGraphStore;
}

export function setGraphStore(store: IGraphStore) {
  activeGraphStore = store;
}
