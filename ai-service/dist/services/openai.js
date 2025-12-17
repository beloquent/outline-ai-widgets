"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpenAIApiKey = getOpenAIApiKey;
exports.getOpenAIClientAsync = getOpenAIClientAsync;
exports.getOpenAIClient = getOpenAIClient;
exports.resetOpenAIClient = resetOpenAIClient;
exports.chat = chat;
exports.createEmbedding = createEmbedding;
const openai_1 = __importDefault(require("openai"));
const settings_1 = require("../config/settings");
const logger_1 = require("../config/logger");
const settings_2 = require("./settings");
const connection_1 = require("../db/connection");
let openaiClient = null;
let cachedApiKey = null;
async function getOpenAIApiKey() {
    try {
        const result = await (0, connection_1.query)("SELECT value FROM ai_settings WHERE key = 'openai_api_key'", []);
        if (result.rows.length > 0) {
            const rawValue = result.rows[0].value;
            let parsed;
            if (typeof rawValue === 'string') {
                parsed = JSON.parse(rawValue);
            }
            else {
                parsed = rawValue;
            }
            if (parsed.key) {
                logger_1.logger.debug('Loaded API key from database');
                return parsed.key;
            }
        }
    }
    catch (error) {
        logger_1.logger.debug('Failed to load API key from database, falling back to env', { error: String(error) });
    }
    return settings_1.config.openaiApiKey || null;
}
async function getOpenAIClientAsync() {
    const apiKey = await getOpenAIApiKey();
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    if (!openaiClient || cachedApiKey !== apiKey) {
        openaiClient = new openai_1.default({ apiKey });
        cachedApiKey = apiKey;
    }
    return openaiClient;
}
function getOpenAIClient() {
    if (!openaiClient) {
        if (!settings_1.config.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }
        openaiClient = new openai_1.default({
            apiKey: settings_1.config.openaiApiKey
        });
    }
    return openaiClient;
}
function resetOpenAIClient() {
    openaiClient = null;
    cachedApiKey = null;
}
async function chat(options) {
    const client = await getOpenAIClientAsync();
    const settings = await (0, settings_2.getFeatureSettings)(options.feature);
    const featureDefaults = settings_1.DEFAULT_FEATURE_CONFIG[options.feature];
    const model = options.overrides?.model || settings.model || featureDefaults.model;
    const maxTokens = options.overrides?.maxTokens || settings.maxTokens || featureDefaults.maxTokens;
    const temperature = options.overrides?.temperature ?? settings.temperature ?? featureDefaults.temperature;
    const topP = options.overrides?.topP ?? settings.topP ?? featureDefaults.topP;
    const presencePenalty = options.overrides?.presencePenalty ?? settings.presencePenalty ?? featureDefaults.presencePenalty;
    const frequencyPenalty = options.overrides?.frequencyPenalty ?? settings.frequencyPenalty ?? featureDefaults.frequencyPenalty;
    logger_1.logger.debug('Calling OpenAI chat', { feature: options.feature, model, maxTokens });
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
async function createEmbedding(text) {
    const client = await getOpenAIClientAsync();
    const settings = await (0, settings_2.getFeatureSettings)('rag');
    const embeddingModel = settings.embeddingModel || settings_1.DEFAULT_FEATURE_CONFIG.rag.embeddingModel;
    const response = await client.embeddings.create({
        model: embeddingModel,
        input: text
    });
    return response.data[0].embedding;
}
//# sourceMappingURL=openai.js.map