"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.outlineClient = void 0;
const settings_1 = require("../config/settings");
const logger_1 = require("../config/logger");
const settings_2 = require("./settings");
class OutlineClient {
    baseUrl;
    constructor() {
        this.baseUrl = settings_1.config.outlineUrl;
    }
    async getApiKey() {
        const dbKey = await (0, settings_2.getOutlineApiKey)();
        if (dbKey) {
            return dbKey;
        }
        if (settings_1.config.outlineApiKey) {
            return settings_1.config.outlineApiKey;
        }
        throw new Error('Outline API key not configured. Please set it in AI Copilot settings.');
    }
    async request(endpoint, body = {}, options) {
        const url = `${this.baseUrl}/api/${endpoint}`;
        logger_1.logger.debug('Outline API request', { endpoint, body: JSON.stringify(body).substring(0, 200), hasCookies: !!options?.cookies });
        const headers = {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
        };
        if (options?.cookies) {
            headers['Cookie'] = options.cookies;
            logger_1.logger.debug('Outline API using cookie auth');
        }
        else {
            const apiKey = await this.getApiKey();
            headers['Authorization'] = `Bearer ${apiKey}`;
            logger_1.logger.debug('Outline API using API key auth');
        }
        logger_1.logger.debug(`Outline API calling: ${url}`);
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        logger_1.logger.debug(`Outline API response status: ${response.status}`);
        if (!response.ok) {
            const errorText = await response.text();
            logger_1.logger.error('Outline API error', { status: response.status, error: errorText });
            throw new Error(`Outline API error: ${response.status} - ${errorText}`);
        }
        const result = await response.json();
        logger_1.logger.debug(`Outline API response for ${endpoint}`, {
            dataKeys: result.data ? Object.keys(result.data) : [],
            isArray: Array.isArray(result.data),
        });
        return result.data;
    }
    async getDocument(documentId) {
        const doc = await this.request('documents.info', { id: documentId });
        logger_1.logger.info('getDocument result', {
            id: doc.id,
            title: doc.title,
            hasText: !!doc.text,
            textLength: doc.text?.length ?? 0,
            textType: typeof doc.text,
        });
        return doc;
    }
    async listDocuments(options = {}) {
        return this.request('documents.list', {
            limit: options.limit || 100,
            offset: options.offset || 0,
            ...(options.collectionId && { collectionId: options.collectionId })
        });
    }
    async createDocument(options) {
        return this.request('documents.create', {
            title: options.title,
            text: options.text,
            ...(options.collectionId && { collectionId: options.collectionId }),
            ...(options.parentDocumentId && { parentDocumentId: options.parentDocumentId }),
            publish: options.publish ?? true
        });
    }
    async updateDocument(options) {
        return this.request('documents.update', options);
    }
    async listCollections(options) {
        return this.request('collections.list', {}, options);
    }
    async createCollection(options) {
        return this.request('collections.create', {
            name: options.name,
            ...(options.description && { description: options.description }),
            ...(options.color && { color: options.color }),
            permission: options.permission || 'read_write'
        });
    }
    async getCollectionDocuments(collectionId) {
        const documents = [];
        let offset = 0;
        const limit = 100;
        while (true) {
            const batch = await this.listDocuments({ collectionId, limit, offset });
            documents.push(...batch);
            if (batch.length < limit) {
                break;
            }
            offset += limit;
        }
        return documents;
    }
}
exports.outlineClient = new OutlineClient();
//# sourceMappingURL=outline.js.map