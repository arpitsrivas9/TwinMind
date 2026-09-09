import Tesseract from 'tesseract.js';
import type { IDocumentProcessor, ExtractionResult } from './types';
import { logger } from '../../../lib/logger';

export class OcrProcessor implements IDocumentProcessor {
  canProcess(mimeType: string, filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return (
      mimeType.startsWith('image/') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.webp') ||
      lowerName.endsWith('.bmp') ||
      lowerName.endsWith('.tiff')
    );
  }

  async process(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    logger.info('Performing OCR extraction', { filename, bufferSize: buffer.length });
    try {
      const { data } = await Tesseract.recognize(buffer, 'eng');
      const text = data.text ? data.text.trim() : '';

      return {
        text,
        sections: text
          ? [
              {
                content: text,
                sectionTitle: 'OCR Extracted Text',
                pageNumber: 1,
              },
            ]
          : [],
        pageCount: 1,
        metadata: {
          confidence: data.confidence,
        },
      };
    } catch (error) {
      logger.error('OCR processing failed', { filename, error });
      throw error;
    }
  }
}

