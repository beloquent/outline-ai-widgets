"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const openai_1 = require("../services/openai");
const outline_1 = require("../services/outline");
const settings_1 = require("../services/settings");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
const generateSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    collectionId: zod_1.z.string().optional(),
    template: zod_1.z.string().optional().default('sop'),
    inputs: zod_1.z.object({
        department: zod_1.z.string().optional(),
        goal: zod_1.z.string().optional(),
        systems: zod_1.z.array(zod_1.z.string()).optional(),
        notes: zod_1.z.string().optional(),
        transcript: zod_1.z.string().optional()
    }).optional().default({}),
    publish: zod_1.z.boolean().optional().default(false)
});
router.post('/generate', async (req, res) => {
    try {
        const body = generateSchema.parse(req.body);
        const settings = await (0, settings_1.getFeatureSettings)('builder');
        let userPrompt = `Create a professional ${body.template.toUpperCase()} document with the following details:\n\n`;
        userPrompt += `Title: ${body.title}\n`;
        if (body.inputs.department) {
            userPrompt += `Department: ${body.inputs.department}\n`;
        }
        if (body.inputs.goal) {
            userPrompt += `Goal/Purpose: ${body.inputs.goal}\n`;
        }
        if (body.inputs.systems && body.inputs.systems.length > 0) {
            userPrompt += `Systems/Tools Involved: ${body.inputs.systems.join(', ')}\n`;
        }
        if (body.inputs.notes) {
            userPrompt += `Additional Notes: ${body.inputs.notes}\n`;
        }
        if (body.inputs.transcript) {
            userPrompt += `\nMeeting Transcript to analyze:\n${body.inputs.transcript}\n`;
        }
        const markdown = await (0, openai_1.chat)({
            feature: 'builder',
            messages: [
                { role: 'system', content: settings.systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        });
        let outlineDocument = null;
        if (body.publish && body.collectionId) {
            try {
                outlineDocument = await outline_1.outlineClient.createDocument({
                    title: body.title,
                    text: markdown,
                    collectionId: body.collectionId,
                    publish: true
                });
                logger_1.logger.info('Document published to Outline', { documentId: outlineDocument.id });
            }
            catch (error) {
                logger_1.logger.error('Failed to publish to Outline', error);
            }
        }
        res.json({
            success: true,
            document: {
                title: body.title,
                markdown,
                outlineDocument: outlineDocument ? {
                    id: outlineDocument.id,
                    url: outlineDocument.url
                } : null
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Document generation failed', error);
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
                code: 'GENERATION_FAILED',
                message: error instanceof Error ? error.message : 'Failed to generate document'
            }
        });
    }
});
exports.default = router;
//# sourceMappingURL=builder.js.map