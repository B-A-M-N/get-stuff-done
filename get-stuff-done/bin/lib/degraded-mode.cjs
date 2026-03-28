const fs = require('fs');
const path = require('path');
const http = require('http');
const { loadConfig } = require('./core.cjs');
const secondBrain = require('./second-brain.cjs');
const driftEngine = require('./drift-engine.cjs');
const { RECONCILIATION_PATH } = require('./drift-reconcile.cjs');

const DEGRADED_STATE_PATH = '.planning/health/latest-degraded-state.json';
const DEFAULT_STALE_MS = 60 * 60 * 1000;

const SEVERITY_ORDER = {
  HEALTHY: 1,
  DEGRADED: 2,
  UNSAFE: 3,
};

const WORKFLOW_DEPENDENCIES = {
  'context:plan-phase': ['model_facing_memory', 'planning_server', 'drift_truth', 'reconciliation_truth'],
  'context:execute-plan': ['model_facing_memory', 'planning_server', 'drift_truth', 'reconciliation_truth'],
  'verify:integrity': ['drift_truth', 'reconciliation_truth'],
  'verify:workflow-readiness': ['drift_truth', 'reconciliation_truth'],
};

function normalizePolicyState(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'HEALTHY' || raw === 'OK' || raw === 'READY') return 'HEALTHY';
  if (
    raw === 'DEGRADED'
    || raw === 'WARNING'
    || raw === 'DISCONNECTED'
    || raw === 'DISCONNECTED-BUT-NONCRITICAL'
    || raw === 'HEALTHY_WITH_WARNINGS'
    || raw === 'STALE'
    || raw === 'MISSING'
  ) {
    return 'DEGRADED';
  }
  if (
    raw === 'UNSAFE'
    || raw === 'UNHEALTHY'
    || raw === 'BLOCKED'
    || raw === 'ERROR'
    || raw === 'FAILED'
    || raw === 'UNAVAILABLE'
    || raw === 'UNAVAILABLE-CRITICAL'
  ) {
    return 'UNSAFE';
  }
  return 'DEGRADED';
}

function maxState(a, b) {
  return SEVERITY_ORDER[normalizePolicyState(a)] >= SEVERITY_ORDER[normalizePolicyState(b)]
    ? normalizePolicyState(a)
    : normalizePolicyState(b);
}

function loadPendingGateKeys(cwd) {
  const gatesDir = path.join(cwd, '.planning', 'gates');
  if (!fs.existsSync(gatesDir)) return [];
  return fs.readdirSync(gatesDir)
    .filter((file) => file.endsWith('-pending.json'))
    .map((file) => file.replace('-pending.json', '').replace(/_/g, '.'));
}

function readReconciliationState(cwd, options = {}) {
  const targetPath = path.join(cwd, RECONCILIATION_PATH);
  if (!fs.existsSync(targetPath)) {
    return {
      status: 'missing',
      path: RECONCILIATION_PATH,
      detail: 'No reconciliation artifact has been generated yet.',
      artifact: null,
    };
  }

  const artifact = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const timestamp = Date.parse(artifact.timestamp || '');
  const ageMs = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
  const staleAfterMs = options.staleAfterMs || DEFAULT_STALE_MS;
  if (!Number.isFinite(timestamp) || ageMs > staleAfterMs) {
    return {
      status: 'stale',
      path: RECONCILIATION_PATH,
      detail: 'Reconciliation artifact is stale and should be refreshed with `drift reconcile`.',
      age_ms: Number.isFinite(ageMs) ? ageMs : null,
      artifact,
    };
  }

  return {
    status: 'fresh',
    path: RECONCILIATION_PATH,
    detail: null,
    age_ms: ageMs,
    artifact,
  };
}

function inferModelFacingMemoryState(backend = {}) {
  if (backend.active_backend === 'postgres' && !backend.degraded) {
    return {
      canonical_state: 'HEALTHY',
      reason: 'canonical_postgres_memory_available',
      detail: null,
    };
  }

  return {
    canonical_state: 'UNSAFE',
    reason: 'canonical_postgres_memory_unavailable',
    detail: 'Canonical Postgres-backed model-facing memory is unavailable for truth-bearing workflows.',
  };
}

