import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { getModel, type ModelDefinition } from './modelRegistry';
import { buildGeminiContents, buildProviderMessages, TWINMIND_SYSTEM_PROMPT, type ContextMessage } from './promptService';

export type AiStreamRequest = {
  model: string;
  messages: ContextMessage[];
  signal?: AbortSignal;
};

const providerError = (message: string, statusCode = 502) => new AppError(message, statusCode);

async function* streamOpenAi(model: ModelDefinition, messages: ContextMessage[], signal: AbortSignal) {
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
      messages: [{ role: 'system', content: TWINMIND_SYSTEM_PROMPT }, ...buildProviderMessages(messages)],
      stream: true,
      max_tokens: model.maxOutputTokens,
    }),
  });

  if (!response.ok || !response.body) {
    if (response.status === 429) throw providerError('The AI provider is rate limiting requests', 429);
    throw providerError('The AI provider could not process this request');
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const dataLine = event.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const data = dataLine.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Ignore incomplete provider event payloads; the next event will complete them.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamGemini(model: ModelDefinition, messages: ContextMessage[], signal: AbortSignal) {
  if (!env.geminiApiKey) throw providerError('The selected AI provider is not configured', 503);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(env.geminiApiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: TWINMIND_SYSTEM_PROMPT }] },
      contents: buildGeminiContents(messages),
      generationConfig: { maxOutputTokens: model.maxOutputTokens },
    }),
  });

  if (!response.ok || !response.body) {
    if (response.status === 429) throw providerError('The AI provider is rate limiting requests', 429);
    throw providerError('The AI provider could not process this request');
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const dataLine = event.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;

        try {
          const parsed = JSON.parse(dataLine.slice(5).trim()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const content = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
          if (content) yield content;
        } catch {
          // Ignore incomplete provider event payloads.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamAssistantResponse({ model: modelId, messages, signal }: AiStreamRequest) {
  const model = getModel(modelId);
  const effectiveSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
    : AbortSignal.timeout(60_000);

  if (model.provider === 'openai') {
    yield* streamOpenAi(model, messages, effectiveSignal);
    return;
  }

  yield* streamGemini(model, messages, effectiveSignal);
}
