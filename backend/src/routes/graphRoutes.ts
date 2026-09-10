import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { successResponse, errorResponse } from '../utils/apiResponse';
import { getGraphStore } from '../services/graph/graphStore';
import { getGraphQueryService } from '../services/graph/graphQueryService';
import type { EntityType } from '../services/graph/types';

const router = Router();

router.use(requireAuth);

const entityTypeEnum = z.enum([
  'USER',
  'PERSON',
  'PROJECT',
  'DOCUMENT',
  'TASK',
  'GOAL',
  'MEETING',
  'CONVERSATION',
  'MEMORY',
  'ORGANIZATION',
  'TOPIC',
]);

const relationshipTypeEnum = z.enum([
  'OWNS',
  'WORKS_ON',
  'RELATED_TO',
  'CONTAINS',
  'HAS_DOCUMENT',
  'HAS_TASK',
  'HAS_GOAL',
  'ATTENDED',
  'DISCUSSED_IN',
  'MENTIONED_IN',
  'DERIVED_FROM',
  'REFERENCES',
  'DEPENDS_ON',
  'PART_OF',
  'ABOUT',
  'ASSOCIATED_WITH',
  'CREATED_FROM',
  'SUPPORTS',
]);

const createEntitySchema = z.object({
  type: entityTypeEnum,
  name: z.string().trim().min(1).max(255),
  description: z.string().optional(),
  confidence: z.number().min(0.1).max(1.0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateEntitySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  confidence: z.number().min(0.1).max(1.0).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const createRelationshipSchema = z.object({
  sourceEntityId: z.string().min(1),
  targetEntityId: z.string().min(1),
  type: relationshipTypeEnum,
  confidence: z.number().min(0.1).max(1.0).optional(),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/graph/overview - Summary statistics for user's knowledge graph
router.get('/overview', async (req: AuthenticatedRequest, res, next) => {
  try {
    const store = getGraphStore();
    const overview = await store.getOverview(req.user!.id);
    return res.status(200).json(successResponse(overview));
  } catch (error) {
    return next(error);
  }
});

// GET /api/graph/entities - List entities
router.get('/entities', async (req: AuthenticatedRequest, res, next) => {
  try {
    const store = getGraphStore();
    const type = req.query.type as EntityType | undefined;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const result = await store.listEntities(req.user!.id, { type, search, page, limit });
    return res.status(200).json(successResponse(result));
  } catch (error) {
    return next(error);
  }
});

// GET /api/graph/entities/:id - Get single entity with direct relationships
router.get('/entities/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const store = getGraphStore();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const entity = await store.getEntity(req.user!.id, id);
    if (!entity) {
      return res.status(404).json(errorResponse('Entity not found'));
    }

    const relationships = await store.getRelationships(req.user!.id, entity.id);
    return res.status(200).json(successResponse({ entity, relationships }));
  } catch (error) {
    return next(error);
  }
});

// POST /api/graph/entities - Create an entity manually
router.post('/entities', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = createEntitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Invalid entity data', { issues: parsed.error.issues }));
    }

    const store = getGraphStore();
    const entity = await store.createEntity({
      userId: req.user!.id,
      ...parsed.data,
    });

    return res.status(201).json(successResponse(entity));
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/graph/entities/:id - Update an entity
router.patch('/entities/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = updateEntitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Invalid update data', { issues: parsed.error.issues }));
    }

    const store = getGraphStore();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const entity = await store.updateEntity(req.user!.id, id, parsed.data);
    return res.status(200).json(successResponse(entity));
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/graph/entities/:id - Delete an entity and cascading relationships
router.delete('/entities/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const store = getGraphStore();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await store.deleteEntity(req.user!.id, id);
    return res.status(200).json(successResponse({ deleted: true }));
  } catch (error) {
    return next(error);
  }
});

// GET /api/graph/relationships - List relationships
router.get('/relationships', async (req: AuthenticatedRequest, res, next) => {
  try {
    const store = getGraphStore();
    const entityId = req.query.entityId as string;
    if (!entityId) {
      return res.status(400).json(errorResponse('Query param "entityId" is required'));
    }

    const direction = (req.query.direction as 'OUT' | 'IN' | 'BOTH') || 'BOTH';
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const rels = await store.getRelationships(req.user!.id, entityId, { direction, limit });
    return res.status(200).json(successResponse(rels));
  } catch (error) {
    return next(error);
  }
});

// POST /api/graph/relationships - Create a relationship
router.post('/relationships', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = createRelationshipSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Invalid relationship data', { issues: parsed.error.issues }));
    }

    const store = getGraphStore();
    const rel = await store.createRelationship({
      userId: req.user!.id,
      ...parsed.data,
    });

    return res.status(201).json(successResponse(rel));
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/graph/relationships/:id - Delete a relationship
router.delete('/relationships/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const store = getGraphStore();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await store.deleteRelationship(req.user!.id, id);
    return res.status(200).json(successResponse({ deleted: true }));
  } catch (error) {
    return next(error);
  }
});

// GET /api/graph/projects/:name/context - Get connected context for a project
router.get('/projects/:name/context', async (req: AuthenticatedRequest, res, next) => {
  try {
    const queryService = getGraphQueryService();
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const context = await queryService.findProjectContext(req.user!.id, name);
    if (!context) {
      return res.status(404).json(errorResponse('Project not found in graph'));
    }

    return res.status(200).json(successResponse(context));
  } catch (error) {
    return next(error);
  }
});

// POST /api/graph/query - Bounded graph traversal query
router.post('/query', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { startEntityId, maxDepth, direction, minConfidence, limit } = req.body;
    if (!startEntityId || typeof startEntityId !== 'string') {
      return res.status(400).json(errorResponse('startEntityId is required'));
    }

    const store = getGraphStore();
    const result = await store.traverse(req.user!.id, startEntityId, maxDepth, {
      direction,
      minConfidence,
      limit,
    });

    return res.status(200).json(successResponse(result));
  } catch (error) {
    return next(error);
  }
});

export default router;
