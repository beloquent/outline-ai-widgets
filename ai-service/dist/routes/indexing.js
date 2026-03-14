"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const connection_1 = require("../db/connection");
const outline_1 = require("../services/outline");
const embeddings_1 = require("../services/embeddings");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
const reindexSchema = zod_1.z.object({
    collections: zod_1.z.array(zod_1.z.string()).optional(),
    force: zod_1.z.boolean().optional().default(false)
});
const scheduleSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    frequency: zod_1.z.enum(['hourly', 'daily', 'weekly']),
    time: zod_1.z.string().optional()
});
router.post('/reindex-all', async (req, res) => {
    try {
        const body = reindexSchema.parse(req.body);
        const jobResult = await (0, connection_1.query)(`INSERT INTO ai_indexing_jobs (status, collections, started_at)
       VALUES ('running', $1, NOW())
       RETURNING id`, [JSON.stringify(body.collections || [])]);
        const jobId = jobResult.rows[0].id;
        (async () => {
            try {
                let documents = [];
                if (body.collections && body.collections.length > 0) {
                    for (const collectionId of body.collections) {
                        const collDocs = await outline_1.outlineClient.getCollectionDocuments(collectionId);
                        documents.push(...collDocs);
                    }
                }
                else {
                    let offset = 0;
                    const limit = 100;
                    while (true) {
                        const batch = await outline_1.outlineClient.listDocuments({ limit, offset });
                        documents.push(...batch);
                        if (batch.length < limit) {
                            break;
                        }
                        offset += limit;
                    }
                }
                await (0, connection_1.query)('UPDATE ai_indexing_jobs SET documents_queued = $1 WHERE id = $2', [documents.length, jobId]);
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
                        await (0, connection_1.query)('UPDATE ai_indexing_jobs SET documents_indexed = $1, chunks_created = $2 WHERE id = $3', [documentsIndexed, chunksCreated, jobId]);
                    }
                    catch (error) {
                        logger_1.logger.error('Failed to index document', { documentId: doc.id, error });
                    }
                }
                await (0, connection_1.query)(`UPDATE ai_indexing_jobs 
           SET status = 'completed', completed_at = NOW(), 
               documents_indexed = $1, chunks_created = $2
           WHERE id = $3`, [documentsIndexed, chunksCreated, jobId]);
                logger_1.logger.info('Reindex job completed', { jobId, documentsIndexed, chunksCreated });
            }
            catch (error) {
                logger_1.logger.error('Reindex job failed', { jobId, error });
                await (0, connection_1.query)(`UPDATE ai_indexing_jobs SET status = 'failed', error = $1 WHERE id = $2`, [error instanceof Error ? error.message : 'Unknown error', jobId]);
            }
        })();
        res.json({
            success: true,
            job: {
                jobId,
                status: 'started',
                documentsQueued: 0
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Reindex-all failed', error);
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
                code: 'REINDEX_FAILED',
                message: error instanceof Error ? error.message : 'Failed to start reindex'
            }
        });
    }
});
router.get('/jobs', async (req, res) => {
    try {
        const result = await (0, connection_1.query)(`SELECT * FROM ai_indexing_jobs ORDER BY started_at DESC LIMIT 20`);
        res.json({
            success: true,
            jobs: result.rows.map((row) => ({
                jobId: row.id,
                status: row.status,
                collections: row.collections,
                documentsQueued: row.documents_queued,
                documentsIndexed: row.documents_indexed,
                chunksCreated: row.chunks_created,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                error: row.error
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Get jobs failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_JOBS_FAILED',
                message: 'Failed to get indexing jobs'
            }
        });
    }
});
router.get('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const result = await (0, connection_1.query)('SELECT * FROM ai_indexing_jobs WHERE id = $1', [jobId]);
        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'JOB_NOT_FOUND',
                    message: 'Job not found'
                }
            });
            return;
        }
        const row = result.rows[0];
        res.json({
            success: true,
            job: {
                jobId: row.id,
                status: row.status,
                collections: row.collections,
                documentsQueued: row.documents_queued,
                documentsIndexed: row.documents_indexed,
                chunksCreated: row.chunks_created,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                error: row.error
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get job failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_JOB_FAILED',
                message: 'Failed to get job'
            }
        });
    }
});
router.post('/schedule', async (req, res) => {
    try {
        const body = scheduleSchema.parse(req.body);
        await (0, connection_1.query)(`INSERT INTO ai_settings (key, value, updated_at)
       VALUES ('indexing_schedule', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify(body)]);
        res.json({
            success: true,
            schedule: {
                enabled: body.enabled,
                frequency: body.frequency,
                time: body.time,
                nextRun: body.enabled ? calculateNextRun(body.frequency, body.time) : null
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Set schedule failed', error);
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
                code: 'SCHEDULE_FAILED',
                message: 'Failed to set schedule'
            }
        });
    }
});
router.get('/schedule', async (req, res) => {
    try {
        const result = await (0, connection_1.query)("SELECT value FROM ai_settings WHERE key = 'indexing_schedule'");
        if (result.rows.length === 0) {
            res.json({
                success: true,
                schedule: {
                    enabled: false,
                    frequency: 'daily',
                    time: '02:00',
                    nextRun: null
                }
            });
            return;
        }
        const schedule = result.rows[0].value;
        res.json({
            success: true,
            schedule: {
                ...schedule,
                nextRun: schedule.enabled ? calculateNextRun(schedule.frequency, schedule.time) : null
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get schedule failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_SCHEDULE_FAILED',
                message: 'Failed to get schedule'
            }
        });
    }
});
function calculateNextRun(frequency, time) {
    const now = new Date();
    const next = new Date(now);
    if (time) {
        const [hours, minutes] = time.split(':').map(Number);
        next.setHours(hours, minutes, 0, 0);
    }
    switch (frequency) {
        case 'hourly':
            next.setHours(next.getHours() + 1);
            next.setMinutes(0, 0, 0);
            break;
        case 'daily':
            if (next <= now) {
                next.setDate(next.getDate() + 1);
            }
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
    }
    return next.toISOString();
}
exports.default = router;
//# sourceMappingURL=indexing.js.map