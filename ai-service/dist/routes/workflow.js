"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const connection_1 = require("../db/connection");
const outline_1 = require("../services/outline");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
const submitSchema = zod_1.z.object({
    documentId: zod_1.z.string(),
    reviewers: zod_1.z.array(zod_1.z.string()).min(1)
});
const approveSchema = zod_1.z.object({
    taskId: zod_1.z.string()
});
const rejectSchema = zod_1.z.object({
    taskId: zod_1.z.string(),
    reason: zod_1.z.string().optional()
});
router.post('/submit', async (req, res) => {
    try {
        const body = submitSchema.parse(req.body);
        const userId = req.userToken;
        await outline_1.outlineClient.getDocument(body.documentId);
        const instanceResult = await (0, connection_1.query)(`INSERT INTO ai_workflow_instances (document_id, status, submitted_by)
       VALUES ($1, 'pending_review', $2)
       RETURNING id, status`, [body.documentId, userId]);
        const instance = instanceResult.rows[0];
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + 3);
        for (const reviewerId of body.reviewers) {
            await (0, connection_1.query)(`INSERT INTO ai_workflow_tasks (instance_id, step_key, assignee_id, due_at)
         VALUES ($1, 'review', $2, $3)`, [instance.id, reviewerId, dueAt]);
        }
        res.json({
            success: true,
            workflow: {
                instanceId: instance.id,
                status: instance.status,
                nextStep: 'review',
                documentId: body.documentId
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Submit for review failed', error);
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
                code: 'SUBMIT_FAILED',
                message: error instanceof Error ? error.message : 'Failed to submit for review'
            }
        });
    }
});
router.get('/tasks', async (req, res) => {
    try {
        const userId = req.userToken;
        const result = await (0, connection_1.query)(`SELECT 
        t.id as task_id,
        t.instance_id,
        t.step_key,
        t.created_at,
        t.due_at,
        i.document_id,
        i.status as workflow_status
       FROM ai_workflow_tasks t
       JOIN ai_workflow_instances i ON t.instance_id = i.id
       WHERE t.assignee_id = $1 
         AND t.completed_at IS NULL
         AND i.status = 'pending_review'
       ORDER BY t.created_at DESC`, [userId]);
        const tasks = await Promise.all(result.rows.map(async (row) => {
            let document = null;
            try {
                const doc = await outline_1.outlineClient.getDocument(row.document_id);
                document = {
                    id: doc.id,
                    title: doc.title,
                    url: doc.url
                };
            }
            catch (e) {
                logger_1.logger.warn('Could not fetch document for task', { documentId: row.document_id });
            }
            return {
                taskId: row.task_id,
                instanceId: row.instance_id,
                stepKey: row.step_key,
                createdAt: row.created_at,
                dueAt: row.due_at,
                document
            };
        }));
        res.json({
            success: true,
            tasks
        });
    }
    catch (error) {
        logger_1.logger.error('Get tasks failed', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'GET_TASKS_FAILED',
                message: 'Failed to get tasks'
            }
        });
    }
});
router.post('/approve', async (req, res) => {
    try {
        const body = approveSchema.parse(req.body);
        const userId = req.userToken;
        const taskResult = await (0, connection_1.query)(`UPDATE ai_workflow_tasks 
       SET completed_at = NOW(), decision = 'approved'
       WHERE id = $1 AND assignee_id = $2 AND completed_at IS NULL
       RETURNING instance_id`, [body.taskId, userId]);
        if (taskResult.rowCount === 0) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'TASK_NOT_FOUND',
                    message: 'Task not found or already completed'
                }
            });
            return;
        }
        const instanceId = taskResult.rows[0].instance_id;
        const pendingTasks = await (0, connection_1.query)(`SELECT COUNT(*) as count FROM ai_workflow_tasks 
       WHERE instance_id = $1 AND completed_at IS NULL`, [instanceId]);
        if (parseInt(pendingTasks.rows[0].count, 10) === 0) {
            await (0, connection_1.query)(`UPDATE ai_workflow_instances 
         SET status = 'approved', completed_at = NOW(), completed_by = $1
         WHERE id = $2
         RETURNING document_id`, [userId, instanceId]);
        }
        const instance = await (0, connection_1.query)('SELECT id, status, document_id FROM ai_workflow_instances WHERE id = $1', [instanceId]);
        res.json({
            success: true,
            workflow: {
                instanceId: instance.rows[0].id,
                status: instance.rows[0].status,
                documentId: instance.rows[0].document_id
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Approve task failed', error);
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
                code: 'APPROVE_FAILED',
                message: error instanceof Error ? error.message : 'Failed to approve'
            }
        });
    }
});
router.post('/reject', async (req, res) => {
    try {
        const body = rejectSchema.parse(req.body);
        const userId = req.userToken;
        const taskResult = await (0, connection_1.query)(`UPDATE ai_workflow_tasks 
       SET completed_at = NOW(), decision = 'rejected', reason = $3
       WHERE id = $1 AND assignee_id = $2 AND completed_at IS NULL
       RETURNING instance_id`, [body.taskId, userId, body.reason || null]);
        if (taskResult.rowCount === 0) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'TASK_NOT_FOUND',
                    message: 'Task not found or already completed'
                }
            });
            return;
        }
        const instanceId = taskResult.rows[0].instance_id;
        const instance = await (0, connection_1.query)(`UPDATE ai_workflow_instances 
       SET status = 'rejected', completed_at = NOW(), completed_by = $1
       WHERE id = $2
       RETURNING id, status, document_id`, [userId, instanceId]);
        res.json({
            success: true,
            workflow: {
                instanceId: instance.rows[0].id,
                status: instance.rows[0].status,
                documentId: instance.rows[0].document_id
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Reject task failed', error);
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
                code: 'REJECT_FAILED',
                message: error instanceof Error ? error.message : 'Failed to reject'
            }
        });
    }
});
exports.default = router;
//# sourceMappingURL=workflow.js.map