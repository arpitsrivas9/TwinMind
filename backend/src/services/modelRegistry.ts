import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

export type ModelProvider = 'openai' | 'gemini';

export type ModelDefinition = {
  id: string;
  provider: ModelProvider;
  displayName: string;
  supportsStreaming: true;
  maxInputCharacters: number;
  maxOutputTokens: number;
};

const definitions: ModelDefinition[] = [
  {
    id: env.openAiModel,
    provider: 'openai',
    displayName: env.openAiModel === 'gpt-4o-mini' ? 'GPT-4o Mini' : env.openAiModel,
    supportsStreaming: true,
    maxInputCharacters: env.aiMaxInputCharacters,
    maxOutputTokens: env.aiMaxOutputTokens,
  },
  {
    id: env.geminiModel,
    provider: 'gemini',
    displayName: env.geminiModel === 'gemini-3.6-flash' ? 'Gemini 3.6 Flash' : env.geminiModel,
    supportsStreaming: true,
    maxInputCharacters: env.aiMaxInputCharacters,
    maxOutputTokens: env.aiMaxOutputTokens,
  },
];

export const getConfiguredModels = () =>
  definitions.filter((definition) => {
    if (definition.provider === 'openai') return Boolean(env.openAiApiKey);
    return Boolean(env.geminiApiKey);
  });

export const getModel = (modelId: string) => {
  const model = getConfiguredModels().find((definition) => definition.id === modelId);
  if (!model) throw new AppError('Requested model is not configured or supported', 400);
  return model;
};
