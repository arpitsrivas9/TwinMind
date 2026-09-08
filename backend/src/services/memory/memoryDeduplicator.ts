import type { Memory } from '@prisma/client';
import type { ExtractedMemoryCandidate } from './memoryExtractor';

export type DeduplicationDecision = {
  action: 'NEW' | 'DUPLICATE' | 'SUPERSEDE';
  targetMemory?: Memory;
  confidenceAdjustment?: number;
};

/**
 * Calculates Jaccard word similarity between two text strings.
 */
function calculateWordSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean),
  );
  const wordsB = new Set(
    b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean),
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks if two preference statements contradict each other.
 * Example: "User prefers concise answers." vs "User prefers detailed technical explanations."
 * Example: "User prefers Python." vs "User prefers TypeScript."
 */
function isContradictoryPreference(existing: string, candidate: string): boolean {
  const normA = existing.toLowerCase();
  const normB = candidate.toLowerCase();

  // Concise vs Detailed
  if (
    (normA.includes('concise') || normA.includes('short') || normA.includes('brief')) &&
    (normB.includes('detailed') || normB.includes('in-depth') || normB.includes('long'))
  ) {
    return true;
  }
  if (
    (normB.includes('concise') || normB.includes('short') || normB.includes('brief')) &&
    (normA.includes('detailed') || normA.includes('in-depth') || normA.includes('long'))
  ) {
    return true;
  }

  // Language / tool conflict (e.g. prefers Python vs prefers TypeScript)
  const langTokens = ['python', 'typescript', 'javascript', 'go', 'rust', 'c++', 'java'];
  const matchedA = langTokens.filter((l) => normA.includes(l));
  const matchedB = langTokens.filter((l) => normB.includes(l));
  if (
    matchedA.length > 0 &&
    matchedB.length > 0 &&
    matchedA.some((l) => !matchedB.includes(l)) &&
    (normA.includes('prefer') || normA.includes('primary')) &&
    (normB.includes('prefer') || normB.includes('primary'))
  ) {
    return true;
  }

  return false;
}

/**
 * Analyzes candidate memory against existing active memories of the user.
 */
export function analyzeDeduplication(
  existingMemories: Memory[],
  candidate: ExtractedMemoryCandidate,
): DeduplicationDecision {
  for (const memory of existingMemories) {
    // 1. Check for exact or very high similarity
    const contentSimilarity = calculateWordSimilarity(memory.content, candidate.content);
    if (contentSimilarity >= 0.75) {
      return {
        action: 'DUPLICATE',
        targetMemory: memory,
        confidenceAdjustment: Math.min(1.0, memory.confidence + 0.05),
      };
    }

    // 2. Check for conflicting preferences
    if (memory.type === candidate.type && memory.type === 'USER_PREFERENCE') {
      if (isContradictoryPreference(memory.content, candidate.content)) {
        return {
          action: 'SUPERSEDE',
          targetMemory: memory,
        };
      }
    }

    // 3. Same goal or project updating
    if (memory.type === candidate.type && (memory.type === 'GOAL' || memory.type === 'PROJECT')) {
      const summarySim = memory.summary && candidate.summary ? calculateWordSimilarity(memory.summary, candidate.summary) : 0;
      if (summarySim >= 0.6) {
        return {
          action: 'SUPERSEDE',
          targetMemory: memory,
        };
      }
    }
  }

  return { action: 'NEW' };
}

