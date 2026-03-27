const fs = require('fs');
const path = require('path');
const secondBrain = require('./second-brain.cjs');
const openBrainEmbedder = require('./open-brain-embedder.cjs');
const openBrainRanker = require('./open-brain-ranker.cjs');
const { isPromotableOpenBrainArtifact } = require('./internal-normalizer.cjs');

const OPEN_BRAIN_SCHEMA = 'gsd_open_brain';
const REQUIRED_TABLES = ['memory_item', 'memory_link', 'recall_event', 'consolidation_job'];
const SQL_PATH = path.resolve(__dirname, '..', '..', '..', 'scripts', 'init-open-brain.sql');
const RECALL_TRACK_DIR = path.join('.planning', 'open-brain');

function getBootstrapSql() {
  return fs.readFileSync(SQL_PATH, 'utf8');
}

async function ensureOpenBrainStorage() {
  secondBrain.requirePostgres('Open Brain storage');
  if (typeof secondBrain._ensureInitialized === 'function') {
    await secondBrain._ensureInitialized();
  }
  await secondBrain.pool.query(getBootstrapSql());
  return secondBrain.pool;
}

function toPgVector(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return `[${value.map((entry) => Number(entry) || 0).join(',')}]`;
}

function normalizeMemoryIds(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));
}

function getRecallTrackingPath(options = {}) {
  const cwd = options.cwd || process.cwd();
  const workflow = String(options.workflow || 'workflow');
  const phase = options.phase == null ? 'none' : String(options.phase);
  const plan = options.plan == null ? 'none' : String(options.plan);
  return path.join(cwd, RECALL_TRACK_DIR, `${workflow}-${phase}-${plan}.json`);
}

