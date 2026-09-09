import {
  normalizeEntityName,
  resolveCanonicalKey,
  canMergeEntities,
} from '../src/services/graph/entityResolution';
import {
  fallbackExtractGraphElements,
  extractGraphElementsFromText,
} from '../src/services/graph/entityExtractor';

describe('TwinGraph™ Extraction & Entity Resolution Test Suite', () => {
  describe('1. Name Normalization & Canonical Key Resolution', () => {
    it('should normalize entity names by stripping trademarks and punctuation', () => {
      expect(normalizeEntityName('TwinMind™')).toBe('twinmind');
      expect(normalizeEntityName('The TwinMind Project')).toBe('twinmind project');
      expect(normalizeEntityName('  Authentication Module  ')).toBe('authentication module');
    });

    it('should map known project and technology aliases', () => {
      expect(resolveCanonicalKey('twin mind')).toBe('twinmind');
      expect(resolveCanonicalKey('TwinMind Project')).toBe('twinmind');
      expect(resolveCanonicalKey('json web tokens')).toBe('jwt');
      expect(resolveCanonicalKey('refresh token rotation')).toBe('refresh token');
    });

    it('should conservatively determine mergeability of entities', () => {
      // Same canonical project -> merge
      expect(canMergeEntities('PROJECT', 'TwinMind™', 'PROJECT', 'twin mind')).toBe(true);

      // Same name but different types -> DO NOT merge
      expect(canMergeEntities('PROJECT', 'Authentication', 'TOPIC', 'Authentication')).toBe(false);

      // Unrelated names -> DO NOT merge
      expect(canMergeEntities('PROJECT', 'TwinMind', 'PROJECT', 'OtherApp')).toBe(false);
    });
  });

  describe('2. Graph Extraction from Context', () => {
    it('should extract Project, Topic, Task, and Goal from message text', () => {
      const text =
        "I'm building TwinMind and the authentication module uses JWT. We need to finish refresh token rotation before we can launch the MVP.";

      const result = fallbackExtractGraphElements(text);

      const entityTypes = result.entities.map((e) => e.type);
      const entityNames = result.entities.map((e) => e.name);

      expect(entityTypes).toContain('PROJECT');
      expect(entityNames).toContain('TwinMind');

      expect(entityTypes).toContain('TOPIC');
      expect(entityNames).toContain('Authentication');
      expect(entityNames).toContain('JWT');

      expect(entityTypes).toContain('TASK');
      expect(entityNames).toContain('Implement refresh token rotation');

      expect(entityTypes).toContain('GOAL');
      expect(entityNames).toContain('Launch MVP');

      // Check relationships
      const relTypes = result.relationships.map((r) => r.relationType);
      expect(relTypes).toContain('RELATED_TO');
      expect(relTypes).toContain('REFERENCES');
      expect(relTypes).toContain('HAS_TASK');
    });

    it('should handle short or empty text gracefully', async () => {
      const emptyResult = await extractGraphElementsFromText('hi');
      expect(emptyResult.entities).toEqual([]);
      expect(emptyResult.relationships).toEqual([]);
    });
  });
});

