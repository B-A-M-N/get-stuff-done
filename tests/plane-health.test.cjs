const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const PLANE_HEALTH_PATH = '../get-stuff-done/bin/lib/plane-health.cjs';
const SECOND_BRAIN_PATH = '../get-stuff-done/bin/lib/second-brain.cjs';
const PLANE_WEBHOOK_SYNC_PATH = '../get-stuff-done/bin/lib/plane-webhook-sync.cjs';
const GSD_TOOLS_PATH = '../get-stuff-done/bin/gsd-tools.cjs';

function clearCaches() {
  delete require.cache[require.resolve(PLANE_HEALTH_PATH)];
  delete require.cache[require.resolve(SECOND_BRAIN_PATH)];
  delete require.cache[require.resolve(PLANE_WEBHOOK_SYNC_PATH)];
  delete require.cache[require.resolve(GSD_TOOLS_PATH)];
}

describe('plane-health', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = {
      PLANE_API_URL: process.env.PLANE_API_URL,
      PLANE_API_KEY: process.env.PLANE_API_KEY,
      PLANE_PROJECT_ID: process.env.PLANE_PROJECT_ID,
      PLANE_WEBHOOK_TOKEN: process.env.PLANE_WEBHOOK_TOKEN,
      PLANNING_SERVER_TOKEN: process.env.PLANNING_SERVER_TOKEN,
    };
    clearCaches();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearCaches();
  });

  test('computeBreakerState opens on recent consecutive failures and half-opens after cooldown', () => {
    const planeHealth = require(PLANE_HEALTH_PATH);
    const nowMs = Date.now();
    const summary = {
      breaker_basis: {
        consecutive_errors: 3,
        last_error_at: new Date(nowMs - 60 * 1000).toISOString(),
        last_success_at: null,
      },
    };

    const openState = planeHealth.computeBreakerState(summary, { nowMs });
    assert.strictEqual(openState.state, 'open');

    const halfOpenState = planeHealth.computeBreakerState(summary, {
      nowMs: nowMs + planeHealth.DEFAULT_BREAKER.cooldownMs + 1000,
    });
    assert.strictEqual(halfOpenState.state, 'half-open');
  });

  test('getPlaneStatus reports config, webhook freshness, and recent error shape', async () => {
    process.env.PLANE_API_URL = 'http://plane.local';
    process.env.PLANE_API_KEY = 'key';
    process.env.PLANE_PROJECT_ID = 'proj';
    process.env.PLANE_WEBHOOK_TOKEN = 'secret';
    const nowMs = Date.parse('2026-03-27T00:12:00.000Z');
    const originalNow = Date.now;
    Date.now = () => nowMs;

    try {
      const secondBrain = require(SECOND_BRAIN_PATH);
      secondBrain.getPlaneHealthSummary = async () => ({
        recent_outbound_total: 4,
        recent_outbound_errors: 3,
        recent_error_rate: 0.75,
        last_webhook_received_at: '2026-03-27T00:00:00.000Z',
        top_failing_actions: [{ action: 'plane-update-project', errors: 2, total: 2 }],
        latency_by_action: [{ action: 'plane-update-project', avg_latency: 42 }],
        breaker_basis: {
          consecutive_errors: 3,
          last_error_at: '2026-03-27T00:10:00.000Z',
          last_success_at: '2026-03-26T23:00:00.000Z',
        },
      });

      const planeHealth = require(PLANE_HEALTH_PATH);
      const status = await planeHealth.getPlaneStatus();
      assert.strictEqual(status.config.api_key_configured, true);
      assert.strictEqual(status.config.project_id_configured, true);
      assert.strictEqual(status.last_webhook_received_at, '2026-03-27T00:00:00.000Z');
      assert.strictEqual(status.recent_outbound_total, 4);
      assert.strictEqual(status.breaker_state, 'open');
    } finally {
      Date.now = originalNow;
    }
  });

  test('shouldAllowPlaneRequest closes after success is newer than error', async () => {
    const secondBrain = require(SECOND_BRAIN_PATH);
    secondBrain.getPlaneHealthSummary = async () => ({
      breaker_basis: {
        consecutive_errors: 3,
        last_error_at: '2026-03-27T00:10:00.000Z',
        last_success_at: '2026-03-27T00:11:00.000Z',
      },
      recent_outbound_total: 4,
      recent_outbound_errors: 3,
      recent_error_rate: 0.75,
      last_webhook_received_at: null,
      top_failing_actions: [],
      latency_by_action: [],
    });

    const planeHealth = require(PLANE_HEALTH_PATH);
    const gate = await planeHealth.shouldAllowPlaneRequest();
    assert.strictEqual(gate.allowed, true);
    assert.strictEqual(gate.breaker_state, 'closed');
  });

  test('webhook handler records webhook audit receipt', async () => {
    process.env.PLANE_WEBHOOK_TOKEN = 'token';

    const secondBrain = require(SECOND_BRAIN_PATH);
    let auditPayload = null;
    secondBrain.recordFirecrawlAudit = async (payload) => {
      auditPayload = payload;
    };

    const webhook = require(PLANE_WEBHOOK_SYNC_PATH);
    const result = await webhook.handlePlaneWebhook({
      headers: {
        authorization: 'Bearer token',
        'x-plane-event': 'issue.updated',
      },
      rawBody: JSON.stringify({ issue: { id: '123', name: 'Issue' } }),
      brokerClient: { publish: async () => {} },
    });

    assert.strictEqual(result.statusCode, 202);
    assert.ok(auditPayload);
    assert.strictEqual(auditPayload.action, 'plane-webhook-received');
    assert.match(auditPayload.url, /plane:\/\/webhook\/issue\.updated/);
  });
});
