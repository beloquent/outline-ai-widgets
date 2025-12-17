import { query } from '../db/connection';
import { createEmbedding } from './openai';
import { splitIntoChunks } from './chunker';
import { logger } from '../config/logger';

interface DocumentChunk {
  id: number;
  documentId: string;
  collectionId: string | null;
  title: string;
  section: string | null;
  content: string;
  relevance?: number;
}

interface SearchResult extends DocumentChunk {
  url: string;
}

export async function indexDocument(options: {
  documentId: string;
  collectionId?: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
}): Promise<number> {
  await query('DELETE FROM ai_document_chunks WHERE document_id = $1', [options.documentId]);

  const chunks = splitIntoChunks(options.content, options.title);
  let chunksCreated = 0;

  for (const chunk of chunks) {
    try {
      const embedding = await createEmbedding(chunk.content);
      const embeddingStr = `[${embedding.join(',')}]`;

      await query(
        `INSERT INTO ai_document_chunks 
         (document_id, collection_id, title, section, content, metadata, embedding, indexed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW(), NOW())`,
        [
          options.documentId,
          options.collectionId || null,
          options.title,
          chunk.section,
          chunk.content,
          JSON.stringify(options.metadata || {}),
          embeddingStr
        ]
      );
      chunksCreated++;
    } catch (error) {
      logger.error('Failed to index chunk', { 
        documentId: options.documentId, 
        section: chunk.section, 
        error 
      });
    }
  }

  logger.info('Document indexed', { documentId: options.documentId, chunksCreated });
  return chunksCreated;
}

export async function searchSimilar(options: {
  query: string;
  collectionId?: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const embedding = await createEmbedding(options.query);
  const embeddingStr = `[${embedding.join(',')}]`;
  const limit = options.limit || 5;

  let sql = `
    SELECT 
      id, document_id, collection_id, title, section, content,
      1 - (embedding <=> $1::vector) as relevance
    FROM ai_document_chunks
    WHERE embedding IS NOT NULL
  `;
  const params: any[] = [embeddingStr];
  let paramIndex = 2;

  if (options.collectionId) {
    sql += ` AND collection_id = $${paramIndex}`;
    params.push(options.collectionId);
    paramIndex++;
  }

  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await query(sql, params);

  return result.rows.map((row: any) => ({
    id: row.id,
    documentId: row.document_id,
    collectionId: row.collection_id,
    title: row.title,
    section: row.section,
    content: row.content,
    relevance: parseFloat(row.relevance),
    url: `/doc/${row.document_id}`
  }));
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  await query('DELETE FROM ai_document_chunks WHERE document_id = $1', [documentId]);
}

export async function getIndexStats(): Promise<{
  totalDocuments: number;
  totalChunks: number;
  lastIndexed: string | null;
}> {
  const result = await query(`
    SELECT 
      COUNT(DISTINCT document_id) as total_documents,
      COUNT(*) as total_chunks,
      MAX(indexed_at) as last_indexed
    FROM ai_document_chunks
  `);

  const row = result.rows[0];
  return {
    totalDocuments: parseInt(row.total_documents, 10),
    totalChunks: parseInt(row.total_chunks, 10),
    lastIndexed: row.last_indexed
  };
}
