const fs = require('fs');
const path = require('path');
const secondBrain = require('./second-brain.cjs');
const openBrainEmbedder = require('./open-brain-embedder.cjs');
const openBrainRanker = require('./open-brain-ranker.cjs');
const { isPromotableOpenBrainArtifact } = require('./internal-normalizer.cjs');

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

function resolveCapabilities(options = {}) {
  const backendState = options.backendState || secondBrain.getBackendState();
  const embeddingProvider = options.embeddingProvider || openBrainEmbedder.getDefaultEmbeddingProvider();

  return {
    backendState,
    embeddingProvider,
    postgresAvailable:
      options.postgresAvailable ??
      (backendState.active_backend === 'postgres' && backendState.degraded === false),
    pgvectorAvailable: options.pgvectorAvailable ?? true,
  };
}

function checkAvailability(options = {}) {
  const { backendState, postgresAvailable, pgvectorAvailable, embeddingProvider } = resolveCapabilities(options);

  if (!postgresAvailable) {
    return makeUnavailable(
      'postgres_unavailable',
      'Open Brain storage unavailable; continuing without semantic recall.',
      {
        storage_ready: false,
        embedding_ready: false,
        schema: OPEN_BRAIN_SCHEMA,
        sidecar_only: true,
        execution_truth_owner: 'second_brain',
        backend_state: backendState,
      }
    );
  }

  if (!pgvectorAvailable) {
    return makeUnavailable(
      'pgvector_unavailable',
      'Open Brain vector storage unavailable; continuing without semantic recall.',
      {
        storage_ready: false,
        embedding_ready: false,
        schema: OPEN_BRAIN_SCHEMA,
        sidecar_only: true,
        execution_truth_owner: 'second_brain',
        backend_state: backendState,
      }
    );
  }

  const providerState = embeddingProvider?.getStatus?.() || null;
  if (providerState && providerState.available === false) {
    return makeUnavailable(
      'embedding_unavailable',
      providerState.detail || 'Open Brain embeddings unavailable; continuing without semantic recall.',
      {
        storage_ready: true,
        embedding_ready: false,
        embedding_provider: providerState,
        schema: OPEN_BRAIN_SCHEMA,
        sidecar_only: true,
        execution_truth_owner: 'second_brain',
        backend_state: backendState,
      }
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
    schema: OPEN_BRAIN_SCHEMA,
    sidecar_only: true,
    execution_truth_owner: 'second_brain',
    backend_state: backendState,
  };
}

function validateNormalizedArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    throw new TypeError('Open Brain ingestion requires a normalized artifact object.');
  }

  if (!isPromotableOpenBrainArtifact(artifact)) {
    throw new TypeError('Open Brain ingestion requires a promotable normalized artifact.');
  }

  return artifact;
}

function deriveTitle(artifact) {
  if (typeof artifact.title === 'string' && artifact.title.trim().length > 0) {
    return artifact.title.trim();
  }

  const basename = path.basename(artifact.source_uri || '', path.extname(artifact.source_uri || ''));
  return basename || 'Untitled memory';
}

function deriveBody(artifact) {
  return artifact.content_markdown.trim();
}

async function resolveEmbedding(artifact, options = {}) {
  const embeddingProvider = options.embeddingProvider || openBrainEmbedder.getDefaultEmbeddingProvider();
  if (!embeddingProvider || typeof embeddingProvider.embedText !== 'function') {
    return {
      available: false,
      vector: null,
      dimensions: null,
      provider: null,
    };
  }

  const input = `${deriveTitle(artifact)}\n\n${deriveBody(artifact)}`;
  return embeddingProvider.embedText(input);
}

function buildMemoryItem(artifact, options = {}, embeddingResult = null) {
  const now = new Date().toISOString();
  return {
    project_scope: options.project_scope || options.projectScope || 'global',
    memory_type: options.memory_type || options.memoryType || 'artifact_summary',
    title: deriveTitle(artifact),
    body_markdown: deriveBody(artifact),
    source_uri: artifact.source_uri,
    source_kind: artifact.type,
    status: options.status || 'promoted',
    importance_score: options.importance_score ?? options.importanceScore ?? 0.5,
    confidence_score: options.confidence_score ?? options.confidenceScore ?? 0.8,
    reuse_count: options.reuse_count ?? 0,
    last_recalled_at: options.last_recalled_at || null,
    created_at: artifact.normalized_at || now,
    updated_at: now,
    embedding: embeddingResult?.available ? embeddingResult.vector : null,
    embedding_metadata: embeddingResult
      ? {
          available: Boolean(embeddingResult.available),
          dimensions: embeddingResult.dimensions ?? null,
          provider: embeddingResult.provider ?? null,
        }
      : {
          available: false,
          dimensions: null,
          provider: null,
        },
    source_artifact_id: artifact.id || null,
    source_content_hash: artifact.content_hash || null,
    provenance: artifact.provenance || null,
  };
}

function getStorage(options = {}) {
  return options.storage || null;
}

