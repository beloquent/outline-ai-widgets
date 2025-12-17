"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModePrompts = getModePrompts;
exports.getModePrompt = getModePrompt;
exports.updateModePrompts = updateModePrompts;
exports.resetModePrompts = resetModePrompts;
exports.getFeatureSettings = getFeatureSettings;
exports.updateFeatureSettings = updateFeatureSettings;
exports.resetFeatureSettings = resetFeatureSettings;
exports.getAllSettings = getAllSettings;
exports.getOutlineApiKey = getOutlineApiKey;
const connection_1 = require("../db/connection");
const settings_1 = require("../config/settings");
const logger_1 = require("../config/logger");
async function getModePrompts() {
    const defaults = {
        documentation: settings_1.COPILOT_MODE_CONFIG.documentation.defaultPrompt,
        workflow: settings_1.COPILOT_MODE_CONFIG.workflow.defaultPrompt,
        sop: settings_1.COPILOT_MODE_CONFIG.sop.defaultPrompt,
        kbChat: settings_1.COPILOT_MODE_CONFIG.kbChat.defaultPrompt
    };
    try {
        const result = await (0, connection_1.query)("SELECT value FROM ai_settings WHERE key = 'mode_prompts'", []);
        if (result.rows.length > 0) {
            const stored = typeof result.rows[0].value === 'string'
                ? JSON.parse(result.rows[0].value)
                : result.rows[0].value;
            return { ...defaults, ...stored };
        }
    }
    catch (error) {
        logger_1.logger.warn('Failed to load mode prompts, using defaults', error);
    }
    return defaults;
}
async function getModePrompt(mode) {
    const prompts = await getModePrompts();
    return prompts[mode] || settings_1.COPILOT_MODE_CONFIG[mode].defaultPrompt;
}
async function updateModePrompts(updates) {
    const current = await getModePrompts();
    const updated = { ...current, ...updates };
    await (0, connection_1.query)(`INSERT INTO ai_settings (key, value, updated_at) 
     VALUES ('mode_prompts', $1, NOW()) 
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify(updated)]);
    return updated;
}
async function resetModePrompts() {
    await (0, connection_1.query)("DELETE FROM ai_settings WHERE key = 'mode_prompts'");
    return {
        documentation: settings_1.COPILOT_MODE_CONFIG.documentation.defaultPrompt,
        workflow: settings_1.COPILOT_MODE_CONFIG.workflow.defaultPrompt,
        sop: settings_1.COPILOT_MODE_CONFIG.sop.defaultPrompt,
        kbChat: settings_1.COPILOT_MODE_CONFIG.kbChat.defaultPrompt
    };
}
async function getFeatureSettings(feature) {
    try {
        const result = await (0, connection_1.query)('SELECT value FROM ai_settings WHERE key = $1', [`feature_${feature}`]);
        if (result.rows.length > 0) {
            return { ...settings_1.DEFAULT_FEATURE_CONFIG[feature], ...result.rows[0].value };
        }
    }
    catch (error) {
        logger_1.logger.warn(`Failed to load settings for ${feature}, using defaults`, error);
    }
    return settings_1.DEFAULT_FEATURE_CONFIG[feature];
}
async function updateFeatureSettings(feature, updates) {
    const current = await getFeatureSettings(feature);
    const updated = { ...current, ...updates };
    await (0, connection_1.query)(`INSERT INTO ai_settings (key, value, updated_at) 
     VALUES ($1, $2, NOW()) 
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`, [`feature_${feature}`, JSON.stringify(updated)]);
    return updated;
}
async function resetFeatureSettings(feature) {
    await (0, connection_1.query)('DELETE FROM ai_settings WHERE key = $1', [`feature_${feature}`]);
    return settings_1.DEFAULT_FEATURE_CONFIG[feature];
}
async function getAllSettings() {
    const features = {
        builder: await getFeatureSettings('builder'),
        copilot: await getFeatureSettings('copilot'),
        rag: await getFeatureSettings('rag')
    };
    return { features };
}
async function getOutlineApiKey() {
    try {
        const result = await (0, connection_1.query)("SELECT value FROM ai_settings WHERE key = 'outline_api_key'", []);
        if (result.rows.length > 0) {
            const value = result.rows[0].value;
            if (typeof value === 'string') {
                const parsed = JSON.parse(value);
                logger_1.logger.debug('Loaded Outline API key from database');
                return parsed.key || null;
            }
            else if (value && typeof value === 'object') {
                logger_1.logger.debug('Loaded Outline API key from database');
                return value.key || null;
            }
        }
    }
    catch (error) {
        logger_1.logger.warn('Failed to load Outline API key from database', error);
    }
    return null;
}
//# sourceMappingURL=settings.js.map