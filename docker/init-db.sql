-- PostgreSQL initialization script for Outline + Widget Framework
-- This runs automatically when the PostgreSQL container starts for the first time

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- AI Service Tables
-- Note: These are also created by the AI Service on startup with IF NOT EXISTS
-- Having them here ensures the schema is ready before the service starts

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
);

CREATE TABLE IF NOT EXISTS ai_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_workflow_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id VARCHAR(36) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_review',
    submitted_by VARCHAR(36) NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by VARCHAR(36)
);

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
);

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
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_chunks_document_id ON ai_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_collection_id ON ai_document_chunks(collection_id);

-- Note: ivfflat index for embeddings requires data to exist first
-- The AI Service will create this index after initial data is loaded
