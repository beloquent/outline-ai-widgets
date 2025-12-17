import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { config, DEFAULT_FEATURE_CONFIG, AVAILABLE_MODELS, COPILOT_MODE_CONFIG } from '../config/settings';
import { adminAuthMiddleware } from '../middleware/auth';
import { getAllSettings, updateFeatureSettings, resetFeatureSettings, getModePrompts, updateModePrompts, resetModePrompts, getOutlineApiKey } from '../services/settings';
import { resetOpenAIClient, getOpenAIApiKey } from '../services/openai';
import { query } from '../db/connection';
import { logger } from '../config/logger';

const router = Router();

const featureSettingsSchema = z.object({
  model: z.string().optional(),
  maxTokens: z.number().min(1).max(16384).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  systemPrompt: z.string().optional(),
  embeddingModel: z.string().optional()
});

const apiKeySchema = z.object({
  openaiApiKey: z.string().optional(),
  outlineApiKey: z.string().optional()
});

router.get('/settings', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const settings = await getAllSettings();
    const apiKey = await getOpenAIApiKey();

    res.json({
      success: true,
      settings: {
        hasOpenAiKey: !!apiKey,
        hasOutlineKey: !!config.outlineApiKey,
        outlineUrl: config.outlineUrl,
        features: settings.features,
        availableModels: AVAILABLE_MODELS
      }
    });
  } catch (error) {
    logger.error('Get settings failed', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_SETTINGS_FAILED',
        message: 'Failed to get settings'
      }
    });
  }
});

router.post('/api-key', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const body = apiKeySchema.parse(req.body);

    if (body.openaiApiKey) {
      await query(
        `INSERT INTO ai_settings (key, value, updated_at)
         VALUES ('openai_api_key', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify({ key: body.openaiApiKey })]
      );
      resetOpenAIClient();
    }

    if (body.outlineApiKey) {
      await query(
        `INSERT INTO ai_settings (key, value, updated_at)
         VALUES ('outline_api_key', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify({ key: body.outlineApiKey })]
      );
    }

    res.json({
      success: true,
      message: 'API keys updated successfully'
    });
  } catch (error) {
    logger.error('Set API key failed', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        }
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SET_API_KEY_FAILED',
        message: 'Failed to set API key'
      }
    });
  }
});

router.delete('/api-key', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    await query("DELETE FROM ai_settings WHERE key = 'openai_api_key'");
    resetOpenAIClient();

    res.json({
      success: true,
      message: 'API key removed successfully'
    });
  } catch (error) {
    logger.error('Delete API key failed', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_API_KEY_FAILED',
        message: 'Failed to delete API key'
      }
    });
  }
});

router.put('/features/:feature', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const feature = req.params.feature as 'builder' | 'copilot' | 'rag';
    
    if (!['builder', 'copilot', 'rag'].includes(feature)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FEATURE',
          message: 'Feature must be one of: builder, copilot, rag'
        }
      });
      return;
    }

    const body = featureSettingsSchema.parse(req.body);
    const updated = await updateFeatureSettings(feature, body);

    res.json({
      success: true,
      message: `${DEFAULT_FEATURE_CONFIG[feature].name} settings saved successfully`,
      settings: updated
    });
  } catch (error) {
    logger.error('Update feature settings failed', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        }
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: 'Failed to update settings'
      }
    });
  }
});

router.post('/features/:feature/reset', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const feature = req.params.feature as 'builder' | 'copilot' | 'rag';
    
    if (!['builder', 'copilot', 'rag'].includes(feature)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FEATURE',
          message: 'Feature must be one of: builder, copilot, rag'
        }
      });
      return;
    }

    const defaults = await resetFeatureSettings(feature);

    res.json({
      success: true,
      message: `${DEFAULT_FEATURE_CONFIG[feature].name} settings reset to defaults`,
      settings: defaults
    });
  } catch (error) {
    logger.error('Reset feature settings failed', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RESET_FAILED',
        message: 'Failed to reset settings'
      }
    });
  }
});

router.get('/health', async (req: Request, res: Response) => {
  const health: Record<string, any> = {
    service: 'healthy',
    timestamp: new Date().toISOString()
  };

  try {
    const { pool } = await import('../db/connection');
    await pool.query('SELECT 1');
    health.database = 'connected';
  } catch {
    health.database = 'disconnected';
  }

  const apiKey = await getOpenAIApiKey();
  health.openai = apiKey ? 'configured' : 'not_configured';
  health.outline = config.outlineApiKey ? 'configured' : 'not_configured';

  res.json({
    success: true,
    health
  });
});

router.get('/config', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const settings = await getAllSettings();
    const openaiKey = await getOpenAIApiKey();
    const outlineKey = await getOutlineApiKey();
    const modePrompts = await getModePrompts();
    
    res.json({
      success: true,
      config: {
        hasOpenAiKey: !!openaiKey,
        hasOutlineKey: !!outlineKey,
        features: {
          copilot: {
            model: settings.features.copilot.model,
            temperature: settings.features.copilot.temperature,
            maxTokens: settings.features.copilot.maxTokens,
            systemPrompt: settings.features.copilot.systemPrompt
          }
        },
        modePrompts,
        modes: COPILOT_MODE_CONFIG,
        availableModels: AVAILABLE_MODELS
      }
    });
  } catch (error) {
    logger.error('Get config failed', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_CONFIG_FAILED', message: 'Failed to get configuration' }
    });
  }
});

router.post('/config', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const configSchema = z.object({
      openaiApiKey: z.string().optional(),
      outlineApiKey: z.string().optional(),
      copilot: z.object({
        model: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(16384).optional(),
        systemPrompt: z.string().optional()
      }).optional(),
      modePrompts: z.object({
        documentation: z.string().optional(),
        workflow: z.string().optional(),
        sop: z.string().optional(),
        kbChat: z.string().optional()
      }).optional()
    });

    const body = configSchema.parse(req.body);

    if (body.openaiApiKey) {
      await query(
        `INSERT INTO ai_settings (key, value, updated_at)
         VALUES ('openai_api_key', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify({ key: body.openaiApiKey })]
      );
      resetOpenAIClient();
    }

    if (body.outlineApiKey) {
      await query(
        `INSERT INTO ai_settings (key, value, updated_at)
         VALUES ('outline_api_key', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify({ key: body.outlineApiKey })]
      );
    }

    if (body.copilot) {
      await updateFeatureSettings('copilot', body.copilot);
    }

    if (body.modePrompts) {
      await updateModePrompts(body.modePrompts);
    }

    res.json({
      success: true,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    logger.error('Save config failed', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        }
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: { code: 'SAVE_CONFIG_FAILED', message: 'Failed to save configuration' }
    });
  }
});

export default router;
