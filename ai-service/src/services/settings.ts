import { query } from '../db/connection';
import { DEFAULT_FEATURE_CONFIG, COPILOT_MODE_CONFIG, CopilotMode } from '../config/settings';
import { logger } from '../config/logger';

type FeatureKey = 'builder' | 'copilot' | 'rag';

export interface ModePrompts {
  documentation: string;
  workflow: string;
  sop: string;
  kbChat: string;
}

export async function getModePrompts(): Promise<ModePrompts> {
  const defaults: ModePrompts = {
    documentation: COPILOT_MODE_CONFIG.documentation.defaultPrompt,
    workflow: COPILOT_MODE_CONFIG.workflow.defaultPrompt,
    sop: COPILOT_MODE_CONFIG.sop.defaultPrompt,
    kbChat: COPILOT_MODE_CONFIG.kbChat.defaultPrompt
  };

  try {
    const result = await query(
      "SELECT value FROM ai_settings WHERE key = 'mode_prompts'",
      []
    );

    if (result.rows.length > 0) {
      const stored = typeof result.rows[0].value === 'string' 
        ? JSON.parse(result.rows[0].value) 
        : result.rows[0].value;
      return { ...defaults, ...stored };
    }
  } catch (error) {
    logger.warn('Failed to load mode prompts, using defaults', error);
  }

  return defaults;
}

export async function getModePrompt(mode: CopilotMode): Promise<string> {
  const prompts = await getModePrompts();
  return prompts[mode] || COPILOT_MODE_CONFIG[mode].defaultPrompt;
}

export async function updateModePrompts(updates: Partial<ModePrompts>): Promise<ModePrompts> {
  const current = await getModePrompts();
  const updated = { ...current, ...updates };

  await query(
    `INSERT INTO ai_settings (key, value, updated_at) 
     VALUES ('mode_prompts', $1, NOW()) 
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(updated)]
  );

  return updated;
}

export async function resetModePrompts(): Promise<ModePrompts> {
  await query("DELETE FROM ai_settings WHERE key = 'mode_prompts'");
  return {
    documentation: COPILOT_MODE_CONFIG.documentation.defaultPrompt,
    workflow: COPILOT_MODE_CONFIG.workflow.defaultPrompt,
    sop: COPILOT_MODE_CONFIG.sop.defaultPrompt,
    kbChat: COPILOT_MODE_CONFIG.kbChat.defaultPrompt
  };
}

interface FeatureSettings {
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
  systemPrompt: string;
  embeddingModel?: string;
}

export async function getFeatureSettings(feature: FeatureKey): Promise<FeatureSettings> {
  try {
    const result = await query(
      'SELECT value FROM ai_settings WHERE key = $1',
      [`feature_${feature}`]
    );

    if (result.rows.length > 0) {
      return { ...DEFAULT_FEATURE_CONFIG[feature], ...result.rows[0].value };
    }
  } catch (error) {
    logger.warn(`Failed to load settings for ${feature}, using defaults`, error);
  }

  return DEFAULT_FEATURE_CONFIG[feature];
}

export async function updateFeatureSettings(
  feature: FeatureKey,
  updates: Partial<FeatureSettings>
): Promise<FeatureSettings> {
  const current = await getFeatureSettings(feature);
  const updated = { ...current, ...updates };

  await query(
    `INSERT INTO ai_settings (key, value, updated_at) 
     VALUES ($1, $2, NOW()) 
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [`feature_${feature}`, JSON.stringify(updated)]
  );

  return updated;
}

export async function resetFeatureSettings(feature: FeatureKey): Promise<FeatureSettings> {
  await query('DELETE FROM ai_settings WHERE key = $1', [`feature_${feature}`]);
  return DEFAULT_FEATURE_CONFIG[feature];
}

export async function getAllSettings(): Promise<{
  features: Record<FeatureKey, FeatureSettings>;
}> {
  const features: Record<FeatureKey, FeatureSettings> = {
    builder: await getFeatureSettings('builder'),
    copilot: await getFeatureSettings('copilot'),
    rag: await getFeatureSettings('rag')
  };

  return { features };
}

export async function getOutlineApiKey(): Promise<string | null> {
  try {
    const result = await query(
      "SELECT value FROM ai_settings WHERE key = 'outline_api_key'",
      []
    );

    if (result.rows.length > 0) {
      const value = result.rows[0].value;
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        logger.debug('Loaded Outline API key from database');
        return parsed.key || null;
      } else if (value && typeof value === 'object') {
        logger.debug('Loaded Outline API key from database');
        return value.key || null;
      }
    }
  } catch (error) {
    logger.warn('Failed to load Outline API key from database', error);
  }

  return null;
}
