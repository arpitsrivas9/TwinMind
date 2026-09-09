import type { EntityType } from './types';

/**
 * Normalizes entity names for conservative deduplication.
 * - Lowercases and trims
 * - Strips common leading articles ('the', 'a', 'an')
 * - Strips common punctuation and trademarks (™️, ®, ©)
 * - Collapses multiple spaces
 */
export function normalizeEntityName(name: string): string {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .replace(/[\u2122\u00ae\u00a9]/g, '') // strip ™, ®, ©
    .replace(/[^\w\s-]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:the|a|an)\s+/i, ''); // remove leading articles
}

/**
 * Common project/technology alias mapping.
 */
const KNOWN_ALIASES: Record<string, string> = {
  'twin mind': 'twinmind',
  'twinmind project': 'twinmind',
  'twinmind app': 'twinmind',
  'jwt authentication': 'jwt',
  'json web tokens': 'jwt',
  'refresh tokens': 'refresh token',
  'refresh token rotation': 'refresh token',
  'neo 4j': 'neo4j',
  'chroma db': 'chromadb',
  'chroma': 'chromadb',
  'postgres': 'postgresql',
  'next js': 'nextjs',
  'react js': 'react',
};

/**
 * Resolves a normalized canonical key from an entity name.
 */
export function resolveCanonicalKey(name: string): string {
  const normalized = normalizeEntityName(name);
  return KNOWN_ALIASES[normalized] || normalized;
}

/**
 * Checks if two entity candidates can be conservatively merged.
 * False merges are worse than duplicates, so we only merge when:
 * 1. Both entities share the same EntityType.
 * 2. Their normalized canonical names match, or one is an exact alias of the other.
 */
export function canMergeEntities(
  typeA: EntityType,
  nameA: string,
  typeB: EntityType,
  nameB: string,
): boolean {
  if (typeA !== typeB) return false;

  const keyA = resolveCanonicalKey(nameA);
  const keyB = resolveCanonicalKey(nameB);

  if (!keyA || !keyB) return false;

  // Exact normalized canonical match
  if (keyA === keyB) return true;

  // Substring match only for PROJECT or TOPIC when length > 6 and words match exactly
  if (typeA === 'PROJECT' || typeA === 'TOPIC') {
    if (keyA.includes(keyB) && keyA.replace(keyB, '').trim() === 'project') return true;
    if (keyB.includes(keyA) && keyB.replace(keyA, '').trim() === 'project') return true;
  }

  return false;
}

