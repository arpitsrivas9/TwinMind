import mammoth from 'mammoth';
import type { IDocumentProcessor, ExtractionResult, ExtractedSection } from './types';
import { logger } from '../../../lib/logger';

export class DocxProcessor implements IDocumentProcessor {
  canProcess(mimeType: string, filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.doc')
    );
  }

  async process(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    logger.info('Processing DOCX document', { filename, size: buffer.length });
    const result = await mammoth.extractRawText({ buffer });
    const rawText = result.value ? result.value.trim() : '';

    const paragraphs = rawText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const sections: ExtractedSection[] = [];
    let currentTitle = 'Document Content';
    let currentBatch: string[] = [];

    for (const paragraph of paragraphs) {
      // If short and looks like a heading
      if (paragraph.length < 80 && !paragraph.endsWith('.') && paragraph.split(' ').length <= 10) {
        if (currentBatch.length > 0) {
          sections.push({
            content: currentBatch.join('\n\n'),
            sectionTitle: currentTitle,
          });
          currentBatch = [];
        }
        currentTitle = paragraph;
      } else {
        currentBatch.push(paragraph);
      }
    }

    if (currentBatch.length > 0) {
      sections.push({
        content: currentBatch.join('\n\n'),
        sectionTitle: currentTitle,
      });
    }

    if (sections.length === 0 && rawText.length > 0) {
      sections.push({
        content: rawText,
        sectionTitle: 'Document Content',
      });
    }

    return {
      text: rawText,
      sections,
      pageCount: Math.max(1, Math.ceil(rawText.length / 2500)),
      metadata: {
        warnings: result.messages,
      },
    };
  }
}