function trackWorkflowRecallEvent(options = {}) {
  const recallEventId = options.recallEventId || options.recallEvent?.id;
  if (!recallEventId || !options.cwd) {
    return null;
  }

  const trackingPath = getRecallTrackingPath(options);
  fs.mkdirSync(path.dirname(trackingPath), { recursive: true });
  const payload = {
    workflow: options.workflow || null,
    phase: options.phase || null,
    plan: options.plan || null,
    query: options.query || null,
    recall_event_id: String(recallEventId),
    selected_ids: normalizeMemoryIds(options.selected_ids || options.selected?.map((item) => item.id)),
    source_ref: options.source_ref || null,
    outcome: options.outcome || null,
    tracked_at: new Date().toISOString(),
  };
  fs.writeFileSync(trackingPath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function readTrackedWorkflowRecallEvent(options = {}) {
  const trackingPath = getRecallTrackingPath(options);
  if (!fs.existsSync(trackingPath)) return null;
  return JSON.parse(fs.readFileSync(trackingPath, 'utf8'));
}

async function createStorageAdapter() {
  const pool = await ensureOpenBrainStorage();
  return {
    async writeMemory(memoryItem) {
      const result = await pool.query(
        `INSERT INTO ${OPEN_BRAIN_SCHEMA}.memory_item
           (project_scope, memory_type, title, body_markdown, source_uri, source_kind, embedding,
            importance_score, confidence_score, reuse_count, last_recalled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id::text AS id, project_scope, memory_type, title, body_markdown, source_uri, source_kind,
                   importance_score, confidence_score, reuse_count, last_recalled_at, superseded_by, status,
                   created_at, updated_at`,
        [
          memoryItem.project_scope || null,
          memoryItem.memory_type,
          memoryItem.title,
          memoryItem.body_markdown,
          memoryItem.source_uri || null,
          memoryItem.source_kind || null,
          toPgVector(memoryItem.embedding),
          memoryItem.importance_score ?? 0,
          memoryItem.confidence_score ?? 0,
          memoryItem.reuse_count ?? 0,
          memoryItem.last_recalled_at || null,
          memoryItem.status || 'promoted',
          memoryItem.created_at || new Date().toISOString(),
          memoryItem.updated_at || new Date().toISOString(),
        ]
      );
      return result.rows[0] || null;
    },

    async writeMemoryLink(link) {
      const result = await pool.query(
        `INSERT INTO ${OPEN_BRAIN_SCHEMA}.memory_link (from_id, to_id, relation_type, score)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text AS id, from_id::text AS from_id, to_id::text AS to_id, relation_type, score, created_at`,
        [link.from_id, link.to_id, link.relation_type, link.score ?? 0]
      );
      return result.rows[0] || null;
    },

    async searchMemories(options = {}) {
      const limit = Number.isFinite(Number(options.limit)) ? Math.max(Number(options.limit), 1) : 5;
      const result = await pool.query(
        `SELECT
           mi.id::text AS id,
           mi.project_scope,
           mi.memory_type,
           mi.title,
           mi.body_markdown,
           mi.source_uri,
           mi.source_kind,
           mi.embedding::text AS embedding_text,
           mi.importance_score,
           mi.confidence_score,
           mi.reuse_count,
           mi.last_recalled_at,
           mi.superseded_by::text AS superseded_by,
           mi.status,
           mi.created_at,
           mi.updated_at,
           COALESCE(helpful.helpful_count, 0) AS helpful_count,
           COALESCE(harmful.harmful_count, 0) AS harmful_count
         FROM ${OPEN_BRAIN_SCHEMA}.memory_item mi
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS helpful_count
           FROM ${OPEN_BRAIN_SCHEMA}.recall_event re
           WHERE re.outcome = 'helpful' AND re.selected_ids ? (mi.id::text)
         ) helpful ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS harmful_count
           FROM ${OPEN_BRAIN_SCHEMA}.recall_event re
           WHERE re.outcome = 'harmful' AND re.selected_ids ? (mi.id::text)
         ) harmful ON true
         ORDER BY mi.updated_at DESC
         LIMIT $1`,
        [Math.max(limit * 5, 10)]
      );

      return result.rows.map((row) => ({
        ...row,
        embedding: row.embedding_text
          ? row.embedding_text.replace(/^\[|\]$/g, '').split(',').filter(Boolean).map((value) => Number(value))
          : null,
      }));
    },

    async writeRecallEvent(event) {
      const retrievedIds = normalizeMemoryIds(event.retrieved_ids);
      const selectedIds = normalizeMemoryIds(event.selected_ids);
      const result = await pool.query(
        `INSERT INTO ${OPEN_BRAIN_SCHEMA}.recall_event
           (workflow, phase, plan, query_text, retrieved_ids, selected_ids, outcome, feedback_score, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
         RETURNING id::text AS id, workflow, phase, plan, query_text, retrieved_ids, selected_ids, outcome, feedback_score, created_at`,
        [
          event.workflow || null,
          event.phase || null,
          event.plan || null,
          event.query_text,
          JSON.stringify(retrievedIds),
          JSON.stringify(selectedIds),
          event.outcome || null,
          event.feedback_score ?? null,
          event.created_at || new Date().toISOString(),
        ]
      );
      return result.rows[0] || null;
    },

    async updateRecallOutcome({ recallEventId, outcome, selected_ids }) {
      const normalizedSelectedIds = normalizeMemoryIds(selected_ids);
      const feedbackScore = outcome === 'helpful' ? 1 : outcome === 'harmful' ? -1 : 0;
      const result = await pool.query(
        `UPDATE ${OPEN_BRAIN_SCHEMA}.recall_event
         SET outcome = $2,
             feedback_score = $3,
             selected_ids = CASE
               WHEN $4::jsonb = '[]'::jsonb THEN selected_ids
               ELSE $4::jsonb
             END
         WHERE id = $1::bigint
         RETURNING id::text AS id, workflow, phase, plan, query_text, retrieved_ids, selected_ids, outcome, feedback_score, created_at`,
        [
          String(recallEventId),
          outcome,
          feedbackScore,
          JSON.stringify(normalizedSelectedIds),
        ]
      );
      return result.rows[0] || null;
    },
  };
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
  const storage = getStorage(options) || await createStorageAdapter();
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

  const storage = getStorage(options) || await createStorageAdapter();
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
  const storage = getStorage(options) || await createStorageAdapter();
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
  const storage = getStorage(options) || await createStorageAdapter();
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

async function recordWorkflowRecallOutcome(options = {}) {
  const tracked = options.recallEventId
    ? null
    : readTrackedWorkflowRecallEvent(options);
  const recallEventId = options.recallEventId || tracked?.recall_event_id;

  if (!recallEventId) {
    return {
      available: false,
      blocked: false,
      reason: 'no_recall_event',
      message: 'No tracked Open Brain recall event found for this workflow lifecycle.',
    };
  }

  const selectedIds = Array.isArray(options.selected_ids) && options.selected_ids.length > 0
    ? options.selected_ids
    : tracked?.selected_ids;
  const result = await recordRecallOutcome({
    ...options,
    recallEventId,
    selected_ids: selectedIds,
  });

  if (options.cwd) {
    trackWorkflowRecallEvent({
      ...options,
      recallEventId,
      selected_ids: selectedIds,
      outcome: options.outcome,
      source_ref: options.source_ref || tracked?.source_ref || null,
    });
  }

  return {
    available: true,
    blocked: false,
    recall_event: result,
  };
}

module.exports = {
  OPEN_BRAIN_SCHEMA,
  REQUIRED_TABLES,
  buildMemoryItem,
  getBootstrapSql,
  getSchemaContract,
  checkAvailability,
  createStorageAdapter,
  ingestNormalizedArtifact,
  promoteMemoryCandidate,
  recallForWorkflow,
  recordRecallOutcome,
  recordWorkflowRecallOutcome,
  searchOpenBrain,
  sanitizeMemory,
  trackWorkflowRecallEvent,
  readTrackedWorkflowRecallEvent,
  validateNormalizedArtifact,
};
