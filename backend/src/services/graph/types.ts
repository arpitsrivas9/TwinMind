export type EntityType =
  | 'USER'
  | 'PERSON'
  | 'PROJECT'
  | 'DOCUMENT'
  | 'TASK'
  | 'GOAL'
  | 'MEETING'
  | 'CONVERSATION'
  | 'MEMORY'
  | 'ORGANIZATION'
  | 'TOPIC';

export type RelationshipType =
  | 'OWNS'
  | 'WORKS_ON'
  | 'RELATED_TO'
  | 'CONTAINS'
  | 'HAS_DOCUMENT'
  | 'HAS_TASK'
  | 'HAS_GOAL'
  | 'ATTENDED'
  | 'DISCUSSED_IN'
  | 'MENTIONED_IN'
  | 'DERIVED_FROM'
  | 'REFERENCES'
  | 'DEPENDS_ON'
  | 'PART_OF'
  | 'ABOUT'
  | 'ASSOCIATED_WITH'
  | 'CREATED_FROM'
  | 'SUPPORTS';

export type GraphEntityData = {
  id: string;
  userId: string;
  type: EntityType;
  name: string;
  normalizedName: string;
  description?: string | null;
  confidence: number;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GraphRelationshipData = {
  id: string;
  userId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  confidence: number;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  sourceEntity?: GraphEntityData;
  targetEntity?: GraphEntityData;
};

export type CreateEntityInput = {
  userId: string;
  type: EntityType;
  name: string;
  description?: string | null;
  confidence?: number;
  metadata?: Record<string, unknown> | null;
};

export type UpdateEntityInput = Partial<{
  name: string;
  description: string | null;
  confidence: number;
  metadata: Record<string, unknown> | null;
}>;

export type CreateRelationshipInput = {
  userId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  confidence?: number;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TraversalOptions = {
  direction?: 'OUT' | 'IN' | 'BOTH';
  relationshipTypes?: RelationshipType[];
  targetEntityTypes?: EntityType[];
  minConfidence?: number;
  limit?: number;
};

export type GraphTraversalNode = {
  entity: GraphEntityData;
  depth: number;
  relationshipVia?: GraphRelationshipData;
};

export type GraphTraversalResult = {
  startEntity: GraphEntityData;
  nodes: GraphTraversalNode[];
  relationships: GraphRelationshipData[];
};

export type ListEntitiesOptions = {
  type?: EntityType;
  search?: string;
  page?: number;
  limit?: number;
};

export type GraphOverviewStats = {
  totalEntities: number;
  totalRelationships: number;
  entityCountByType: Record<EntityType, number>;
  topHubEntities: Array<{
    id: string;
    name: string;
    type: EntityType;
    connectionCount: number;
  }>;
};
