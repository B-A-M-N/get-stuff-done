const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert');

const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');
const brainManager = require('../get-stuff-done/bin/lib/brain-manager.cjs');

describe('model-facing memory degraded mode', () => {
  beforeEach(async () => {
    await secondBrain.resetForTests();
  });

  afterEach(async () => {
    await secondBrain.resetForTests();
  });

  after(async () => {
    await secondBrain.close();
  });

  test('planner-style model memory reads return blocked when backend is degraded away from postgres', async () => {
    secondBrain.transitionToDegraded('postgres_connect_failed', { message: 'connect ECONNREFUSED' });

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

  test('executor-style model memory writeback returns blocked when backend is degraded away from postgres', async () => {
    secondBrain.transitionToDegraded('postgres_auth_failed', { message: 'bad password' });

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
    secondBrain.transitionToDegraded('postgres_connect_failed', { message: 'connect ECONNREFUSED' });

    const status = brainManager.getStatus();
    assert.strictEqual(status.model_facing_memory.status, 'blocked');
    assert.strictEqual(status.model_facing_memory.available, false);
    assert.match(status.model_facing_memory.detail, /unavailable while degraded/i);

    const health = await brainManager.checkHealth();
    assert.strictEqual(health.model_facing_memory.status, 'blocked');
    assert.strictEqual(health.model_facing_memory.available, false);
    assert.match(health.model_facing_memory.detail, /Postgres-backed memory required/i);
  });
});
