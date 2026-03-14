import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { chat } from '../services/openai';
import { outlineClient } from '../services/outline';
import { searchSimilar } from '../services/embeddings';
import { getFeatureSettings, getModePrompt } from '../services/settings';
import { EDIT_KEYWORDS, RAG_TRIGGER_KEYWORDS, CopilotMode } from '../config/settings';
import { logger } from '../config/logger';

const router = Router();

const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content: z.string()
});

const chatSchema = z.object({
  documentId: z.string().optional(),
  documentPath: z.string().optional(),
  documentContent: z.string().optional(),
  question: z.string().min(1),
  mode: z.enum(['documentation', 'workflow', 'sop', 'kbChat']).optional().default('documentation'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional().default([]),
  attachments: z.array(attachmentSchema).optional().default([])
}).refine(
  data => data.documentId || data.documentContent,
  { message: 'Either documentId or documentContent is required' }
);

const applySchema = z.object({
  documentId: z.string(),
  markdown: z.string()
});

const insertSchema = z.object({
  documentId: z.string(),
  content: z.string().min(1)
});

function detectEditRequest(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  return EDIT_KEYWORDS.some(keyword => lowerQuestion.includes(keyword));
}

function detectRAGTrigger(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  return RAG_TRIGGER_KEYWORDS.some(phrase => lowerQuestion.includes(phrase));
}

async function fetchRAGContext(query: string): Promise<{ context: string; sources: Array<{ title: string; section: string; url: string }> } | null> {
  try {
    const chunks = await searchSimilar({ query, limit: 3 });
    
    if (chunks.length === 0) {
      return null;
    }
    
    const context = chunks.map((chunk, i) => 
      `[Source ${i + 1}: "${chunk.title}" - ${chunk.section || 'Main'}]\n${chunk.content}`
    ).join('\n\n---\n\n');
    
    const sources = chunks.map(chunk => ({
      title: chunk.title,
      section: chunk.section || 'Main',
      url: chunk.url || `/doc/${chunk.documentId}`
    }));
    
    return { context, sources };
  } catch (error) {
    logger.warn('Failed to fetch RAG context', error);
    return null;
  }
}

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const body = chatSchema.parse(req.body);
    const settings = await getFeatureSettings('copilot');
    const modePrompt = await getModePrompt(body.mode as CopilotMode);

    let documentContent = body.documentContent || '';
    let documentTitle = 'Document';

    // Always fetch from Outline API to ensure fresh content —
    // the widget's cached context may be stale or empty
    if (body.documentId) {
      try {
        const doc = await outlineClient.getDocument(body.documentId);
        documentTitle = doc.title || documentTitle;
        logger.info('Document fetched from Outline API', {
          documentId: body.documentId,
          title: doc.title,
          textLength: doc.text?.length ?? 0,
          hasText: !!doc.text,
          textPreview: doc.text?.substring(0, 100) || '(empty)',
        });
        // Prefer the API-fetched content (freshest), fall back to widget-provided content
        if (doc.text && doc.text.trim().length > 0) {
          documentContent = doc.text;
        }
      } catch (err) {
        logger.warn('Failed to fetch document from Outline API, using widget-provided content', {
          documentId: body.documentId,
          error: String(err),
          widgetContentLength: documentContent.length,
        });
      }
    }

    logger.info('Document content for AI prompt', {
      documentId: body.documentId,
      documentTitle,
      contentLength: documentContent.length,
      contentPreview: documentContent.substring(0, 150) || '(empty)',
    });

    const isEditRequest = detectEditRequest(body.question);
    const isRAGTriggered = detectRAGTrigger(body.question);
    
    let ragContext: { context: string; sources: Array<{ title: string; section: string; url: string }> } | null = null;
    if (isRAGTriggered) {
      logger.info('RAG trigger detected, fetching knowledge base context', { question: body.question });
      ragContext = await fetchRAGContext(body.question);
    }

    const documentPathInfo = body.documentPath ? `\nDocument location: ${body.documentPath}` : '';
    
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
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
      const attachmentContext = body.attachments.map((att, i) => 
        `[Attachment ${i + 1}: "${att.filename}"]\n${att.content}`
      ).join('\n\n---\n\n');
      
      messages.push({
        role: 'system',
        content: `User has uploaded the following files for context:\n\n${attachmentContext}`
      });
      
      logger.info('Added attachment context', { count: body.attachments.length });
    }

    for (const msg of body.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: 'user', content: body.question });

    const answer = await chat({
      feature: 'copilot',
      messages
    });

    let suggestedEdit: string | null = null;

    if (isEditRequest) {
      const editMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { 
          role: 'system', 
          content: 'You are a document editor. Apply the requested changes to the document and output ONLY the complete updated document in Markdown format. Do not include any explanations or commentary.' 
        },
        { 
          role: 'user', 
          content: `Original document:\n\n${documentContent}\n\nRequested changes: ${body.question}\n\nSuggested approach: ${answer}\n\nOutput the complete updated document:` 
        }
      ];

      suggestedEdit = await chat({
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
  } catch (error) {
    logger.error('Copilot chat failed', error);
    
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
        code: 'COPILOT_FAILED',
        message: error instanceof Error ? error.message : 'Copilot request failed'
      }
    });
  }
});

router.post('/apply', async (req: Request, res: Response) => {
  try {
    const body = applySchema.parse(req.body);

    const doc = await outlineClient.updateDocument({
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
  } catch (error) {
    logger.error('Apply edit failed', error);
    
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
        code: 'APPLY_FAILED',
        message: error instanceof Error ? error.message : 'Failed to apply edit'
      }
    });
  }
});

router.post('/insert', async (req: Request, res: Response) => {
  try {
    const body = insertSchema.parse(req.body);

    const currentDoc = await outlineClient.getDocument(body.documentId);
    
    const separator = '\n\n## 📝 AI Copilot Response\n\n';
    const updatedText = currentDoc.text + separator + body.content;

    const updatedDoc = await outlineClient.updateDocument({
      id: body.documentId,
      text: updatedText
    });

    logger.info('Content inserted into document', { 
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
  } catch (error) {
    logger.error('Insert content failed', error);
    
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

export default router;
