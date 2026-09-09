import JSZip from 'jszip';
import { TextProcessor } from '../src/services/documents/processors/textProcessor';
import { PptxProcessor } from '../src/services/documents/processors/pptxProcessor';
import { VideoProcessor } from '../src/services/documents/processors/videoProcessor';
import { chunkSections } from '../src/services/documents/chunker';

describe('TwinMind Document & Media Processors Test Suite', () => {
  describe('1. Text & Markdown Processor', () => {
    const textProcessor = new TextProcessor();

    it('should correctly match plain text and markdown mime types and extensions', () => {
      expect(textProcessor.canProcess('text/plain', 'notes.txt')).toBe(true);
      expect(textProcessor.canProcess('text/markdown', 'readme.md')).toBe(true);
      expect(textProcessor.canProcess('application/octet-stream', 'data.csv')).toBe(true);
      expect(textProcessor.canProcess('application/pdf', 'file.pdf')).toBe(false);
    });

    it('should extract heading-based sections from markdown documents', async () => {
      const markdown = `
# Executive Summary
TwinMind is a local-first personal AI operating system.

## Core Features
1. Short-term and long-term memory.
2. TwinSearch hybrid RAG.

### Security Model
Strict user isolation across database and vector stores.
      `.trim();

      const result = await textProcessor.process(Buffer.from(markdown), 'manual.md');
      expect(result.text).toContain('Executive Summary');
      expect(result.sections.length).toBeGreaterThanOrEqual(3);
      expect(result.sections[0].sectionTitle).toBe('Executive Summary');
      expect(result.sections[1].sectionTitle).toBe('Core Features');
      expect(result.sections[2].sectionTitle).toBe('Security Model');
    });
  });

  describe('2. PPTX Presentation Processor', () => {
    const pptxProcessor = new PptxProcessor();

    it('should match PPTX files', () => {
      expect(pptxProcessor.canProcess('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'deck.pptx')).toBe(true);
      expect(pptxProcessor.canProcess('application/octet-stream', 'slides.pptx')).toBe(true);
      expect(pptxProcessor.canProcess('text/plain', 'slides.txt')).toBe(false);
    });

    it('should extract slides and slide numbers from PPTX zip structures', async () => {
      const zip = new JSZip();
      zip.file('ppt/slides/slide1.xml', '<p:sp><a:t>Slide 1: Welcome to TwinMind RAG</a:t></p:sp>');
      zip.file('ppt/slides/slide2.xml', '<p:sp><a:t>Slide 2: Vector Search Architecture</a:t></p:sp>');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      const result = await pptxProcessor.process(buffer, 'presentation.pptx');
      expect(result.pageCount).toBe(2);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].slideNumber).toBe(1);
      expect(result.sections[0].content).toContain('Welcome to TwinMind');
      expect(result.sections[1].slideNumber).toBe(2);
      expect(result.sections[1].content).toContain('Vector Search Architecture');
    });
  });

  describe('3. Video & Audio Processor', () => {
    const videoProcessor = new VideoProcessor();

    it('should match video and audio formats', () => {
      expect(videoProcessor.canProcess('video/mp4', 'demo.mp4')).toBe(true);
      expect(videoProcessor.canProcess('video/webm', 'recording.webm')).toBe(true);
      expect(videoProcessor.canProcess('audio/mp3', 'podcast.mp3')).toBe(true);
      expect(videoProcessor.canProcess('audio/wav', 'voice.wav')).toBe(true);
      expect(videoProcessor.canProcess('application/pdf', 'paper.pdf')).toBe(false);
    });

    it('should extract timestamped segments from media content', async () => {
      const dummyMediaBuffer = Buffer.from('mock video binary stream data');
      const result = await videoProcessor.process(dummyMediaBuffer, 'demo_walkthrough.mp4');

      expect(result.text).toBeDefined();
      expect(result.sections.length).toBeGreaterThanOrEqual(1);
      expect(result.sections[0].timestamp).toBeDefined();
      expect(result.metadata?.mediaType).toBe('video');
    });
  });

  describe('4. Semantic Chunker with Overlap & Metadata', () => {
    it('should chunk sections while preserving page, slide, and timestamp metadata', () => {
      const sections = [
        {
          content: 'This is the first section of the document with important details about architecture. '.repeat(10),
          pageNumber: 1,
          sectionTitle: 'Architecture Overview',
        },
        {
          content: 'Here is a slide covering the vector store embeddings and cosine distance formulas. '.repeat(10),
          slideNumber: 3,
          sectionTitle: 'Vector Store Slide',
        },
        {
          content: 'Video narration discussing user isolation and JWT authentication tokens. '.repeat(10),
          timestamp: '03:45',
          sectionTitle: 'Security Timestamp',
        },
      ];

      const chunks = chunkSections(sections, { chunkSize: 250, chunkOverlap: 40 });
      expect(chunks.length).toBeGreaterThanOrEqual(3);

      // Verify metadata preservation
      const pageChunk = chunks.find((c) => c.pageNumber === 1);
      expect(pageChunk).toBeDefined();
      expect(pageChunk?.sectionTitle).toBe('Architecture Overview');

      const slideChunk = chunks.find((c) => c.slideNumber === 3);
      expect(slideChunk).toBeDefined();

      const videoChunk = chunks.find((c) => c.timestamp === '03:45');
      expect(videoChunk).toBeDefined();
      expect(videoChunk?.timestamp).toBe('03:45');
    });

    it('should maintain overlap between contiguous text blocks', () => {
      const longText = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} describing TwinMind system behavior.`).join(' ');
      const sections = [{ content: longText }];

      const chunks = chunkSections(sections, { chunkSize: 200, chunkOverlap: 50 });
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[1].chunkIndex).toBe(1);
    });
  });
});

