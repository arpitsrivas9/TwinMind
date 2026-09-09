import type { MemoryType } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { containsSensitiveInformation, validateMemoryContent } from './memoryValidator';

export type ExtractedMemoryCandidate = {
  type: MemoryType;
  content: string;
  summary: string;
  importance: number; // 1 - 10
  confidence: number; // 0.0 - 1.0
};

// Heuristic keyword patterns for personal statements
const PREFERENCE_REGEX = /\b(i\s+prefer|i\s+like|i\s+dislike|i\s+hate|i\s+love|my\s+preference|always\s+give\s+me|always\s+respond|keep\s+it\s+(?:concise|brief|short|detailed)|format\s+(?:as|in)\s+(?:bullet|code)|i\s+favor)\b/i;
const GOAL_REGEX = /\b(my\s+goal|i\s+want\s+to\s+(?:become|learn|build|achieve|finish)|i'm\s+trying\s+to|i\s+aim\s+to|i\s+plan\s+to|my\s+target\s+is|aspiring\s+to)\b/i;
const PROJECT_REGEX = /\b(i'm\s+building|i\s+am\s+building|i'm\s+working\s+on|my\s+project|the\s+app\s+i'm\s+making|our\s+project|tech\s+stack\s+is|building\s+twinmind|my\s+codebase)\b/i;
const EPISODIC_REGEX = /\b(i\s+(?:just\s+)?(?:completed|passed|attended|graduated|started|joined|interviewed|finished|won|shipped))\b/i;
const SEMANTIC_REGEX = /\b(i\s+work\s+as|i\s+am\s+a\s+(?:software|developer|engineer|designer|student|founder)|i\s+(?:primarily\s+)?use\s+[a-z0-9#+.]+|my\s+experience\s+with|i\s+live\s+in|i'm\s+based\s+in)\b/i;

// Temporary statements that should NOT be durable memories
const TEMPORARY_REGEX = /\b(today|tonight|right\s+now|at\s+the\s+moment|this\s+morning|this\s+afternoon|going\s+to\s+the\s+gym|eating|having\s+lunch|sleepy|tired|brb|be\s+right\s+back)\b/i;

/**
 * Fast rule-based candidate detection.
 * Avoids executing expensive LLM calls for general knowledge questions or trivial turns.
 */
export function isCandidateForMemory(userText: string): boolean {
  if (!userText || typeof userText !== 'string') return false;
  const trimmed = userText.trim();

  // If very short or contains secrets, reject immediately
  if (trimmed.length < 8 || containsSensitiveInformation(trimmed)) return false;

  // If it's a transient temporary statement with no durable substance, ignore
  if (TEMPORARY_REGEX.test(trimmed) && !PREFERENCE_REGEX.test(trimmed) && !GOAL_REGEX.test(trimmed) && !PROJECT_REGEX.test(trimmed)) {
    return false;
  }

  // Check if any durable pattern matches
  return (
    PREFERENCE_REGEX.test(trimmed) ||
    GOAL_REGEX.test(trimmed) ||
    PROJECT_REGEX.test(trimmed) ||
    EPISODIC_REGEX.test(trimmed) ||
    SEMANTIC_REGEX.test(trimmed)
  );
}

const EXTRACTION_SYSTEM_PROMPT = `
You are TwinMemory™ Extractor, a specialized cognitive extraction component of TwinMind.
Your task is to analyze the conversation turn and identify durable, long-term personal facts, preferences, goals, projects, or background about the user that are worth remembering across future conversations.

CRITICAL RULES:
1. ONLY extract durable facts about the user.
2. NEVER extract transient state (e.g. "I'm going to sleep", "I ate pizza today").
3. NEVER extract sensitive info (passwords, tokens, API keys, private keys, financial data).
4. Formulate content in the third person: "User prefers concise answers." or "User is building TwinMind with Next.js."
5. Classify each memory strictly into one of:
   - USER_PREFERENCE: Personal styling, formatting, tools, language, communication preference.
   - GOAL: A career, learning, or personal milestone the user aims to achieve.
   - PROJECT: An active project, software system, or application the user is creating or maintaining.
   - EPISODIC: A specific meaningful biographical event or experience (completed milestone, interview).
   - SEMANTIC: Factual background (profession, skills, technologies commonly used, location).
   - CONVERSATION: General durable insight derived from conversation.
6. Rate importance on a scale of 1-10 (10 = highest lifetime relevance, 1 = trivial).
7. Rate confidence on a scale of 0.0-1.0 (1.0 = explicitly stated by user, 0.5 = inferred).
8. If no durable memory should be stored, return an empty array: [].

Respond ONLY with a valid JSON array matching this format:
[
  {
    "type": "USER_PREFERENCE",
    "content": "User prefers concise explanations.",
    "summary": "Prefers concise explanations",
    "importance": 8,
    "confidence": 0.95
  }
]
`.trim();

/**
 * Extracts candidate memories from a conversation turn using LLM.
 */
export async function extractMemoriesFromTurn(
  userText: string,
  assistantText?: string,
): Promise<ExtractedMemoryCandidate[]> {
  if (!isCandidateForMemory(userText)) {
    return [];
  }

  const prompt = [
    `User message: "${userText}"`,
    assistantText ? `Assistant response: "${assistantText.slice(0, 500)}"` : '',
    'Extract durable user memories if applicable. Return JSON array only.',
  ].filter(Boolean).join('\n');

  try {
    let rawJsonResponse = '';

    if (env.geminiApiKey) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 1024,
            temperature: 0.1,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json() as {
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
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 1024,
        }),
      });

      if (res.ok) {
        const data = await res.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        rawJsonResponse = data.choices?.[0]?.message?.content || '';
      }
    } else {
      // Fallback rule-based extraction when no external LLM API key is present (e.g. in offline unit tests)
      return fallbackExtractFromText(userText);
    }

    if (!rawJsonResponse) {
      return fallbackExtractFromText(userText);
    }

    // Parse JSON safely
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJsonResponse);
      if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
        // Handle cases where model wraps array in { "memories": [...] }
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.memories)) parsed = obj.memories;
      }
    } catch {
      logger.warn('Failed to parse memory extraction JSON response', { raw: rawJsonResponse });
      return fallbackExtractFromText(userText);
    }

    if (!Array.isArray(parsed)) return [];

    const candidates: ExtractedMemoryCandidate[] = [];
    const validTypes: MemoryType[] = [
      'USER_PREFERENCE',
      'GOAL',
      'PROJECT',
      'EPISODIC',
      'SEMANTIC',
      'CONVERSATION',
    ];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const type = (item.type as MemoryType) || 'SEMANTIC';
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      const summary = typeof item.summary === 'string' ? item.summary.trim() : content.slice(0, 60);
      const importance = typeof item.importance === 'number' ? Math.min(10, Math.max(1, Math.round(item.importance))) : 5;
      const confidence = typeof item.confidence === 'number' ? Math.min(1.0, Math.max(0.1, item.confidence)) : 0.9;

      if (!validTypes.includes(type)) continue;

      const validation = validateMemoryContent(content);
      if (!validation.valid) {
        logger.info('Memory candidate rejected by validator', { content, reason: validation.reason });
        continue;
      }

      candidates.push({
        type,
        content,
        summary: summary.slice(0, 255),
        importance,
        confidence,
      });
    }

    return candidates;
  } catch (error) {
    logger.error('Error during memory extraction', { error });
    return fallbackExtractFromText(userText);
  }
}

