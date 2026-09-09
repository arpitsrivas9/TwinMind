import { env } from '../../config/env';
import type { ExtractedSection } from './processors/types';

export type DocumentChunkCandidate = {
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  slideNumber?: number;
  timestamp?: string;
  sectionTitle?: string;
  tokenCount: number;
};

export type ChunkerOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
};

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Estimates token count based on standard ~4 characters per token heuristic.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Splits sections into overlapping semantic chunks respecting paragraph and sentence boundaries.
 */
export function chunkSections(
  sections: ExtractedSection[],
  options: ChunkerOptions = {},
): DocumentChunkCandidate[] {
  const chunkSize = options.chunkSize || env.chunkSize;
  const chunkOverlap = options.chunkOverlap || env.chunkOverlap;
  const chunks: DocumentChunkCandidate[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const normalized = normalizeText(section.content);
    if (!normalized) continue;

    // If section fits comfortably within one chunk
    if (normalized.length <= chunkSize) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: normalized,
        pageNumber: section.pageNumber,
        slideNumber: section.slideNumber,
        timestamp: section.timestamp,
        sectionTitle: section.sectionTitle,
        tokenCount: estimateTokenCount(normalized),
      });
      continue;
    }

    // Split large section by paragraphs
    const paragraphs = normalized.split('\n\n').map((p) => p.trim()).filter(Boolean);
    let currentChunkText = '';

    for (const para of paragraphs) {
      // If adding this paragraph exceeds chunk size and we already have content
      if (currentChunkText.length + para.length + 2 > chunkSize && currentChunkText.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          content: currentChunkText.trim(),
          pageNumber: section.pageNumber,
          slideNumber: section.slideNumber,
          timestamp: section.timestamp,
          sectionTitle: section.sectionTitle,
          tokenCount: estimateTokenCount(currentChunkText.trim()),
        });

        // Retain overlap from end of current chunk
        const overlapStart = Math.max(0, currentChunkText.length - chunkOverlap);
        const overlapText = currentChunkText.slice(overlapStart).trim();
        currentChunkText = overlapText ? `${overlapText}\n\n${para}` : para;
      } else {
        currentChunkText = currentChunkText ? `${currentChunkText}\n\n${para}` : para;
      }

      // If a single paragraph itself is larger than chunkSize, split by sentences
      while (currentChunkText.length > chunkSize * 1.5) {
        const slice = currentChunkText.slice(0, chunkSize);
        // Find last sentence punctuation
        const lastPunctuation = Math.max(
          slice.lastIndexOf('. '),
          slice.lastIndexOf('? '),
          slice.lastIndexOf('! '),
          slice.lastIndexOf('\n'),
        );
        const splitPoint = lastPunctuation > chunkSize * 0.5 ? lastPunctuation + 1 : chunkSize;

        const chunkPart = currentChunkText.slice(0, splitPoint).trim();
        chunks.push({
          chunkIndex: chunkIndex++,
          content: chunkPart,
          pageNumber: section.pageNumber,
          slideNumber: section.slideNumber,
          timestamp: section.timestamp,
          sectionTitle: section.sectionTitle,
          tokenCount: estimateTokenCount(chunkPart),
        });

        const overlapStart = Math.max(0, splitPoint - chunkOverlap);
        currentChunkText = currentChunkText.slice(overlapStart).trim();
      }
    }

    if (currentChunkText.trim().length > 0) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: currentChunkText.trim(),
        pageNumber: section.pageNumber,
        slideNumber: section.slideNumber,
        timestamp: section.timestamp,
        sectionTitle: section.sectionTitle,
        tokenCount: estimateTokenCount(currentChunkText.trim()),
      });
    }
  }

  return chunks;
}