function sanitizeMemory(memory) {
  const sanitized = { ...memory };
  delete sanitized.embedding;
  delete sanitized.embedding_metadata;
  delete sanitized.internal_row_id;
  return sanitized;
}

async function loadSearchCandidates(options = {}) {
  const storage = getStorage(options);
  if (!storage || typeof storage.searchMemories !== 'function') {
    throw new Error('Open Brain search requires a storage.searchMemories adapter.');
  }

  const found = await storage.searchMemories({
    query: options.query,
    project_scope: options.project_scope || options.projectScope || null,
    limit: options.limit ?? 5,
  });

  return Array.isArray(found) ? found : [];
}

function filterCandidates(candidates, options = {}) {
  const includeArchived = options.includeArchived === true;
  const includeSuperseded = options.includeSuperseded === true;

  return candidates.filter((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    if (!includeArchived && candidate.status === 'archived') return false;
    if (!includeSuperseded && candidate.superseded_by) return false;
    return true;
  });
}

async function ingestNormalizedArtifact(artifact, options = {}) {
  validateNormalizedArtifact(artifact);

  const storage = getStorage(options);
  if (!storage || typeof storage.writeMemory !== 'function') {
    throw new Error('Open Brain ingestion requires a storage.writeMemory adapter.');
  }

  const embedding = await resolveEmbedding(artifact, options);
  const memoryItem = buildMemoryItem(artifact, options, embedding);
  const savedMemory = await storage.writeMemory(memoryItem);
  const memory = savedMemory || memoryItem;
  const requestedLinks = Array.isArray(options.links) ? options.links : [];
  const savedLinks = [];

  if (requestedLinks.length > 0 && typeof storage.writeMemoryLink === 'function') {
    for (const link of requestedLinks) {
      const savedLink = await storage.writeMemoryLink({
        from_id: memory.id,
        to_id: link.to_id,
        relation_type: link.relation_type,
        score: link.score ?? null,
      });
      savedLinks.push(savedLink);
    }
  }

  return {
    available: true,
    degraded: false,
    blocked: false,
    memory,
    links: savedLinks,
  };
}

async function promoteMemoryCandidate(artifact, options = {}) {
  return ingestNormalizedArtifact(artifact, options);
}

async function searchOpenBrain(options = {}) {
  if (typeof options.query !== 'string' || options.query.trim().length === 0) {
    throw new TypeError('Open Brain search requires a non-empty query.');
  }

  const embedding = await resolveEmbedding(
    {
      title: options.query,
      content_markdown: options.query,
      source_uri: options.query,
    },
    options
  );

  const candidates = filterCandidates(await loadSearchCandidates(options), options);
  const ranked = openBrainRanker.rankOpenBrainCandidates(candidates, {
    queryEmbedding: embedding.available ? embedding.vector : null,
    projectScope: options.project_scope || options.projectScope || null,
    limit: options.limit ?? 5,
    now: options.now || Date.now(),
  });

  return {
    available: true,
    degraded: false,
    blocked: false,
    query: options.query,
    limit: options.limit ?? 5,
    total_candidates: candidates.length,
    selected: ranked.map((candidate) => sanitizeMemory(candidate)),
  };
}

async function recallForWorkflow(options = {}) {
  const result = await searchOpenBrain(options);
  const storage = getStorage(options);
  let recallEvent = null;

  if (storage && typeof storage.writeRecallEvent === 'function') {
    recallEvent = await storage.writeRecallEvent({
      workflow: options.workflow || null,
      phase: options.phase || null,
      plan: options.plan || null,
      query_text: options.query,
      retrieved_ids: result.selected.map((item) => item.id),
      selected_ids: result.selected.map((item) => item.id),
      outcome: null,
      created_at: new Date().toISOString(),
    });
  }

  return {
    ...result,
    recall_event: recallEvent,
  };
}

async function recordRecallOutcome(options = {}) {
  const storage = getStorage(options);
  if (!storage || typeof storage.updateRecallOutcome !== 'function') {
    throw new Error('Open Brain feedback requires a storage.updateRecallOutcome adapter.');
  }

  if (typeof options.recallEventId !== 'string' || options.recallEventId.trim().length === 0) {
    throw new TypeError('Open Brain feedback requires recallEventId.');
  }

  if (!['helpful', 'neutral', 'harmful', 'unused'].includes(options.outcome)) {
    throw new TypeError('Open Brain feedback requires a supported outcome.');
  }

  return storage.updateRecallOutcome({
    recallEventId: options.recallEventId,
    outcome: options.outcome,
    selected_ids: Array.isArray(options.selected_ids) ? options.selected_ids : undefined,
  });
}

module.exports = {
  OPEN_BRAIN_SCHEMA,
  REQUIRED_TABLES,
  buildMemoryItem,
  getBootstrapSql,
  getSchemaContract,
  checkAvailability,
  ingestNormalizedArtifact,
  promoteMemoryCandidate,
  recallForWorkflow,
  recordRecallOutcome,
  searchOpenBrain,
  sanitizeMemory,
  validateNormalizedArtifact,
};
