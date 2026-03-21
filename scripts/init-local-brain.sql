-- Initialize gsd_local_brain schema for persistent relational memory

CREATE SCHEMA IF NOT EXISTS gsd_local_brain;

-- Table for tracking normalized context artifacts
CREATE TABLE IF NOT EXISTS gsd_local_brain.artifacts (
    id TEXT PRIMARY KEY,
    source_uri TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    normalized_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    type TEXT CHECK (type IN ('external', 'internal')),
    content_markdown TEXT
);

-- Table for tracking AST symbols extracted from artifacts
CREATE TABLE IF NOT EXISTS gsd_local_brain.symbols (
    id SERIAL PRIMARY KEY,
    artifact_id TEXT NOT NULL REFERENCES gsd_local_brain.artifacts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    line INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for tracking dependencies extracted from artifacts
CREATE TABLE IF NOT EXISTS gsd_local_brain.dependencies (
    id SERIAL PRIMARY KEY,
    artifact_id TEXT NOT NULL REFERENCES gsd_local_brain.artifacts(id) ON DELETE CASCADE,
    dependency_uri TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_symbols_artifact_id ON gsd_local_brain.symbols(artifact_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON gsd_local_brain.symbols(name);
CREATE INDEX IF NOT EXISTS idx_dependencies_artifact_id ON gsd_local_brain.dependencies(artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_source_uri ON gsd_local_brain.artifacts(source_uri);
