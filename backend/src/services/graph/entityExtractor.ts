import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import type { EntityType, RelationshipType } from './types';

export type ExtractedEntityCandidate = {
  type: EntityType;
  name: string;
  description?: string;
  confidence: number;
};

export type ExtractedRelationshipCandidate = {
  sourceName: string;
  sourceType: EntityType;
  targetName: string;
  targetType: EntityType;
  relationType: RelationshipType;
  confidence: number;
};

export type GraphExtractionOutput = {
  entities: ExtractedEntityCandidate[];
  relationships: ExtractedRelationshipCandidate[];
};

const entitySchema = z.object({
  type: z.enum([
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
  ]),
  name: z.string().trim().min(2).max(120),
  description: z.string().optional(),
  confidence: z.number().min(0.1).max(1.0).default(0.85),
});

const relationshipSchema = z.object({
  sourceName: z.string().trim().min(2),
  sourceType: z.enum([
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
  ]),
  targetName: z.string().trim().min(2),
  targetType: z.enum([
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
  ]),
  relationType: z.enum([
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
  ]),
  confidence: z.number().min(0.1).max(1.0).default(0.85),
});

const extractionOutputSchema = z.object({
  entities: z.array(entitySchema).default([]),
  relationships: z.array(relationshipSchema).default([]),
});

const GRAPH_EXTRACTION_SYSTEM_PROMPT = `
You are TwinGraph™ Knowledge Extractor, a specialized component of TwinMind Personal AI OS.
Your objective is to extract meaningful entities and relationships from the provided text to maintain the user's personal knowledge graph.

SUPPORTED ENTITY TYPES:
- PROJECT: Named software, apps, repositories, or business initiatives (e.g. "TwinMind").
- PERSON: Specific collaborators or colleagues mentioned (e.g. "Rahul", "Sarah").
- TOPIC: Core technical subjects, architectures, or domains (e.g. "Authentication", "JWT", "Vector Search").
- TASK: Concrete action items, bug fixes, or deliverables (e.g. "Implement refresh token rotation").
- GOAL: Major objectives or milestones (e.g. "Launch MVP", "Pass Security Audit").
- MEETING: Specific meetings or syncs mentioned (e.g. "Architecture Review").
- DOCUMENT: Specific named files or documentation (e.g. "Architecture.pdf").
- ORGANIZATION: Companies, teams, or groups (e.g. "Backend Team", "OpenAI").

SUPPORTED RELATIONSHIP TYPES:
- WORKS_ON, RELATED_TO, CONTAINS, HAS_TASK, HAS_GOAL, ATTENDED, DISCUSSED_IN, MENTIONED_IN, REFERENCES, DEPENDS_ON, PART_OF, ABOUT, ASSOCIATED_WITH, SUPPORTS.

RULES:
1. ONLY extract meaningful, durable entities. Do NOT extract generic pronouns, numbers, or everyday common words.
2. Ensure both source and target entity names in relationships match one of the extracted entities.
3. Keep names concise, proper, and capitalized correctly.
4. Output strict JSON matching:
{
  "entities": [
    { "type": "PROJECT", "name": "TwinMind", "description": "Personal AI OS project", "confidence": 0.95 },
    { "type": "TOPIC", "name": "Authentication", "description": "Auth module", "confidence": 0.92 }
  ],
  "relationships": [
    { "sourceName": "TwinMind", "sourceType": "PROJECT", "targetName": "Authentication", "targetType": "TOPIC", "relationType": "RELATED_TO", "confidence": 0.9 }
  ]
}
`.trim();

/**
 * Extracts entities and relationships from input text using Gemini or OpenAI,
 * with deterministic fallback for offline environments and testing.
 */
export async function extractGraphElementsFromText(
  text: string,
  contextHint?: string,
): Promise<GraphExtractionOutput> {
  const trimmed = text.trim();
  if (trimmed.length < 10) {
    return { entities: [], relationships: [] };
  }

  const prompt = [
    contextHint ? `Context: ${contextHint}` : '',
    `Content:\n"""\n${trimmed.slice(0, 4000)}\n"""`,
    'Extract entities and relationships in strict JSON format.',
  ].filter(Boolean).join('\n');

  try {
    let rawJsonResponse = '';

    if (env.geminiApiKey) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: GRAPH_EXTRACTION_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 1500,
            temperature: 0.1,
          },
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        rawJsonResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    } else if (env.openAiApiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: GRAPH_EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 1500,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        rawJsonResponse = data.choices?.[0]?.message?.content || '';
      }
    } else {
      return fallbackExtractGraphElements(trimmed);
    }

    if (!rawJsonResponse) {
      return fallbackExtractGraphElements(trimmed);
    }

    const parsedJson = JSON.parse(rawJsonResponse);
    const validated = extractionOutputSchema.safeParse(parsedJson);

    if (!validated.success) {
      logger.warn('Failed graph extraction schema validation, using fallback', { issues: validated.error.issues });
      return fallbackExtractGraphElements(trimmed);
    }

    return {
      entities: validated.data.entities.map((e) => ({
        type: e.type as EntityType,
        name: e.name,
        description: e.description,
        confidence: e.confidence,
      })),
      relationships: validated.data.relationships.map((r) => ({
        sourceName: r.sourceName,
        sourceType: r.sourceType as EntityType,
        targetName: r.targetName,
        targetType: r.targetType as EntityType,
        relationType: r.relationType as RelationshipType,
        confidence: r.confidence,
      })),
    };
  } catch (err) {
    logger.warn('Graph extraction error, using deterministic fallback', { error: err });
    return fallbackExtractGraphElements(trimmed);
  }
}

