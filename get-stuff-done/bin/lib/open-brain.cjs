const fs = require('fs');
const path = require('path');

const OPEN_BRAIN_SCHEMA = 'gsd_open_brain';
const REQUIRED_TABLES = ['memory_item', 'memory_link', 'recall_event', 'consolidation_job'];
const SQL_PATH = path.resolve(__dirname, '..', '..', '..', 'scripts', 'init-open-brain.sql');

function getBootstrapSql() {
  return fs.readFileSync(SQL_PATH, 'utf8');
}

function getSchemaContract() {
  return {
    schema: OPEN_BRAIN_SCHEMA,
    required_tables: [...REQUIRED_TABLES],
    bootstrap_sql_path: SQL_PATH,
    requires: {
      postgres: true,
      pgvector: true,
    },
    sidecar_only: true,
    execution_truth_owner: 'second_brain',
  };
}

function makeUnavailable(reason, detail, extra = {}) {
  return {
    available: false,
    degraded: true,
    blocked: false,
    reason,
    detail,
    status: 'degraded',
    ...extra,
  };
}

function checkAvailability(options = {}) {
  const {
    postgresAvailable = true,
    pgvectorAvailable = true,
    embeddingProvider,
  } = options;

  if (!postgresAvailable) {
    return makeUnavailable(
      'postgres_unavailable',
      'Open Brain storage unavailable; continuing without semantic recall.',
      { storage_ready: false, embedding_ready: false }
    );
  }

  if (!pgvectorAvailable) {
    return makeUnavailable(
      'pgvector_unavailable',
      'Open Brain vector storage unavailable; continuing without semantic recall.',
      { storage_ready: false, embedding_ready: false }
    );
  }

  const providerState = embeddingProvider?.getStatus?.() || null;
  if (providerState && providerState.available === false) {
    return makeUnavailable(
      'embedding_unavailable',
      providerState.detail || 'Open Brain embeddings unavailable; continuing without semantic recall.',
      { storage_ready: true, embedding_ready: false, embedding_provider: providerState }
    );
  }

  return {
    available: true,
    degraded: false,
    blocked: false,
    reason: null,
    detail: 'Open Brain foundation is available.',
    status: 'ready',
    storage_ready: true,
    embedding_ready: true,
    embedding_provider: providerState,
  };
}

module.exports = {
  OPEN_BRAIN_SCHEMA,
  REQUIRED_TABLES,
  getBootstrapSql,
  getSchemaContract,
  checkAvailability,
};