/**
 * Deterministic fallback extractor for common patterns.
 * Essential for test suites and offline environments.
 */
export function fallbackExtractFromText(text: string): ExtractedMemoryCandidate[] {
  const trimmed = text.trim();
  if (!isCandidateForMemory(trimmed) || containsSensitiveInformation(trimmed)) {
    return [];
  }

  // Preference match
  if (PREFERENCE_REGEX.test(trimmed)) {
    return [
      {
        type: 'USER_PREFERENCE',
        content: `User preference: ${trimmed.replace(/^i\s+/i, 'User ')}`,
        summary: trimmed.slice(0, 50),
        importance: 8,
        confidence: 0.95,
      },
    ];
  }

  // Goal match
  if (GOAL_REGEX.test(trimmed)) {
    return [
      {
        type: 'GOAL',
        content: `User goal: ${trimmed.replace(/^i\s+/i, 'User ')}`,
        summary: trimmed.slice(0, 50),
        importance: 8,
        confidence: 0.9,
      },
    ];
  }

  // Project match
  if (PROJECT_REGEX.test(trimmed)) {
    return [
      {
        type: 'PROJECT',
        content: `User project: ${trimmed.replace(/^i'm\s+/i, 'User is ')}`,
        summary: trimmed.slice(0, 50),
        importance: 7,
        confidence: 0.9,
      },
    ];
  }

  // Episodic match
  if (EPISODIC_REGEX.test(trimmed)) {
    return [
      {
        type: 'EPISODIC',
        content: `User event: ${trimmed.replace(/^i\s+/i, 'User ')}`,
        summary: trimmed.slice(0, 50),
        importance: 6,
        confidence: 0.85,
      },
    ];
  }

  // Semantic match
  if (SEMANTIC_REGEX.test(trimmed)) {
    return [
      {
        type: 'SEMANTIC',
        content: `User fact: ${trimmed.replace(/^i\s+/i, 'User ')}`,
        summary: trimmed.slice(0, 50),
        importance: 6,
        confidence: 0.85,
      },
    ];
  }

  return [];
}

