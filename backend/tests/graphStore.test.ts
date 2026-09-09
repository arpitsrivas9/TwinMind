import { PostgresGraphStore } from '../src/services/graph/graphStore';
import { prisma } from '../src/lib/prisma';

describe('TwinGraph™ GraphStore Test Suite', () => {
  const store = new PostgresGraphStore();
  let userA: { id: string };
  let userB: { id: string };

  beforeAll(async () => {
    userA = await prisma.user.create({
      data: {
        name: 'Graph User A',
        email: `graph_user_a_${Date.now()}@example.com`,
        passwordHash: 'dummyhash',
      },
    });

    userB = await prisma.user.create({
      data: {
        name: 'Graph User B',
        email: `graph_user_b_${Date.now()}@example.com`,
        passwordHash: 'dummyhash',
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
  });

  describe('1. Entity CRUD and Conservative Deduplication', () => {
    it('should create a new Project entity', async () => {
      const project = await store.createEntity({
        userId: userA.id,
        type: 'PROJECT',
        name: 'TwinMind',
        description: 'Personal AI OS',
      });

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.type).toBe('PROJECT');
      expect(project.name).toBe('TwinMind');
      expect(project.normalizedName).toBe('twinmind');
    });

    it('should conservatively merge entity when created with minor casing or spacing differences', async () => {
      const duplicate = await store.createEntity({
        userId: userA.id,
        type: 'PROJECT',
        name: 'twinmind',
        description: 'Updated description',
      });

      expect(duplicate.normalizedName).toBe('twinmind');

      const allProjects = await store.listEntities(userA.id, { type: 'PROJECT' });
      expect(allProjects.entities.length).toBe(1);
    });

    it('should retrieve entity by ID and by canonical name', async () => {
      const byName = await store.findEntityByName(userA.id, 'PROJECT', 'TwinMind');
      expect(byName).not.toBeNull();
      expect(byName?.name).toBe('twinmind');

      const byId = await store.getEntity(userA.id, byName!.id);
      expect(byId?.id).toBe(byName!.id);
    });

    it('should update entity details', async () => {
      const byName = await store.findEntityByName(userA.id, 'PROJECT', 'TwinMind');
      const updated = await store.updateEntity(userA.id, byName!.id, {
        description: 'New refined description',
        confidence: 0.99,
      });

      expect(updated.description).toBe('New refined description');
      expect(updated.confidence).toBe(0.99);
    });
  });

  describe('2. Relationship Creation & Traversal', () => {
    let projectEntityId: string;
    let topicEntityId: string;
    let taskEntityId: string;
    let docEntityId: string;

    beforeAll(async () => {
      const proj = await store.createEntity({
        userId: userA.id,
        type: 'PROJECT',
        name: 'TwinMind',
      });
      projectEntityId = proj.id;

      const topic = await store.createEntity({
        userId: userA.id,
        type: 'TOPIC',
        name: 'Authentication',
      });
      topicEntityId = topic.id;

      const task = await store.createEntity({
        userId: userA.id,
        type: 'TASK',
        name: 'Implement refresh token rotation',
      });
      taskEntityId = task.id;

      const doc = await store.createEntity({
        userId: userA.id,
        type: 'DOCUMENT',
        name: 'Architecture.pdf',
      });
      docEntityId = doc.id;
    });

    it('should create valid relationships with source traceability', async () => {
      const rel1 = await store.createRelationship({
        userId: userA.id,
        sourceEntityId: projectEntityId,
        targetEntityId: topicEntityId,
        type: 'RELATED_TO',
        confidence: 0.95,
        sourceType: 'CONVERSATION',
        sourceId: 'conv_123',
      });

      expect(rel1).toBeDefined();
      expect(rel1.type).toBe('RELATED_TO');
      expect(rel1.sourceType).toBe('CONVERSATION');
      expect(rel1.sourceId).toBe('conv_123');

      const rel2 = await store.createRelationship({
        userId: userA.id,
        sourceEntityId: topicEntityId,
        targetEntityId: taskEntityId,
        type: 'HAS_TASK',
        confidence: 0.9,
      });

      const rel3 = await store.createRelationship({
        userId: userA.id,
        sourceEntityId: projectEntityId,
        targetEntityId: docEntityId,
        type: 'HAS_DOCUMENT',
        confidence: 0.98,
      });

      expect(rel2).toBeDefined();
      expect(rel3).toBeDefined();
    });

    it('should reject self-referencing relationship creation', async () => {
      await expect(
        store.createRelationship({
          userId: userA.id,
          sourceEntityId: projectEntityId,
          targetEntityId: projectEntityId,
          type: 'RELATED_TO',
        }),
      ).rejects.toThrow('Cannot create self-referencing relationship');
    });

    it('should traverse depth 1 from project to find direct connections', async () => {
      const result = await store.traverse(userA.id, projectEntityId, 1);

      expect(result.startEntity.id).toBe(projectEntityId);
      const connectedNames = result.nodes.map((n) => n.entity.name);
      expect(connectedNames).toContain('Authentication');
      expect(connectedNames).toContain('Architecture.pdf');
    });

    it('should traverse depth 2 from project to find multi-hop task connection', async () => {
      const result = await store.traverse(userA.id, projectEntityId, 2);

      const connectedNames = result.nodes.map((n) => n.entity.name);
      expect(connectedNames).toContain('Implement refresh token rotation');
    });
  });

  describe('3. Strict User Isolation', () => {
    let entityUserA: { id: string };

    beforeAll(async () => {
      entityUserA = await store.createEntity({
        userId: userA.id,
        type: 'PROJECT',
        name: 'Private Alpha Project',
      });
    });

    it('user B cannot access user A entity by ID', async () => {
      const found = await store.getEntity(userB.id, entityUserA.id);
      expect(found).toBeNull();
    });

    it('user B cannot update user A entity', async () => {
      await expect(
        store.updateEntity(userB.id, entityUserA.id, { description: 'Hacked' }),
      ).rejects.toThrow('Entity not found or unauthorized');
    });

    it('user B cannot delete user A entity', async () => {
      await expect(
        store.deleteEntity(userB.id, entityUserA.id),
      ).rejects.toThrow('Entity not found or unauthorized');
    });

    it('user B cannot traverse user A graph', async () => {
      await expect(
        store.traverse(userB.id, entityUserA.id, 2),
      ).rejects.toThrow('Start entity not found or unauthorized');
    });
  });
});