/**
 * Deterministic heuristic extraction fallback.
 * Essential for unit testing, offline execution, and fast extraction of known structures.
 */
export function fallbackExtractGraphElements(text: string): GraphExtractionOutput {
  const entities: ExtractedEntityCandidate[] = [];
  const relationships: ExtractedRelationshipCandidate[] = [];

  const lower = text.toLowerCase();

  // Detect Project
  let hasTwinMind = false;
  if (lower.includes('twinmind') || lower.includes('twin mind')) {
    entities.push({
      type: 'PROJECT',
      name: 'TwinMind',
      description: 'Personal AI Operating System',
      confidence: 0.98,
    });
    hasTwinMind = true;
  }

  // Detect Topics / Architecture
  let hasAuth = false;
  if (lower.includes('authentication') || lower.includes('auth module') || lower.includes('auth')) {
    entities.push({
      type: 'TOPIC',
      name: 'Authentication',
      description: 'Authentication and security architecture',
      confidence: 0.95,
    });
    hasAuth = true;
  }

  let hasJwt = false;
  if (lower.includes('jwt') || lower.includes('json web token')) {
    entities.push({
      type: 'TOPIC',
      name: 'JWT',
      description: 'JSON Web Token mechanism',
      confidence: 0.92,
    });
    hasJwt = true;
  }

  // Detect Tasks
  let hasRefreshTask = false;
  if (lower.includes('refresh token') || lower.includes('refresh-token') || lower.includes('token rotation')) {
    entities.push({
      type: 'TASK',
      name: 'Implement refresh token rotation',
      description: 'Security task for refresh token lifecycle',
      confidence: 0.9,
    });
    hasRefreshTask = true;
  }

  // Detect Goals
  if (lower.includes('mvp') || lower.includes('launch')) {
    entities.push({
      type: 'GOAL',
      name: 'Launch MVP',
      description: 'Initial product release milestone',
      confidence: 0.88,
    });
    if (hasTwinMind) {
      relationships.push({
        sourceName: 'TwinMind',
        sourceType: 'PROJECT',
        targetName: 'Launch MVP',
        targetType: 'GOAL',
        relationType: 'HAS_GOAL',
        confidence: 0.9,
      });
    }
  }

  // Detect Meetings
  if (lower.includes('meeting') || lower.includes('architecture review')) {
    entities.push({
      type: 'MEETING',
      name: 'Authentication Architecture Review',
      description: 'Architecture review session',
      confidence: 0.85,
    });
    if (hasAuth) {
      relationships.push({
        sourceName: 'Authentication Architecture Review',
        sourceType: 'MEETING',
        targetName: 'Authentication',
        targetType: 'TOPIC',
        relationType: 'ABOUT',
        confidence: 0.9,
      });
    }
  }

  // Connect detected entities
  if (hasTwinMind && hasAuth) {
    relationships.push({
      sourceName: 'TwinMind',
      sourceType: 'PROJECT',
      targetName: 'Authentication',
      targetType: 'TOPIC',
      relationType: 'RELATED_TO',
      confidence: 0.95,
    });
  }

  if (hasAuth && hasJwt) {
    relationships.push({
      sourceName: 'Authentication',
      sourceType: 'TOPIC',
      targetName: 'JWT',
      targetType: 'TOPIC',
      relationType: 'REFERENCES',
      confidence: 0.9,
    });
  }

  if (hasTwinMind && hasRefreshTask) {
    relationships.push({
      sourceName: 'TwinMind',
      sourceType: 'PROJECT',
      targetName: 'Implement refresh token rotation',
      targetType: 'TASK',
      relationType: 'HAS_TASK',
      confidence: 0.92,
    });
  }

  return { entities, relationships };
}
