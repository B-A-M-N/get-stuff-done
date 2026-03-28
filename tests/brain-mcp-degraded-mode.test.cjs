const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert');

const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');
const brainManager = require('../get-stuff-done/bin/lib/brain-manager.cjs');
const {
  applyCanonicalDegradedMemoryEnv,
  restoreEnv,
} = require('./helpers.cjs');

describe('model-facing memory degraded mode', () => {
  let envSnapshot;

  beforeEach(async () => {
    envSnapshot = null;
    await secondBrain.resetForTests();
  });

  afterEach(async () => {
    if (envSnapshot) {
      restoreEnv(envSnapshot);
      envSnapshot = null;
    }
    await secondBrain.resetForTests();
  });

  after(async () => {
    await secondBrain.close();
  });

  test('planner-style model memory reads return blocked from the canonical postgres outage posture', async () => {
    envSnapshot = applyCanonicalDegradedMemoryEnv();
    await secondBrain.resetForTests();
    await brainManager.getStatus();

    const result = await secondBrain.readModelFacingMemory({
      project_id: secondBrain.projectId,
      phase: '54',
      plan: '01',
    });

    assert.deepStrictEqual(
      {
        available: result.available,
        blocked: result.blocked,
        reason: result.reason,
        active_backend: result.backend_state.active_backend,
      },
      {
        available: false,
        blocked: true,
        reason: 'postgres_required',
        active_backend: 'sqlite',
      }
    );
    assert.match(result.message, /Postgres is required/);
  });

  test('executor-style model memory writeback returns blocked from the canonical postgres outage posture', async () => {
    envSnapshot = applyCanonicalDegradedMemoryEnv();
    await secondBrain.resetForTests();
    await brainManager.checkHealth();

    const result = await secondBrain.writeModelFacingMemoryCheckpoint({
      phase: '54',
      plan: '01',
      memory_kind: 'checkpoint',
      title: 'Blocked',
      body_markdown: 'Should not write while degraded.',
      source_ref: '54-01-PLAN.md',
      created_by: 'test',
      importance: 3,
    });

    assert.deepStrictEqual(
      {
        available: result.available,
        blocked: result.blocked,
        reason: result.reason,
        active_backend: result.backend_state.active_backend,
      },
      {
        available: false,
        blocked: true,
        reason: 'postgres_required',
        active_backend: 'sqlite',
      }
    );
    assert.match(result.message, /Postgres is required/);
  });

  test('operator status surfaces model-facing memory unavailability while degraded', async () => {
    envSnapshot = applyCanonicalDegradedMemoryEnv();
    await secondBrain.resetForTests();

    const status = await brainManager.getStatus();
    assert.strictEqual(status.model_facing_memory.status, 'blocked');
    assert.strictEqual(status.model_facing_memory.available, false);
    assert.match(status.model_facing_memory.detail, /unavailable while degraded/i);
    assert.strictEqual(status.active_backend, 'sqlite');
    assert.strictEqual(status.degraded, true);

    const health = await brainManager.checkHealth();
    assert.strictEqual(health.model_facing_memory.status, 'blocked');
    assert.strictEqual(health.model_facing_memory.available, false);
    assert.match(health.model_facing_memory.detail, /Postgres-backed memory required/i);
    assert.strictEqual(health.active_backend, 'sqlite');
    assert.strictEqual(health.degraded, true);
  });
});

// GSD-AUTHORITY: 80.1-01-1:6a2e7f7f8ceddf2bf50ef0205f3b4fc8c2743238b1572089550533b324e326e8
