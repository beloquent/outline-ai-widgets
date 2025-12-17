"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const openai_1 = require("../services/openai");
const outline_1 = require("../services/outline");
const embeddings_1 = require("../services/embeddings");
const settings_1 = require("../services/settings");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
const chatSchema = zod_1.z.object({
    question: zod_1.z.string().min(1),
    filters: zod_1.z.object({
        collectionId: zod_1.z.string().optional()
    }).optional().default({}),
    limit: zod_1.z.number().min(1).max(20).optional().default(5)
});
router.post('/chat', async (req, res) => {
    try {
        const body = chatSchema.parse(req.body);
        const kbChatPrompt = await (0, settings_1.getModePrompt)('kbChat');
        const chunks = await (0, embeddings_1.searchSimilar)({
            query: body.question,
            collectionId: body.filters.collectionId,
            limit: body.limit
        });
        if (chunks.length === 0) {
            res.json({
                success: true,
                answer: "I couldn't find any relevant information in the indexed documents to answer your question.",
                sources: []
            });
            return;
        }
        const context = chunks.map((chunk, i) => `[Source ${i + 1}: "${chunk.title}" - ${chunk.section || 'Main'}]\n${chunk.content}`).join('\n\n---\n\n');
        const answer = await (0, openai_1.chat)({
            feature: 'rag',
            messages: [
                { role: 'system', content: kbChatPrompt },
                {
                    role: 'user',
                    content: `Context from documentation:\n\n${context}\n\n---\n\nQuestion: ${body.question}`
                }
            ]
        });
        res.json({
            success: true,
            answer,
            sources: chunks.map(chunk => ({
                documentId: chunk.documentId,
                title: chunk.title,
                section: chunk.section,
                url: chunk.url,
                relevance: chunk.relevance
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('RAG chat failed', error);
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
                code: 'RAG_FAILED',
                message: error instanceof Error ? error.message : 'RAG request failed'
            }
        });
    }
});
router.post('/index/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const doc = await outline_1.outlineClient.getDocument(documentId);
        const chunksCreated = await (0, embeddings_1.indexDocument)({
            documentId: doc.id,
            collectionId: doc.collectionId,
            title: doc.title,
            content: doc.text
        });
        res.json({
            success: true,
            documentId,
            chunksCreated
        });
    }
    catch (error) {
        logger_1.logger.error('Document indexing failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INDEX_FAILED',
                message: error instanceof Error ? error.message : 'Failed to index document'
            }
        });
    }
});
router.post('/index-collection/:collectionId', async (req, res) => {
    try {
        const { collectionId } = req.params;
        const documents = await outline_1.outlineClient.getCollectionDocuments(collectionId);
        let documentsIndexed = 0;
        let chunksCreated = 0;
        for (const doc of documents) {
            try {
                const chunks = await (0, embeddings_1.indexDocument)({
                    documentId: doc.id,
                    collectionId: doc.collectionId,
                    title: doc.title,
                    content: doc.text
                });
                documentsIndexed++;
                chunksCreated += chunks;
            }
            catch (error) {
                logger_1.logger.error('Failed to index document in collection', { documentId: doc.id, error });
            }
        }
        res.json({
            success: true,
            collectionId,
            documentsIndexed,
            chunksCreated
        });
    }
    catch (error) {
        logger_1.logger.error('Collection indexing failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INDEX_FAILED',
                message: error instanceof Error ? error.message : 'Failed to index collection'
            }
        });
    }
});
router.get('/status', async (req, res) => {
    try {
        const stats = await (0, embeddings_1.getIndexStats)();
        res.json({
            success: true,
            stats
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get index status', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'STATUS_FAILED',
                message: 'Failed to get index status'
            }
        });
    }
});
exports.default = router;
//# sourceMappingURL=rag.js.map