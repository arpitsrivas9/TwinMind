export type ExtractedSection = {
  content: string;
  pageNumber?: number;
  slideNumber?: number;
  timestamp?: string;
  sectionTitle?: string;
};

export type ExtractionResult = {
  text: string;
  sections: ExtractedSection[];
  pageCount?: number;
  metadata?: Record<string, unknown>;
};

export interface IDocumentProcessor {
  canProcess(mimeType: string, filename: string): boolean;
  process(buffer: Buffer, filename: string): Promise<ExtractionResult>;
}

