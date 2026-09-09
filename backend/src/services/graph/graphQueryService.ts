import { getGraphStore } from './graphStore';
import { resolveCanonicalKey } from './entityResolution';
import type { GraphEntityData, GraphRelationshipData, GraphTraversalResult } from './types';

export type ProjectContextResult = {
  project: GraphEntityData;
  documents: GraphEntityData[];
  tasks: GraphEntityData[];
  goals: GraphEntityData[];
  meetings: GraphEntityData[];
  topics: GraphEntityData[];
  people: GraphEntityData[];
  allRelationships: GraphRelationshipData[];
};

export class GraphQueryService {
  private store = getGraphStore();

  /**
   * Discovers comprehensive connected context around a given project.
   */
  async findProjectContext(userId: string, projectNameOrId: string): Promise<ProjectContextResult | null> {
    let project: GraphEntityData | null = null;

    // Check if ID was provided
    project = await this.store.getEntity(userId, projectNameOrId);
    if (!project || project.type !== 'PROJECT') {
      // Look up by canonical name
      project = await this.store.findEntityByName(userId, 'PROJECT', projectNameOrId);
    }

    if (!project) return null;

    // Bounded traversal depth 2
    const traversal = await this.store.traverse(userId, project.id, 2);

    const documents: GraphEntityData[] = [];
    const tasks: GraphEntityData[] = [];
    const goals: GraphEntityData[] = [];
    const meetings: GraphEntityData[] = [];
    const topics: GraphEntityData[] = [];
    const people: GraphEntityData[] = [];

    for (const node of traversal.nodes) {
      switch (node.entity.type) {
        case 'DOCUMENT':
          documents.push(node.entity);
          break;
        case 'TASK':
          tasks.push(node.entity);
          break;
        case 'GOAL':
          goals.push(node.entity);
          break;
        case 'MEETING':
          meetings.push(node.entity);
          break;
        case 'TOPIC':
          topics.push(node.entity);
          break;
        case 'PERSON':
          people.push(node.entity);
          break;
        default:
          break;
      }
    }

    return {
      project,
      documents,
      tasks,
      goals,
      meetings,
      topics,
      people,
      allRelationships: traversal.relationships,
    };
  }

  /**
   * Finds documents connected to an entity name or topic.
   */
  async findRelatedDocuments(userId: string, queryName: string): Promise<GraphEntityData[]> {
    const canonical = resolveCanonicalKey(queryName);
    const entities = await this.store.listEntities(userId, { search: canonical, limit: 10 });

    const targetEntity = entities.entities[0];
    if (!targetEntity) return [];

    const traversal = await this.store.traverse(userId, targetEntity.id, 2, {
      targetEntityTypes: ['DOCUMENT'],
      relationshipTypes: ['HAS_DOCUMENT', 'REFERENCES', 'ABOUT', 'RELATED_TO'],
    });

    return traversal.nodes
      .filter((n) => n.entity.type === 'DOCUMENT')
      .map((n) => n.entity);
  }

  /**
   * Finds tasks connected to a project, goal, or topic.
   */
  async findRelatedTasks(userId: string, queryName: string): Promise<GraphEntityData[]> {
    const canonical = resolveCanonicalKey(queryName);
    const entities = await this.store.listEntities(userId, { search: canonical, limit: 10 });

    const targetEntity = entities.entities[0];
    if (!targetEntity) return [];

    const traversal = await this.store.traverse(userId, targetEntity.id, 2, {
      targetEntityTypes: ['TASK'],
    });

    return traversal.nodes
      .filter((n) => n.entity.type === 'TASK')
      .map((n) => n.entity);
  }

  /**
   * Finds meetings discussing a topic, project, or task.
   */
  async findRelatedMeetings(userId: string, queryName: string): Promise<GraphEntityData[]> {
    const canonical = resolveCanonicalKey(queryName);
    const entities = await this.store.listEntities(userId, { search: canonical, limit: 10 });

    const targetEntity = entities.entities[0];
    if (!targetEntity) return [];

    const traversal = await this.store.traverse(userId, targetEntity.id, 2, {
      targetEntityTypes: ['MEETING'],
    });

    return traversal.nodes
      .filter((n) => n.entity.type === 'MEETING')
      .map((n) => n.entity);
  }

  /**
   * General graph neighborhood query.
   */
  async traverseNeighborhood(
    userId: string,
    entityId: string,
    maxDepth = 2,
  ): Promise<GraphTraversalResult> {
    return this.store.traverse(userId, entityId, maxDepth);
  }
}

let activeGraphQueryService: GraphQueryService | null = null;

export function getGraphQueryService(): GraphQueryService {
  if (!activeGraphQueryService) {
    activeGraphQueryService = new GraphQueryService();
  }
  return activeGraphQueryService;
}

