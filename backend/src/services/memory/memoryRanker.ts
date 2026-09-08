import type { Memory } from '@prisma/client';

export type ScoredMemory = {
  memory: Memory;
  score: number;
};

/**
 * Tokenizes text into lowercase words.
 */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2); // Ignore single/two letter noise words
  return new Set(words);
}

/**
 * Ranks stored active memories against current prompt and optional recent context.
 */
export function rankMemoriesForPrompt(
  memories: Memory[],
  prompt: string,
  recentContext = '',
  maxResults = 5,
): Memory[] {
  if (memories.length === 0) return [];

  const combinedQuery = `${prompt} ${recentContext}`.trim();
  const queryTokens = tokenize(combinedQuery);

  const scored: ScoredMemory[] = [];

  for (const memory of memories) {
    if (!memory.isActive) continue;

    const memoryTokens = tokenize(`${memory.content} ${memory.summary || ''}`);
    let overlapCount = 0;

    for (const token of memoryTokens) {
      if (queryTokens.has(token)) {
        overlapCount++;
      }
    }

    // Normalized token overlap score (0.0 to 1.0)
    const overlapScore = memoryTokens.size > 0 ? overlapCount / memoryTokens.size : 0;

    // Importance signal (1-10 -> 0.1 to 1.0)
    const importanceSignal = memory.importance / 10;

    // Confidence signal (0.0 to 1.0)
    const confidenceSignal = memory.confidence;

    // Base type bias:
    // USER_PREFERENCE applies broadly across conversational turns (e.g. "prefers concise answers").
    let typeBias = 0.1;
    if (memory.type === 'USER_PREFERENCE') {
      typeBias = 0.45;
    } else if (memory.type === 'PROJECT') {
      typeBias = 0.25;
    } else if (memory.type === 'GOAL') {
      typeBias = 0.2;
    }

    // Recency bonus (if accessed in last 24h)
    let recencyBonus = 0;
    if (memory.lastAccessedAt) {
      const hoursSinceAccess = (Date.now() - new Date(memory.lastAccessedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceAccess < 24) recencyBonus = 0.1;
    }

    // Weighted aggregate score
    const totalScore =
      overlapScore * 0.45 +
      importanceSignal * 0.2 +
      confidenceSignal * 0.15 +
      typeBias +
      recencyBonus;

    // Threshold: include if has token overlap OR is a high-confidence user preference
    const isRelevant =
      overlapCount > 0 ||
      (memory.type === 'USER_PREFERENCE' && memory.importance >= 6);

    if (isRelevant) {
      scored.push({ memory, score: totalScore });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map((s) => s.memory);
}

