import { Pool, PoolConfig } from 'pg';
import { config } from '../config/settings';
import { logger } from '../config/logger';

function buildPoolConfig(): PoolConfig {
  const base: PoolConfig = {
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  if (!config.databaseUrl) {
    return base;
  }

  // Parse DATABASE_URL explicitly to handle special characters in passwords
  // that break pg's internal connection string parser
  try {
    const url = new URL(config.databaseUrl);
    return {
      ...base,
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      database: url.pathname.slice(1),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : undefined,
    };
  } catch {
    // Fallback to connectionString if URL parsing fails
    return { ...base, connectionString: config.databaseUrl };
  }
}

export const pool = new Pool(buildPoolConfig());

pool.on('error', (err: Error) => {
  logger.error('Unexpected database pool error:', err);
});

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    logger.info('uuid-ossp extension enabled');
    
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    logger.info('pgvector extension enabled');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_document_chunks (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(36) NOT NULL,
        collection_id VARCHAR(36),
        title VARCHAR(500) NOT NULL,
        section VARCHAR(500),
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        embedding vector(1536),
        indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_workflow_instances (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id VARCHAR(36) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending_review',
        submitted_by VARCHAR(36) NOT NULL,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        completed_by VARCHAR(36)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_workflow_tasks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        instance_id UUID REFERENCES ai_workflow_instances(id) ON DELETE CASCADE,
        step_key VARCHAR(50) NOT NULL,
        assignee_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        due_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        decision VARCHAR(20),
        reason TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_indexing_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        collections JSONB DEFAULT '[]',
        documents_queued INTEGER DEFAULT 0,
        documents_indexed INTEGER DEFAULT 0,
        chunks_created INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        error TEXT
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_chunks_document_id ON ai_document_chunks(document_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_chunks_collection_id ON ai_document_chunks(collection_id)
    `);

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding 
        ON ai_document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
      `);
    } catch (e) {
      logger.warn('Could not create ivfflat index (may need more data first)');
    }

    logger.info('Database tables initialized');
  } finally {
    client.release();
  }
}

export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
  return result;
}
