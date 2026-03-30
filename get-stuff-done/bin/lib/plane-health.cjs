const secondBrain = require('./second-brain.cjs');

const runtimeState = new Map();

const DEFAULT_BREAKER = {
  failureThreshold: 3,
  cooldownMs: 5 * 60 * 1000,
  windowMs: 10 * 60 * 1000,
};

function getPlaneConfig() {
  return {
    api_url: process.env.PLANE_API_URL || 'http://localhost:3003',
    api_key_configured: Boolean(process.env.PLANE_API_KEY),
    project_id_configured: Boolean(process.env.PLANE_PROJECT_ID),
    webhook_token_configured: Boolean(process.env.PLANE_WEBHOOK_TOKEN || process.env.PLANNING_SERVER_TOKEN),
  };
}

function getRuntimeKey(config = getPlaneConfig()) {
  return `${config.api_url}|${process.env.PLANE_PROJECT_ID || ''}`;
}

function getRuntimeEntry(config = getPlaneConfig()) {
  const key = getRuntimeKey(config);
  if (!runtimeState.has(key)) {
    runtimeState.set(key, {
      last_result_at: null,
      last_success_at: null,
      last_error_at: null,
      last_action: null,
      last_status: null,
      recent_results: [],
    });
  }
  return runtimeState.get(key);
}

function trimRuntimeWindow(entry, nowMs, windowMs = DEFAULT_BREAKER.windowMs) {
  entry.recent_results = entry.recent_results.filter((item) => (nowMs - item.timestamp_ms) <= windowMs);
}

function recordPlaneResult(result = {}) {
  const config = getPlaneConfig();
  const entry = getRuntimeEntry(config);
  const nowMs = result.timestamp_ms || Date.now();
  const status = result.status || 'unknown';

  entry.last_result_at = new Date(nowMs).toISOString();
  entry.last_action = result.action || null;
  entry.last_status = status;

  if (status === 'success') {
    entry.last_success_at = new Date(nowMs).toISOString();
  }
  if (status === 'error' || status === 'blocked') {
    entry.last_error_at = new Date(nowMs).toISOString();
  }

  entry.recent_results.push({
    timestamp_ms: nowMs,
    action: result.action || null,
    status,
  });
  trimRuntimeWindow(entry, nowMs);

  return entry;
}

function computeBreakerState(summary = {}, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const failureThreshold = options.failureThreshold || DEFAULT_BREAKER.failureThreshold;
  const cooldownMs = options.cooldownMs || DEFAULT_BREAKER.cooldownMs;
  const consecutiveErrors = summary?.breaker_basis?.consecutive_errors || 0;
  const lastErrorAt = summary?.breaker_basis?.last_error_at || null;
  const lastSuccessAt = summary?.breaker_basis?.last_success_at || null;

  if (consecutiveErrors < failureThreshold) {
    return {
      state: 'closed',
      reason: null,
      consecutive_errors: consecutiveErrors,
      cooldown_remaining_ms: 0,
    };
  }

  const lastErrorMs = lastErrorAt ? Date.parse(lastErrorAt) : 0;
  const lastSuccessMs = lastSuccessAt ? Date.parse(lastSuccessAt) : 0;
  if (lastSuccessMs > lastErrorMs) {
    return {
      state: 'closed',
      reason: null,
      consecutive_errors: 0,
      cooldown_remaining_ms: 0,
    };
  }

  const elapsed = lastErrorMs ? nowMs - lastErrorMs : cooldownMs;
  if (elapsed >= cooldownMs) {
    return {
      state: 'half-open',
      reason: 'cooldown_elapsed',
      consecutive_errors: consecutiveErrors,
      cooldown_remaining_ms: 0,
    };
  }

  return {
    state: 'open',
    reason: 'recent_consecutive_failures',
    consecutive_errors: consecutiveErrors,
    cooldown_remaining_ms: Math.max(0, cooldownMs - elapsed),
  };
}

async function getPlaneStatus() {
  const config = getPlaneConfig();
  const summary = await secondBrain.getPlaneHealthSummary();
  const breaker = computeBreakerState(summary);
  const runtime = getRuntimeEntry(config);

  return {
    generated_at: new Date().toISOString(),
    configured: config.api_key_configured && config.project_id_configured,
    config,
    breaker_state: breaker.state,
    breaker_reason: breaker.reason,
    cooldown_remaining_ms: breaker.cooldown_remaining_ms,
    recent_outbound_total: summary.recent_outbound_total || 0,
    recent_outbound_errors: summary.recent_outbound_errors || 0,
    recent_error_rate: summary.recent_error_rate || 0,
    last_webhook_received_at: summary.last_webhook_received_at || null,
    top_failing_actions: summary.top_failing_actions || [],
    latency_by_action: summary.latency_by_action || [],
    breaker_basis: summary.breaker_basis || {
      consecutive_errors: 0,
      last_error_at: null,
      last_success_at: null,
    },
    runtime,
  };
}

async function shouldAllowPlaneRequest() {
  const status = await getPlaneStatus();
  return {
    allowed: status.breaker_state !== 'open',
    breaker_state: status.breaker_state,
    reason: status.breaker_reason,
    cooldown_remaining_ms: status.cooldown_remaining_ms,
  };
}

function resetRuntimeState() {
  runtimeState.clear();
}

module.exports = {
  DEFAULT_BREAKER,
  computeBreakerState,
  getPlaneConfig,
  getPlaneStatus,
  recordPlaneResult,
  resetRuntimeState,
  shouldAllowPlaneRequest,
};
