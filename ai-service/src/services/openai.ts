import OpenAI from 'openai';
import { config, DEFAULT_FEATURE_CONFIG } from '../config/settings';
import { logger } from '../config/logger';
import { getFeatureSettings } from './settings';
import { query } from '../db/connection';

let openaiClient: OpenAI | null = null;
let cachedApiKey: string | null = null;

export async function getOpenAIApiKey(): Promise<string | null> {
  try {
    const result = await query(
      "SELECT value FROM ai_settings WHERE key = 'openai_api_key'",
      []
    );
    
    if (result.rows.length > 0) {
      const rawValue = result.rows[0].value;
      let parsed: { key?: string };
      
      if (typeof rawValue === 'string') {
        parsed = JSON.parse(rawValue);
      } else {
        parsed = rawValue;
      }
      
      if (parsed.key) {
        logger.debug('Loaded API key from database');
        return parsed.key;
      }
    }
  } catch (error) {
    logger.debug('Failed to load API key from database, falling back to env', { error: String(error) });
  }
  
  return config.openaiApiKey || null;
}

export async function getOpenAIClientAsync(): Promise<OpenAI> {
  const apiKey = await getOpenAIApiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  
  if (!openaiClient || cachedApiKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    cachedApiKey = apiKey;
  }
  
  return openaiClient;
}

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey
    });
  }
  return openaiClient;
}

export function resetOpenAIClient(): void {
  openaiClient = null;
  cachedApiKey = null;
}

interface ChatOptions {
  feature: 'builder' | 'copilot' | 'rag';
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  overrides?: Partial<{
    model: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    presencePenalty: number;
    frequencyPenalty: number;
  }>;
}

export async function chat(options: ChatOptions): Promise<string> {
  const client = await getOpenAIClientAsync();
  const settings = await getFeatureSettings(options.feature);
  const featureDefaults = DEFAULT_FEATURE_CONFIG[options.feature];

  const model = options.overrides?.model || settings.model || featureDefaults.model;
  const maxTokens = options.overrides?.maxTokens || settings.maxTokens || featureDefaults.maxTokens;
  const temperature = options.overrides?.temperature ?? settings.temperature ?? featureDefaults.temperature;
  const topP = options.overrides?.topP ?? settings.topP ?? featureDefaults.topP;
  const presencePenalty = options.overrides?.presencePenalty ?? settings.presencePenalty ?? featureDefaults.presencePenalty;
  const frequencyPenalty = options.overrides?.frequencyPenalty ?? settings.frequencyPenalty ?? featureDefaults.frequencyPenalty;

  logger.debug('Calling OpenAI chat', { feature: options.feature, model, maxTokens });

  const response = await client.chat.completions.create({
    model,
    messages: options.messages,
    max_tokens: maxTokens,
    temperature,
    top_p: topP,
    presence_penalty: presencePenalty,
    frequency_penalty: frequencyPenalty
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  return content;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const client = await getOpenAIClientAsync();
  const settings = await getFeatureSettings('rag');
  const embeddingModel = settings.embeddingModel || DEFAULT_FEATURE_CONFIG.rag.embeddingModel;

  const response = await client.embeddings.create({
    model: embeddingModel,
    input: text
  });

  return response.data[0].embedding;
}
