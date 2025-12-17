"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexDocument = indexDocument;
exports.searchSimilar = searchSimilar;
exports.deleteDocumentChunks = deleteDocumentChunks;
exports.getIndexStats = getIndexStats;
const connection_1 = require("../db/connection");
const openai_1 = require("./openai");
const chunker_1 = require("./chunker");
const logger_1 = require("../config/logger");
async function indexDocument(options) {
    await (0, connection_1.query)('DELETE FROM ai_document_chunks WHERE document_id = $1', [options.documentId]);
    const chunks = (0, chunker_1.splitIntoChunks)(options.content, options.title);
    let chunksCreated = 0;
    for (const chunk of chunks) {
        try {
            const embedding = await (0, openai_1.createEmbedding)(chunk.content);
            const embeddingStr = `[${embedding.join(',')}]`;
            await (0, connection_1.query)(`INSERT INTO ai_document_chunks 
         (document_id, collection_id, title, section, content, metadata, embedding, indexed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW(), NOW())`, [
                options.documentId,
                options.collectionId || null,
                options.title,
                chunk.section,
                chunk.content,
                JSON.stringify(options.metadata || {}),
                embeddingStr
            ]);
            chunksCreated++;
        }
        catch (error) {
            logger_1.logger.error('Failed to index chunk', {
                documentId: options.documentId,
                section: chunk.section,
                error
            });
        }
    }
    logger_1.logger.info('Document indexed', { documentId: options.documentId, chunksCreated });
    return chunksCreated;
}
async function searchSimilar(options) {
    const embedding = await (0, openai_1.createEmbedding)(options.query);
    const embeddingStr = `[${embedding.join(',')}]`;
    const limit = options.limit || 5;
    let sql = `
    SELECT 
      id, document_id, collection_id, title, section, content,
      1 - (embedding <=> $1::vector) as relevance
    FROM ai_document_chunks
    WHERE embedding IS NOT NULL
  `;
    const params = [embeddingStr];
    let paramIndex = 2;
    if (options.collectionId) {
        sql += ` AND collection_id = $${paramIndex}`;
        params.push(options.collectionId);
        paramIndex++;
    }
    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
    params.push(limit);
    const result = await (0, connection_1.query)(sql, params);
    return result.rows.map((row) => ({
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
async function deleteDocumentChunks(documentId) {
    await (0, connection_1.query)('DELETE FROM ai_document_chunks WHERE document_id = $1', [documentId]);
}
async function getIndexStats() {
    const result = await (0, connection_1.query)(`
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
//# sourceMappingURL=embeddings.js.map