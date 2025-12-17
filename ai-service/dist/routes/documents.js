"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const outline_1 = require("../services/outline");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
const createDocumentSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Title is required'),
    text: zod_1.z.string().default(''),
    collectionId: zod_1.z.string().optional(),
    parentDocumentId: zod_1.z.string().optional(),
    publish: zod_1.z.boolean().optional().default(true)
}).refine((data) => {
    // collectionId is required when publishing
    if (data.publish !== false && !data.collectionId) {
        return false;
    }
    return true;
}, {
    message: 'Collection ID is required when publishing',
    path: ['collectionId']
});
const createCollectionSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required'),
    description: zod_1.z.string().optional(),
    color: zod_1.z.string().optional(),
    permission: zod_1.z.enum(['read', 'read_write']).optional().default('read_write')
});
router.get('/collections', async (req, res) => {
    try {
        const cookies = req.headers.cookie;
        logger_1.logger.debug(`GET /collections - cookies present: ${!!cookies}`);
        logger_1.logger.debug(`GET /collections - cookie header: ${cookies ? cookies.substring(0, 100) + '...' : 'none'}`);
        const collections = await outline_1.outlineClient.listCollections(cookies ? { cookies } : undefined);
        logger_1.logger.debug(`GET /collections - received ${collections.length} collections`);
        logger_1.logger.debug(`GET /collections - collection names: ${collections.map(c => c.name).join(', ') || 'none'}`);
        res.json({
            success: true,
            collections: collections.map(c => ({
                id: c.id,
                name: c.name,
                description: c.description,
                documentCount: c.documentCount
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to list collections', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'LIST_COLLECTIONS_FAILED',
                message: error instanceof Error ? error.message : 'Failed to list collections'
            }
        });
    }
});
router.post('/collections', async (req, res) => {
    try {
        const body = createCollectionSchema.parse(req.body);
        const collection = await outline_1.outlineClient.createCollection({
            name: body.name,
            description: body.description,
            color: body.color,
            permission: body.permission
        });
        res.json({
            success: true,
            collection: {
                id: collection.id,
                name: collection.name,
                description: collection.description
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create collection', error);
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
                code: 'CREATE_COLLECTION_FAILED',
                message: error instanceof Error ? error.message : 'Failed to create collection'
            }
        });
    }
});
router.get('/collections/:collectionId/documents', async (req, res) => {
    try {
        const { collectionId } = req.params;
        const documents = await outline_1.outlineClient.listDocuments({ collectionId, limit: 100 });
        res.json({
            success: true,
            documents: documents.map(d => ({
                id: d.id,
                title: d.title,
                parentDocumentId: d.parentDocumentId,
                url: d.url
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to list documents', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'LIST_DOCUMENTS_FAILED',
                message: error instanceof Error ? error.message : 'Failed to list documents'
            }
        });
    }
});
router.post('/documents', async (req, res) => {
    try {
        const body = createDocumentSchema.parse(req.body);
        const document = await outline_1.outlineClient.createDocument({
            title: body.title,
            text: body.text,
            collectionId: body.collectionId,
            parentDocumentId: body.parentDocumentId,
            publish: body.publish
        });
        res.json({
            success: true,
            document: {
                id: document.id,
                title: document.title,
                url: document.url,
                collectionId: document.collectionId,
                parentDocumentId: document.parentDocumentId
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create document', error);
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
                code: 'CREATE_DOCUMENT_FAILED',
                message: error instanceof Error ? error.message : 'Failed to create document'
            }
        });
    }
});
exports.default = router;
//# sourceMappingURL=documents.js.map