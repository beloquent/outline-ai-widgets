import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { chat } from '../services/openai';
import { outlineClient } from '../services/outline';
import { indexDocument, searchSimilar, getIndexStats } from '../services/embeddings';
import { getFeatureSettings, getModePrompt } from '../services/settings';
import { logger } from '../config/logger';

const router = Router();

const chatSchema = z.object({
  question: z.string().min(1),
  filters: z.object({
    collectionId: z.string().optional()
  }).optional().default({}),
  limit: z.number().min(1).max(20).optional().default(5)
});

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const body = chatSchema.parse(req.body);
    const kbChatPrompt = await getModePrompt('kbChat');

    const chunks = await searchSimilar({
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

    const context = chunks.map((chunk, i) => 
      `[Source ${i + 1}: "${chunk.title}" - ${chunk.section || 'Main'}]\n${chunk.content}`
    ).join('\n\n---\n\n');

    const answer = await chat({
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
  } catch (error) {
    logger.error('RAG chat failed', error);
    
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
        code: 'RAG_FAILED',
        message: error instanceof Error ? error.message : 'RAG request failed'
      }
    });
  }
});

router.post('/index/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;

    const doc = await outlineClient.getDocument(documentId);
    const chunksCreated = await indexDocument({
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
  } catch (error) {
    logger.error('Document indexing failed', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INDEX_FAILED',
        message: error instanceof Error ? error.message : 'Failed to index document'
      }
    });
  }
});

router.post('/index-collection/:collectionId', async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;

    const documents = await outlineClient.getCollectionDocuments(collectionId);
    let documentsIndexed = 0;
    let chunksCreated = 0;

    for (const doc of documents) {
      try {
        const chunks = await indexDocument({
          documentId: doc.id,
          collectionId: doc.collectionId,
          title: doc.title,
          content: doc.text
        });
        documentsIndexed++;
        chunksCreated += chunks;
      } catch (error) {
        logger.error('Failed to index document in collection', { documentId: doc.id, error });
      }
    }

    res.json({
      success: true,
      collectionId,
      documentsIndexed,
      chunksCreated
    });
  } catch (error) {
    logger.error('Collection indexing failed', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INDEX_FAILED',
        message: error instanceof Error ? error.message : 'Failed to index collection'
      }
    });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const stats = await getIndexStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to get index status', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_FAILED',
        message: 'Failed to get index status'
      }
    });
  }
});

export default router;
