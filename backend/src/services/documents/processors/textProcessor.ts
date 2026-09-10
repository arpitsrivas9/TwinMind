import type { IDocumentProcessor, ExtractionResult, ExtractedSection } from './types';

export class TextProcessor implements IDocumentProcessor {
  canProcess(mimeType: string, filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/typescript' ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.markdown') ||
      lowerName.endsWith('.csv') ||
      lowerName.endsWith('.json') ||
      lowerName.endsWith('.ts') ||
      lowerName.endsWith('.js')
    );
  }

  async process(buffer: Buffer, filename?: string): Promise<ExtractionResult> {
    const rawText = buffer.toString('utf-8');
    const lines = rawText.split(/\r?\n/);
    const sections: ExtractedSection[] = [];
    let currentTitle = filename || 'Introduction';
    let currentLines: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        if (currentLines.length > 0) {
          const content = currentLines.join('\n').trim();
          if (content) {
            sections.push({ content, sectionTitle: currentTitle });
          }
          currentLines = [];
        }
        currentTitle = headingMatch[1].trim();
      }
      currentLines.push(line);
    }

    if (currentLines.length > 0) {
      const content = currentLines.join('\n').trim();
      if (content) {
        sections.push({ content, sectionTitle: currentTitle });
      }
    }

    if (sections.length === 0 && rawText.trim().length > 0) {
      sections.push({ content: rawText.trim(), sectionTitle: 'Content' });
    }

    return {
      text: rawText.trim(),
      sections,
      pageCount: 1,
    };
  }
}

