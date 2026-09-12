import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import { getModel, type ModelDefinition } from './modelRegistry';
import {
  buildGeminiContents,
  buildProviderMessages,
  buildSystemPromptWithKnowledge,
  type ContextMessage,
  type MemoryContextItem,
  type DocumentContextItem,
  type GraphRelationshipContextItem,
  type AttachmentContext,
  type LanguagePreference,
  type ResolvedLanguage,
  type SpeakingStyle,
} from './promptService';

export type AiStreamRequest = {
  model: string;
  messages: ContextMessage[];
  memories?: MemoryContextItem[];
  documents?: DocumentContextItem[];
  graphRelationships?: GraphRelationshipContextItem[];
  attachment?: AttachmentContext;
  language?: LanguagePreference;
  speakingStyle?: SpeakingStyle;
  resolvedLanguage?: ResolvedLanguage;
  signal?: AbortSignal;
};

const providerError = (message: string, statusCode = 502) => new AppError(message, statusCode);

/**
 * Reusable async generator that decodes a streaming SSE response body
 * and yields each non-empty `data:` payload line.
 */
async function* parseSseDataStream(body: NonNullable<Response['body']>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value.replace(/\r\n/g, '\n');
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const dataLine = event.split('\n').find((line) => line.startsWith('data:'));
        if (dataLine) {
          yield dataLine.slice(5).trim();
        }
      }
    }

    if (buffer.trim()) {
      const dataLine = buffer.split('\n').find((line) => line.startsWith('data:'));
      if (dataLine) {
        yield dataLine.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamOpenAi(
  model: ModelDefinition,
  messages: ContextMessage[],
  systemPrompt: string,
  signal: AbortSignal,
  attachment?: AttachmentContext,
) {
  if (!env.openAiApiKey) throw providerError('The selected AI provider is not configured', 503);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${env.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: 'system', content: systemPrompt }, ...buildProviderMessages(messages, attachment)],
      stream: true,
      max_tokens: model.maxOutputTokens,
    }),
  });

  if (!response.ok || !response.body) {
    if (response.status === 429) throw providerError('The AI provider is rate limiting requests', 429);
    throw providerError('The AI provider could not process this request');
  }

  for await (const data of parseSseDataStream(response.body)) {
    if (data === '[DONE]') return;
    try {
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) yield content;
    } catch {
      // Ignore incomplete provider event payloads
    }
  }
}

async function* streamGemini(
  model: ModelDefinition,
  messages: ContextMessage[],
  systemPrompt: string,
  signal: AbortSignal,
  attachment?: AttachmentContext,
) {
  if (!env.geminiApiKey) throw providerError('The selected AI provider is not configured', 503);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(env.geminiApiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: buildGeminiContents(messages, attachment),
      generationConfig: { maxOutputTokens: model.maxOutputTokens },
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => '');
    logger.warn('Gemini streamGenerateContent error response', {
      model: model.id,
      status: response.status,
      statusText: response.statusText,
      errorText: errorText.slice(0, 300),
    });

    if (response.status === 429) {
      throw providerError(`Gemini model ${model.id} rate limit or quota exceeded`, 429);
    }
    if (response.status === 503) {
      throw providerError(`Gemini model ${model.id} is temporarily overloaded`, 503);
    }
    if (response.status === 404) {
      throw providerError(`Gemini model ${model.id} is not found or deprecated`, 404);
    }
    throw providerError(`The AI provider could not process this request (${response.status})`);
  }

  for await (const data of parseSseDataStream(response.body)) {
    try {
      const parsed = JSON.parse(data) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const content = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
      if (content) yield content;
    } catch {
      // Ignore incomplete provider event payloads.
    }
  }
}

export async function* streamAssistantResponse({
  model: modelId,
  messages,
  memories = [],
  documents = [],
  graphRelationships = [],
  attachment,
  language = 'auto',
  speakingStyle = 'conversational',
  resolvedLanguage,
  signal,
}: AiStreamRequest) {
  const model = getModel(modelId);
  const effectiveSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
    : AbortSignal.timeout(60_000);

  const systemPrompt = buildSystemPromptWithKnowledge(
    memories,
    documents,
    graphRelationships,
    language,
    speakingStyle,
    resolvedLanguage,
  );

  if (model.provider === 'openai') {
    yield* streamOpenAi(model, messages, systemPrompt, effectiveSignal, attachment);
    return;
  }

  // Define fallback priority for Gemini models
  const fallbackCandidates = [
    model.id,
    'gemini-3.7-flash',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
  ].filter((id, index, self) => self.indexOf(id) === index);

  let lastError: Error | null = null;
  let yieldedAny = false;

  for (const candidateId of fallbackCandidates) {
    try {
      const candidateModel = { ...model, id: candidateId };
      for await (const chunk of streamGemini(candidateModel, messages, systemPrompt, effectiveSignal, attachment)) {
        yieldedAny = true;
        yield chunk;
      }
      return; // Streamed successfully!
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      lastError = errorObj;
      logger.warn(`Gemini model ${candidateId} stream failed, attempting fallback`, {
        error: errorObj.message,
        candidateId,
        yieldedAny,
      });

      // If partial content has already been sent to client, cannot switch mid-stream
      if (yieldedAny) {
        throw errorObj;
      }
      // Otherwise, proceed to next candidate
    }
  }

  throw lastError || providerError('Unable to generate response from any Gemini model', 502);
}
