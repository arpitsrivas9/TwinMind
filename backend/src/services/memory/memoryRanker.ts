import type { Memory } from '@prisma/client';

export type ScoredMemory = {
  memory: Memory;
  score: number;
};

// Common tech and language acronyms that should not be dropped even if <= 2 chars
const MEANINGFUL_SHORT_TOKENS = new Set([
  'vs', 'ai', 'ml', 'db', 'js', 'ts', 'go', 'py', 'ui', 'ux', 'os', 'c', 'r', 'io'
]);

/**
 * Basic stemmer: canonicalizes common English plural and inflectional suffixes.
 */
function stemWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) {
    return word.slice(0, -3) + 'y';
  }
  if (word.endsWith('es') && word.length > 4) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Tokenizes text into lowercase words with canonical stemming and possessive stripping.
 */
export function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/'s\b/g, '') // Strip possessive 's (e.g. "User's" -> "User")
    .replace(/[-_./]/g, ' ') // Split hyphenated/slashed compound words
    .replace(/[^a-z0-9\s]/g, '');

  const rawWords = normalized.split(/\s+/).filter(Boolean);
  const tokenSet = new Set<string>();

  for (const w of rawWords) {
    if (w.length > 2 || MEANINGFUL_SHORT_TOKENS.has(w)) {
      tokenSet.add(w);
      const stemmed = stemWord(w);
      if (stemmed !== w) {
        tokenSet.add(stemmed);
      }
    }
  }

  return tokenSet;
}

// Intent patterns for general recall requests
const GENERAL_RECALL_REGEX =
  /\b(what\s+do\s+you\s+remember|what\s+do\s+you\s+know|who\s+am\s+i|tell\s+me\s+about\s+(?:me|myself)|recall\s+my|what\s+are\s+my|show\s+my\s+memories|everything\s+you\s+know|what\s+information\s+do\s+you\s+have|my\s+profile|my\s+details|my\s+background)\b/i;

const PREFERENCE_INTENT_REGEX =
  /\b(preference|preferences|prefer|favou?rite|favou?rites|style|communication\s+style|like|likes)\b/i;

const GOAL_INTENT_REGEX =
  /\b(goal|goals|target|targets|aim|aims|aspire|aspirations|plan|plans)\b/i;

const PROJECT_INTENT_REGEX =
  /\b(project|projects|app|apps|codebase|repo|building|system|architecture)\b/i;

/**
 * Ranks stored active memories against current prompt and optional recent context.
 */
export function rankMemoriesForPrompt(
  memories: Memory[],
  prompt: string,
  recentContextOrMaxResults: string | number = '',
  maxResults = 5,
): Memory[] {
  if (memories.length === 0) return [];

  const recentContext = typeof recentContextOrMaxResults === 'string' ? recentContextOrMaxResults : '';
  const effectiveLimit = typeof recentContextOrMaxResults === 'number' ? recentContextOrMaxResults : maxResults;

  const combinedQuery = `${prompt} ${recentContext}`.trim();
  const queryTokens = tokenize(combinedQuery);
  const isGeneralRecall = GENERAL_RECALL_REGEX.test(prompt);
  const isPreferenceQuery = PREFERENCE_INTENT_REGEX.test(prompt);
  const isGoalQuery = GOAL_INTENT_REGEX.test(prompt);
  const isProjectQuery = PROJECT_INTENT_REGEX.test(prompt);

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

    // Base type bias & Category Intent Boost:
    let typeBias = 0.1;
    if (memory.type === 'USER_PREFERENCE') {
      typeBias = isPreferenceQuery ? 0.70 : 0.40;
    } else if (memory.type === 'PROJECT') {
      typeBias = isProjectQuery ? 0.65 : 0.25;
    } else if (memory.type === 'GOAL') {
      typeBias = isGoalQuery ? 0.65 : 0.20;
    } else if (memory.type === 'SEMANTIC') {
      typeBias = 0.20;
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
      importanceSignal * 0.25 +
      confidenceSignal * 0.15 +
      typeBias +
      recencyBonus;

    // Relevance evaluation:
    // 1) Direct token overlap
    // 2) General recall intent (e.g. "What do you remember about me?") includes all high-importance memories
    // 3) Category intent matches memory type
    // 4) High-importance user preferences (importance >= 7) apply broadly
    const isRelevant =
      overlapCount > 0 ||
      isGeneralRecall ||
      (isPreferenceQuery && memory.type === 'USER_PREFERENCE') ||
      (isGoalQuery && memory.type === 'GOAL') ||
      (isProjectQuery && memory.type === 'PROJECT') ||
      (memory.type === 'USER_PREFERENCE' && memory.importance >= 7);

    if (isRelevant) {
      scored.push({ memory, score: totalScore });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, effectiveLimit).map((s) => s.memory);
}


