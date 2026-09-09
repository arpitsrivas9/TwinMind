import type { IDocumentProcessor, ExtractionResult, ExtractedSection } from './types';
import { logger } from '../../../lib/logger';
import { OcrProcessor } from './ocrProcessor';

export class PdfProcessor implements IDocumentProcessor {
  private ocrProcessor = new OcrProcessor();

  canProcess(mimeType: string, filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
  }

  async process(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    logger.info('Processing PDF document', { filename, size: buffer.length });
    let fullText = '';
    const sections: ExtractedSection[] = [];
    let pageCount = 1;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfModule = require('pdf-parse');

      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        try {
          const res = await parser.getText();
          pageCount = res.total || 1;
          fullText = res.text || '';

          if (Array.isArray(res.pages) && res.pages.length > 0) {
            for (const page of res.pages) {
              const pageText = (page.text || '').trim();
              if (pageText) {
                sections.push({
                  content: pageText,
                  pageNumber: page.num || 1,
                  sectionTitle: `Page ${page.num || 1}`,
                });
              }
            }
          }
        } finally {
          if (typeof parser.destroy === 'function') {
            await parser.destroy().catch(() => {});
          }
        }
      } else if (typeof pdfModule === 'function') {
        const data = await pdfModule(buffer);
        fullText = data.text || '';
        pageCount = data.numpages || 1;
        if (fullText.trim()) {
          sections.push({
            content: fullText.trim(),
            pageNumber: 1,
            sectionTitle: 'Page 1',
          });
        }
      }
    } catch (parseError) {
      logger.warn('Direct PDF text extraction failed, attempting OCR fallback', { filename, error: parseError });
    }

    // If PDF text is empty (e.g. scanned PDF), attempt OCR extraction
    if (sections.length === 0 || fullText.trim().length === 0) {
      logger.info('PDF has no extractable text; falling back to OCR', { filename });
      try {
        const ocrResult = await this.ocrProcessor.process(buffer, filename);
        if (ocrResult.text.trim()) {
          return {
            text: ocrResult.text,
            sections: ocrResult.sections.map((s) => ({
              ...s,
              sectionTitle: `Scanned Document (Page 1)`,
              pageNumber: 1,
            })),
            pageCount: 1,
            metadata: { isScanned: true, ...ocrResult.metadata },
          };
        }
      } catch (ocrErr) {
        logger.warn('OCR fallback for PDF failed', { filename, error: ocrErr });
      }
    }

    return {
      text: fullText.trim(),
      sections,
      pageCount,
    };
  }
}

