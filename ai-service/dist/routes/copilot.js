"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const openai_1 = require("../services/openai");
const outline_1 = require("../services/outline");
const embeddings_1 = require("../services/embeddings");
const settings_1 = require("../services/settings");
const settings_2 = require("../config/settings");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
const attachmentSchema = zod_1.z.object({
    id: zod_1.z.string(),
    filename: zod_1.z.string(),
    content: zod_1.z.string()
});
const chatSchema = zod_1.z.object({
    documentId: zod_1.z.string().optional(),
    documentPath: zod_1.z.string().optional(),
    documentContent: zod_1.z.string().optional(),
    question: zod_1.z.string().min(1),
    mode: zod_1.z.enum(['documentation', 'workflow', 'sop', 'kbChat']).optional().default('documentation'),
    conversationHistory: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.enum(['user', 'assistant']),
        content: zod_1.z.string()
    })).optional().default([]),
    attachments: zod_1.z.array(attachmentSchema).optional().default([])
}).refine(data => data.documentId || data.documentContent, { message: 'Either documentId or documentContent is required' });
const applySchema = zod_1.z.object({
    documentId: zod_1.z.string(),
    markdown: zod_1.z.string()
});
const insertSchema = zod_1.z.object({
    documentId: zod_1.z.string(),
    content: zod_1.z.string().min(1)
});
function detectEditRequest(question) {
    const lowerQuestion = question.toLowerCase();
    return settings_2.EDIT_KEYWORDS.some(keyword => lowerQuestion.includes(keyword));
}
function detectRAGTrigger(question) {
    const lowerQuestion = question.toLowerCase();
    return settings_2.RAG_TRIGGER_KEYWORDS.some(phrase => lowerQuestion.includes(phrase));
}
async function fetchRAGContext(query) {
    try {
        const chunks = await (0, embeddings_1.searchSimilar)({ query, limit: 3 });
        if (chunks.length === 0) {
            return null;
        }
        const context = chunks.map((chunk, i) => `[Source ${i + 1}: "${chunk.title}" - ${chunk.section || 'Main'}]\n${chunk.content}`).join('\n\n---\n\n');
        const sources = chunks.map(chunk => ({
            title: chunk.title,
            section: chunk.section || 'Main',
            url: chunk.url || `/doc/${chunk.documentId}`
        }));
        return { context, sources };
    }
    catch (error) {
        logger_1.logger.warn('Failed to fetch RAG context', error);
        return null;
    }
}
router.post('/chat', async (req, res) => {
    try {
        const body = chatSchema.parse(req.body);
        const settings = await (0, settings_1.getFeatureSettings)('copilot');
        const modePrompt = await (0, settings_1.getModePrompt)(body.mode);
        let documentContent = body.documentContent;
        let documentTitle = 'Document';
        if (body.documentId && !documentContent) {
            const doc = await outline_1.outlineClient.getDocument(body.documentId);
            documentContent = doc.text;
            documentTitle = doc.title;
        }
        const isEditRequest = detectEditRequest(body.question);
        const isRAGTriggered = detectRAGTrigger(body.question);
        let ragContext = null;
        if (isRAGTriggered) {
            logger_1.logger.info('RAG trigger detected, fetching knowledge base context', { question: body.question });
            ragContext = await fetchRAGContext(body.question);
        }
        const documentPathInfo = body.documentPath ? `\nDocument location: ${body.documentPath}` : '';
        const messages = [
            { role: 'system', content: modePrompt },
            {
                role: 'system',
                content: `Current document title: "${documentTitle}"${documentPathInfo}\n\nCurrent document content:\n\n${documentContent}`
            }
        ];
        if (ragContext) {
            messages.push({
                role: 'system',
                content: `Additional context from the knowledge base (use this to enhance your response):\n\n${ragContext.context}`
            });
        }
        if (body.attachments && body.attachments.length > 0) {
            const attachmentContext = body.attachments.map((att, i) => `[Attachment ${i + 1}: "${att.filename}"]\n${att.content}`).join('\n\n---\n\n');
            messages.push({
                role: 'system',
                content: `User has uploaded the following files for context:\n\n${attachmentContext}`
            });
            logger_1.logger.info('Added attachment context', { count: body.attachments.length });
        }
        for (const msg of body.conversationHistory) {
            messages.push({ role: msg.role, content: msg.content });
        }
        messages.push({ role: 'user', content: body.question });
        const answer = await (0, openai_1.chat)({
            feature: 'copilot',
            messages
        });
        let suggestedEdit = null;
        if (isEditRequest) {
            const editMessages = [
                {
                    role: 'system',
                    content: 'You are a document editor. Apply the requested changes to the document and output ONLY the complete updated document in Markdown format. Do not include any explanations or commentary.'
                },
                {
                    role: 'user',
                    content: `Original document:\n\n${documentContent}\n\nRequested changes: ${body.question}\n\nSuggested approach: ${answer}\n\nOutput the complete updated document:`
                }
            ];
            suggestedEdit = await (0, openai_1.chat)({
                feature: 'copilot',
                messages: editMessages,
                overrides: { maxTokens: Math.min(settings.maxTokens * 2, 8192) }
            });
        }
        res.json({
            success: true,
            answer,
            suggestedEdit,
            hasEdit: !!suggestedEdit,
            usedKBContext: !!ragContext,
            kbSources: ragContext?.sources || []
        });
    }
    catch (error) {
        logger_1.logger.error('Copilot chat failed', error);
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
                code: 'COPILOT_FAILED',
                message: error instanceof Error ? error.message : 'Copilot request failed'
            }
        });
    }
});
router.post('/apply', async (req, res) => {
    try {
        const body = applySchema.parse(req.body);
        const doc = await outline_1.outlineClient.updateDocument({
            id: body.documentId,
            text: body.markdown
        });
        res.json({
            success: true,
            document: {
                id: doc.id,
                url: doc.url
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Apply edit failed', error);
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
                code: 'APPLY_FAILED',
                message: error instanceof Error ? error.message : 'Failed to apply edit'
            }
        });
    }
});
router.post('/insert', async (req, res) => {
    try {
        const body = insertSchema.parse(req.body);
        const currentDoc = await outline_1.outlineClient.getDocument(body.documentId);
        const separator = '\n\n## 📝 AI Copilot Response\n\n';
        const updatedText = currentDoc.text + separator + body.content;
        const updatedDoc = await outline_1.outlineClient.updateDocument({
            id: body.documentId,
            text: updatedText
        });
        logger_1.logger.info('Content inserted into document', {
            documentId: body.documentId,
            contentLength: body.content.length
        });
        res.json({
            success: true,
            document: {
                id: updatedDoc.id,
                title: updatedDoc.title,
                url: updatedDoc.url
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Insert content failed', error);
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
        const errorMessage = error instanceof Error ? error.message : 'Failed to insert content';
        if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'PERMISSION_DENIED',
                    message: 'You do not have permission to edit this document'
                }
            });
            return;
        }
        if (errorMessage.includes('404') || errorMessage.includes('not found')) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'DOCUMENT_NOT_FOUND',
                    message: 'Document not found'
                }
            });
            return;
        }
        res.status(500).json({
            success: false,
            error: {
                code: 'INSERT_FAILED',
                message: errorMessage
            }
        });
    }
});
exports.default = router;
//# sourceMappingURL=copilot.js.map