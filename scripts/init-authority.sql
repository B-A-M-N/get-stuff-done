-- Initialize authority schema for synthesis artifact persistence

CREATE SCHEMA IF NOT EXISTS authority;

-- Table for storing synthesized artifacts with full provenance
CREATE TABLE IF NOT EXISTS authority.synthesis_artifacts (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  content TEXT NOT NULL,
  atom_ids_used JSONB NOT NULL DEFAULT '[]',
  synthesis_citations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table for storing individual sections of synthesized artifacts
CREATE TABLE IF NOT EXISTS authority.synthesis_sections (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES authority.synthesis_artifacts(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  section_content TEXT NOT NULL,
  atom_ids_used JSONB NOT NULL DEFAULT '[]',
  synthesis_citations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_synthesis_artifacts_mission
  ON authority.synthesis_artifacts(mission_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_artifacts_created
  ON authority.synthesis_artifacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_synthesis_sections_mission
  ON authority.synthesis_sections(mission_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_sections_artifact
  ON authority.synthesis_sections(artifact_id);
