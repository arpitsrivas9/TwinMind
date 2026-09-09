import JSZip from 'jszip';
import type { IDocumentProcessor, ExtractionResult, ExtractedSection } from './types';
import { logger } from '../../../lib/logger';

export class PptxProcessor implements IDocumentProcessor {
  canProcess(mimeType: string, filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      mimeType === 'application/vnd.ms-powerpoint' ||
      lowerName.endsWith('.pptx') ||
      lowerName.endsWith('.ppt')
    );
  }

  async process(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    logger.info('Processing PowerPoint presentation', { filename, size: buffer.length });
    const zip = await JSZip.loadAsync(buffer);
    const sections: ExtractedSection[] = [];
    const slideFiles: Array<{ name: string; slideNum: number }> = [];

    zip.forEach((relativePath) => {
      const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideFiles.push({
          name: relativePath,
          slideNum: parseInt(match[1], 10),
        });
      }
    });

    slideFiles.sort((a, b) => a.slideNum - b.slideNum);

    const fullTextParts: string[] = [];

    for (const slide of slideFiles) {
      const xmlContent = await zip.file(slide.name)?.async('text');
      if (!xmlContent) continue;

      // Extract all text inside <a:t>...</a:t> XML nodes
      const textMatches = xmlContent.match(/<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/gi) || [];
      const slideText = textMatches
        .map((tag) => tag.replace(/<[^>]+>/g, '').trim())
        .filter((t) => t.length > 0)
        .join(' ');

      if (slideText) {
        const titleMatch = slideText.slice(0, 60);
        const sectionTitle = `Slide ${slide.slideNum}: ${titleMatch}`;
        sections.push({
          content: slideText,
          slideNumber: slide.slideNum,
          sectionTitle,
        });
        fullTextParts.push(`[Slide ${slide.slideNum}]\n${slideText}`);
      }
    }

    const fullText = fullTextParts.join('\n\n');

    return {
      text: fullText,
      sections,
      pageCount: slideFiles.length,
      metadata: {
        totalSlides: slideFiles.length,
      },
    };
  }
}

