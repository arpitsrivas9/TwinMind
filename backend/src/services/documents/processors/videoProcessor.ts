import type { IDocumentProcessor, ExtractionResult, ExtractedSection } from './types';
import { env } from '../../../config/env';
import { logger } from '../../../lib/logger';

export class VideoProcessor implements IDocumentProcessor {
  canProcess(mimeType: string, filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return (
      mimeType.startsWith('video/') ||
      mimeType.startsWith('audio/') ||
      lowerName.endsWith('.mp4') ||
      lowerName.endsWith('.webm') ||
      lowerName.endsWith('.mov') ||
      lowerName.endsWith('.mkv') ||
      lowerName.endsWith('.avi') ||
      lowerName.endsWith('.mp3') ||
      lowerName.endsWith('.wav') ||
      lowerName.endsWith('.m4a')
    );
  }

  async process(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    logger.info('Processing Video/Audio media file', { filename, size: buffer.length });
    const sections: ExtractedSection[] = [];
    let fullText = '';

    // If Gemini API is configured and file size is within direct base64 limit (< 20MB)
    if (env.geminiApiKey && buffer.length < 20 * 1024 * 1024) {
      try {
        const mimeType = filename.toLowerCase().endsWith('.mp4')
          ? 'video/mp4'
          : filename.toLowerCase().endsWith('.webm')
          ? 'video/webm'
          : filename.toLowerCase().endsWith('.mp3')
          ? 'audio/mp3'
          : 'video/mp4';

        const base64Data = buffer.toString('base64');
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`;

        const prompt = `
Generate a detailed, timestamped transcript and summary of this video/audio for a knowledge retrieval system.
Format each distinct topic or segment with its timestamp on a new line in this format:
[MM:SS] Title: Description and spoken content.
Example:
[00:15] Introduction: Overview of project architecture.
[02:30] Authentication: Explanation of JWT token verification and user isolation.
        `.trim();

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType, data: base64Data } },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.2,
            },
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      } catch (err) {
        logger.warn('Gemini video transcription error, using fallback media extraction', { filename, error: err });
      }
    }

    // Parse timestamp segments from generated transcript if available
    if (fullText) {
      const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const match = line.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(?:([^:]+):\s*)?(.*)/);
        if (match) {
          const timestamp = match[1];
          const title = match[2] ? match[2].trim() : `Timestamp ${timestamp}`;
          const content = match[3] ? `${title}: ${match[3].trim()}` : line;
          sections.push({
            content,
            timestamp,
            sectionTitle: `Timestamp ${timestamp}`,
          });
        } else {
          sections.push({
            content: line,
            sectionTitle: 'Transcript Segment',
          });
        }
      }
    }

    // Fallback if no external LLM or transcript produced (e.g. offline test environment)
    if (sections.length === 0) {
      const title = filename.replace(/\.[^.]+$/, '');
      const placeholderText = `Video Knowledge Source: ${title}.\nFile: ${filename}\nSize: ${(buffer.length / 1024).toFixed(1)} KB.`;
      fullText = placeholderText;
      sections.push({
        content: placeholderText,
        timestamp: '00:00',
        sectionTitle: `${title} (00:00)`,
      });
    }

    return {
      text: fullText,
      sections,
      pageCount: 1,
      metadata: {
        mediaType: filename.toLowerCase().endsWith('.mp3') || filename.toLowerCase().endsWith('.wav') ? 'audio' : 'video',
        totalSegments: sections.length,
      },
    };
  }
}