async function resolveCanonicalBackendState(providedBackend) {
  const backend = providedBackend || secondBrain.getBackendState();
  if (backend.active_backend !== 'postgres' || backend.degraded) {
    return backend;
  }

  try {
    const client = await secondBrain.pool.connect();
    client.release();
  } catch (err) {
    secondBrain.transitionToDegraded(secondBrain.classifyPostgresFailure(err), {
      message: err.message,
      source: 'degraded_mode_probe',
    });
  }

  return secondBrain.getBackendState();
}

function inferFreshnessState(sourceState, subject) {
  if (sourceState.status === 'fresh' || sourceState.status === 'ok') {
    return {
      canonical_state: 'HEALTHY',
      reason: `${subject}_fresh`,
      detail: null,
      age_ms: sourceState.age_ms || 0,
      path: sourceState.path,
    };
  }

  if (sourceState.status === 'stale') {
    return {
      canonical_state: 'UNSAFE',
      reason: `${subject}_stale`,
      detail: sourceState.detail,
      age_ms: sourceState.age_ms || null,
      path: sourceState.path,
    };
  }

  return {
    canonical_state: 'UNSAFE',
    reason: `${subject}_missing`,
    detail: sourceState.detail,
    age_ms: null,
    path: sourceState.path,
  };
}

function inferPlanningHealthState({ configOk, pendingGateKeys, planningFilesOk, planningServerStatus, diagnosticOnly }) {
  let state = 'HEALTHY';
  let reason = 'planning_truth_ready';
  let detail = null;

  if (!planningFilesOk) {
    state = 'DEGRADED';
    reason = 'planning_files_missing';
    detail = 'One or more required planning files are missing.';
  }
  if (!configOk) {
    state = maxState(state, 'DEGRADED');
    if (reason === 'planning_truth_ready') reason = 'config_degraded';
    if (!detail) detail = 'config.json is unreadable; defaults are active.';
  }
  if (pendingGateKeys.length > 0) {
    state = maxState(state, 'DEGRADED');
    if (reason === 'planning_truth_ready') reason = 'pending_gates';
    if (!detail) detail = 'Human gate acknowledgment is pending.';
  }
  if (normalizePolicyState(planningServerStatus) === 'UNSAFE') {
    state = diagnosticOnly ? 'DEGRADED' : 'UNSAFE';
    reason = 'planning_server_unavailable';
    detail = 'Planning Server is unavailable for truth-bearing workflows.';
  }

  return {
    canonical_state: state,
    reason,
    detail,
  };
}

async function probePlanningServer(options = {}) {
  if (options.planningServer && options.planningServer.status) {
    return options.planningServer;
  }

  const port = options.planningPort || process.env.GSD_PLANNING_PORT || 3011;
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/health',
      method: 'GET',
      timeout: 1000,
    }, (res) => {
      if (res.statusCode === 200) {
        resolve({ status: 'ok', detail: null });
      } else {
        resolve({ status: 'error', detail: `status ${res.statusCode}` });
      }
    });
    req.on('error', (err) => resolve({ status: 'error', detail: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'error', detail: 'timeout' });
    });
    req.end();
  });
}

function buildWorkflowMappings(subsystems) {
  const blocked = [];
  const warnings = [];

  for (const [workflow, dependencyKeys] of Object.entries(WORKFLOW_DEPENDENCIES)) {
    const failing = dependencyKeys
      .map((key) => ({ key, ...subsystems[key] }))
      .find((item) => item && item.canonical_state === 'UNSAFE');

    if (failing) {
      blocked.push({
        workflow,
        subsystem: failing.key,
        canonical_state: failing.canonical_state,
        reason: failing.reason,
        implications: [
          'Current truth posture cannot be treated as trustworthy for this workflow.',
          'Continuing would require fallback or optimistic inference.',
        ],
        next_options: [
          'Run diagnostic health surfaces to inspect the unsafe dependency.',
          'Restore the canonical dependency or refresh drift/reconciliation truth.',
        ],
      });
      continue;
    }

    const degraded = dependencyKeys
      .map((key) => ({ key, ...subsystems[key] }))
      .find((item) => item && item.canonical_state === 'DEGRADED');
    if (degraded) {
      warnings.push({
        workflow,
        subsystem: degraded.key,
        canonical_state: degraded.canonical_state,
        reason: degraded.reason,
      });
    }
  }

  return { blocked, warnings };
}

