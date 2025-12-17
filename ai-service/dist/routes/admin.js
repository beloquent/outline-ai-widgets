"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const settings_1 = require("../config/settings");
const auth_1 = require("../middleware/auth");
const settings_2 = require("../services/settings");
const openai_1 = require("../services/openai");
const connection_1 = require("../db/connection");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
const featureSettingsSchema = zod_1.z.object({
    model: zod_1.z.string().optional(),
    maxTokens: zod_1.z.number().min(1).max(16384).optional(),
    temperature: zod_1.z.number().min(0).max(2).optional(),
    topP: zod_1.z.number().min(0).max(1).optional(),
    presencePenalty: zod_1.z.number().min(-2).max(2).optional(),
    frequencyPenalty: zod_1.z.number().min(-2).max(2).optional(),
    systemPrompt: zod_1.z.string().optional(),
    embeddingModel: zod_1.z.string().optional()
});
const apiKeySchema = zod_1.z.object({
    openaiApiKey: zod_1.z.string().optional(),
    outlineApiKey: zod_1.z.string().optional()
});
router.get('/settings', auth_1.adminAuthMiddleware, async (req, res) => {
    try {
        const settings = await (0, settings_2.getAllSettings)();
        const apiKey = await (0, openai_1.getOpenAIApiKey)();
        res.json({
            success: true,
            settings: {
                hasOpenAiKey: !!apiKey,
                hasOutlineKey: !!settings_1.config.outlineApiKey,
                outlineUrl: settings_1.config.outlineUrl,
                features: settings.features,
                availableModels: settings_1.AVAILABLE_MODELS
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get settings failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_SETTINGS_FAILED',
                message: 'Failed to get settings'
            }
        });
    }
});
router.post('/api-key', auth_1.adminAuthMiddleware, async (req, res) => {
    try {
        const body = apiKeySchema.parse(req.body);
        if (body.openaiApiKey) {
            await (0, connection_1.query)(`INSERT INTO ai_settings (key, value, updated_at)
         VALUES ('openai_api_key', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify({ key: body.openaiApiKey })]);
            (0, openai_1.resetOpenAIClient)();
        }
        if (body.outlineApiKey) {
            await (0, connection_1.query)(`INSERT INTO ai_settings (key, value, updated_at)
         VALUES ('outline_api_key', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify({ key: body.outlineApiKey })]);
        }
        res.json({
            success: true,
            message: 'API keys updated successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Set API key failed', error);
        if (error instanceof zod_1.z.ZodError) {
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
router.delete('/api-key', auth_1.adminAuthMiddleware, async (req, res) => {
    try {
        await (0, connection_1.query)("DELETE FROM ai_settings WHERE key = 'openai_api_key'");
        (0, openai_1.resetOpenAIClient)();
        res.json({
            success: true,
            message: 'API key removed successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Delete API key failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'DELETE_API_KEY_FAILED',
                message: 'Failed to delete API key'
            }
        });
    }
});
router.put('/features/:feature', auth_1.adminAuthMiddleware, async (req, res) => {
    try {
        const feature = req.params.feature;
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
        const updated = await (0, settings_2.updateFeatureSettings)(feature, body);
        res.json({
            success: true,
            message: `${settings_1.DEFAULT_FEATURE_CONFIG[feature].name} settings saved successfully`,
            settings: updated
        });
    }
    catch (error) {
        logger_1.logger.error('Update feature settings failed', error);
        if (error instanceof zod_1.z.ZodError) {
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
router.post('/features/:feature/reset', auth_1.adminAuthMiddleware, async (req, res) => {
    try {
        const feature = req.params.feature;
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
        const defaults = await (0, settings_2.resetFeatureSettings)(feature);
        res.json({
            success: true,
            message: `${settings_1.DEFAULT_FEATURE_CONFIG[feature].name} settings reset to defaults`,
            settings: defaults
        });
    }
    catch (error) {
        logger_1.logger.error('Reset feature settings failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'RESET_FAILED',
                message: 'Failed to reset settings'
            }
        });
    }
});
router.get('/health', async (req, res) => {
    const health = {
        service: 'healthy',
        timestamp: new Date().toISOString()
    };
    try {
        const { pool } = await Promise.resolve().then(() => __importStar(require('../db/connection')));
        await pool.query('SELECT 1');
        health.database = 'connected';
    }
    catch {
        health.database = 'disconnected';
    }
    const apiKey = await (0, openai_1.getOpenAIApiKey)();
    health.openai = apiKey ? 'configured' : 'not_configured';
    health.outline = settings_1.config.outlineApiKey ? 'configured' : 'not_configured';
    res.json({
        success: true,
        health
    });
});
router.get('/config', auth_1.adminAuthMiddleware, async (req, res) => {
    try {
        const settings = await (0, settings_2.getAllSettings)();
        const openaiKey = await (0, openai_1.getOpenAIApiKey)();
        const outlineKey = await (0, settings_2.getOutlineApiKey)();
        const modePrompts = await (0, settings_2.getModePrompts)();
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
                modes: settings_1.COPILOT_MODE_CONFIG,
                availableModels: settings_1.AVAILABLE_MODELS
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get config failed', error);
        res.status(500).json({
            success: false,
            error: { code: 'GET_CONFIG_FAILED', message: 'Failed to get configuration' }
        });
    }
});
router.post('/config', auth_1.adminAuthMiddleware, async (req, res) => {
    try {
        const configSchema = zod_1.z.object({
            openaiApiKey: zod_1.z.string().optional(),
            outlineApiKey: zod_1.z.string().optional(),
            copilot: zod_1.z.object({
                model: zod_1.z.string().optional(),
                temperature: zod_1.z.number().min(0).max(2).optional(),
                maxTokens: zod_1.z.number().min(1).max(16384).optional(),
                systemPrompt: zod_1.z.string().optional()
            }).optional(),
            modePrompts: zod_1.z.object({
                documentation: zod_1.z.string().optional(),
                workflow: zod_1.z.string().optional(),
                sop: zod_1.z.string().optional(),
                kbChat: zod_1.z.string().optional()
            }).optional()
        });
        const body = configSchema.parse(req.body);
        if (body.openaiApiKey) {
            await (0, connection_1.query)(`INSERT INTO ai_settings (key, value, updated_at)
         VALUES ('openai_api_key', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify({ key: body.openaiApiKey })]);
            (0, openai_1.resetOpenAIClient)();
        }
        if (body.outlineApiKey) {
            await (0, connection_1.query)(`INSERT INTO ai_settings (key, value, updated_at)
         VALUES ('outline_api_key', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify({ key: body.outlineApiKey })]);
        }
        if (body.copilot) {
            await (0, settings_2.updateFeatureSettings)('copilot', body.copilot);
        }
        if (body.modePrompts) {
            await (0, settings_2.updateModePrompts)(body.modePrompts);
        }
        res.json({
            success: true,
            message: 'Configuration saved successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Save config failed', error);
        if (error instanceof zod_1.z.ZodError) {
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
exports.default = router;
//# sourceMappingURL=admin.js.map