import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { chat } from '../services/openai';
import { outlineClient } from '../services/outline';
import { getFeatureSettings } from '../services/settings';
import { logger } from '../config/logger';

const router = Router();

const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content: z.string()
});

const generateSchema = z.object({
  title: z.string().min(1),
  collectionId: z.string().optional(),
  template: z.string().optional().default('sop'),
  inputs: z.object({
    department: z.string().optional(),
    goal: z.string().optional(),
    systems: z.array(z.string()).optional(),
    notes: z.string().optional(),
    transcript: z.string().optional()
  }).optional().default({}),
  attachments: z.array(attachmentSchema).optional().default([]),
  publish: z.boolean().optional().default(false)
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const body = generateSchema.parse(req.body);
    const settings = await getFeatureSettings('builder');

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

    if (body.attachments && body.attachments.length > 0) {
      userPrompt += `\nReference files provided:\n`;
      body.attachments.forEach((att, i) => {
        userPrompt += `\n--- File ${i + 1}: "${att.filename}" ---\n${att.content}\n`;
      });
      userPrompt += `\nPlease use the content from these reference files to inform and enhance the document.\n`;
      logger.info('Added attachment context to builder prompt', { count: body.attachments.length });
    }

    const markdown = await chat({
      feature: 'builder',
      messages: [
        { role: 'system', content: settings.systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    let outlineDocument = null;
    if (body.publish && body.collectionId) {
      try {
        outlineDocument = await outlineClient.createDocument({
          title: body.title,
          text: markdown,
          collectionId: body.collectionId,
          publish: true
        });
        logger.info('Document published to Outline', { documentId: outlineDocument.id });
      } catch (error) {
        logger.error('Failed to publish to Outline', error);
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
  } catch (error) {
    logger.error('Document generation failed', error);
    
    if (error instanceof z.ZodError) {
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

export default router;