async function buildDegradedState(cwd, options = {}) {
  const config = loadConfig(cwd);
  const pendingGateKeys = loadPendingGateKeys(cwd);
  const requiredPlanningFiles = [
    '.planning/STATE.md',
    '.planning/ROADMAP.md',
    '.planning/PROJECT.md',
  ];
  const missingPlanningFiles = requiredPlanningFiles.filter((file) => !fs.existsSync(path.join(cwd, file)));
  const warnings = [];
  const fallbacks = [];

  if (config._load_error) {
    warnings.push(`config.json unreadable: ${config._load_error}`);
    fallbacks.push('All config values are defaults (mode=interactive, all gates=on)');
  }
  for (const file of missingPlanningFiles) {
    warnings.push(`${path.basename(file)} not found — project may not be initialized`);
    fallbacks.push(`${path.basename(file)} missing: workflows that depend on it will fail`);
  }
  for (const key of pendingGateKeys) {
    warnings.push(`Gate pending: ${key} — human acknowledgment required before continuing`);
  }

  const backend = await resolveCanonicalBackendState(options.backendState);
  const liveHealth = options.liveHealth || {};
  const driftState = options.driftState || driftEngine.getLatestReportState(cwd, options);
  const reconciliationState = options.reconciliationState || readReconciliationState(cwd, options);
  const planningServer = liveHealth.planningServer || await probePlanningServer(options);

  const subsystems = {
    model_facing_memory: inferModelFacingMemoryState(backend),
    planning_server: {
      canonical_state: normalizePolicyState(planningServer.status),
      reason: planningServer.status === 'ok' ? 'planning_server_ok' : 'planning_server_unavailable',
      detail: planningServer.detail || null,
    },
    drift_truth: inferFreshnessState(driftState, 'drift_truth'),
    reconciliation_truth: inferFreshnessState(reconciliationState, 'reconciliation_truth'),
    planning_truth: inferPlanningHealthState({
      configOk: !config._load_error,
      pendingGateKeys,
      planningFilesOk: missingPlanningFiles.length === 0,
      planningServerStatus: planningServer.status,
      diagnosticOnly: Boolean(options.diagnosticOnly),
    }),
  };

  let aggregateState = 'HEALTHY';
  for (const subsystem of Object.values(subsystems)) {
    aggregateState = maxState(aggregateState, subsystem.canonical_state);
  }

  const workflowMappings = buildWorkflowMappings(subsystems);
  return {
    schema: 'gsd_degraded_state',
    generated_at: options.now || new Date().toISOString(),
    stale_after_ms: options.staleAfterMs || DEFAULT_STALE_MS,
    aggregate_state: aggregateState,
    degraded: aggregateState !== 'HEALTHY',
    config_ok: !config._load_error,
    warnings,
    fallbacks,
    gate_pending_keys: pendingGateKeys,
    blocked_workflows: workflowMappings.blocked,
    warning_workflows: workflowMappings.warnings,
    subsystems,
    sources: {
      drift_report: driftState.path || driftEngine.REPORT_PATH,
      reconciliation_report: reconciliationState.path || RECONCILIATION_PATH,
    },
  };
}

function writeLatestDegradedState(cwd, snapshot) {
  const targetPath = path.join(cwd, DEGRADED_STATE_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  return {
    path: DEGRADED_STATE_PATH,
    snapshot,
  };
}

function readLatestDegradedState(cwd) {
  const targetPath = path.join(cwd, DEGRADED_STATE_PATH);
  if (!fs.existsSync(targetPath)) return null;
  return JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
}

function evaluateWorkflow(snapshot, workflow) {
  const blocked = (snapshot.blocked_workflows || []).find((entry) => entry.workflow === workflow);
  if (blocked) {
    return {
      allowed: false,
      workflow,
      subsystem: blocked.subsystem,
      canonical_state: blocked.canonical_state,
      reason: blocked.reason,
      implications: blocked.implications,
      next_options: blocked.next_options,
      aggregate_state: snapshot.aggregate_state,
    };
  }

  const warning = (snapshot.warning_workflows || []).find((entry) => entry.workflow === workflow);
  return {
    allowed: true,
    workflow,
    canonical_state: warning ? warning.canonical_state : snapshot.aggregate_state,
    aggregate_state: snapshot.aggregate_state,
    warning: warning || null,
  };
}

module.exports = {
  DEGRADED_STATE_PATH,
  DEFAULT_STALE_MS,
  buildDegradedState,
  evaluateWorkflow,
  normalizePolicyState,
  readLatestDegradedState,
  readReconciliationState,
  resolveCanonicalBackendState,
  writeLatestDegradedState,
};
