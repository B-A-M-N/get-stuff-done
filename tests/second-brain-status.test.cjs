const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');
const brainManager = require('../get-stuff-done/bin/lib/brain-manager.cjs');
const {
  buildCanonicalDegradedMemoryEnv,
  parseTrailingJson,
} = require('./helpers.cjs');

describe('second-brain status and health surfaces', () => {
  let originalEnv;

  beforeEach(async () => {
    originalEnv = {
      GSD_MEMORY_MODE: process.env.GSD_MEMORY_MODE,
      PGHOST: process.env.PGHOST,
      PGPORT: process.env.PGPORT,
      PGDATABASE: process.env.PGDATABASE,
      PGUSER: process.env.PGUSER,
      PGPASSWORD: process.env.PGPASSWORD,
      DATABASE_URL: process.env.DATABASE_URL,
    };

    delete process.env.GSD_MEMORY_MODE;
    delete process.env.PGHOST;
    delete process.env.PGPORT;
    delete process.env.PGDATABASE;
    delete process.env.PGUSER;
    delete process.env.PGPASSWORD;
    delete process.env.DATABASE_URL;
    await secondBrain.resetForTests();
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await secondBrain.resetForTests();
  });

  after(async () => {
    await secondBrain.close();
  });

  test('brainManager status and health agree on degraded backend truth from one canonical postgres outage posture', async () => {
    process.env.PGHOST = '127.0.0.1';
    process.env.PGPORT = '1';
    process.env.PGDATABASE = 'gsd_unavailable';
    process.env.PGUSER = 'gsd_unavailable';
    process.env.PGPASSWORD = 'gsd_unavailable';

    const status = await brainManager.getStatus();
    const health = await brainManager.checkHealth();

    assert.strictEqual(status.configured_backend, 'postgres');
    assert.strictEqual(status.active_backend, 'sqlite');
    assert.strictEqual(status.degraded, true);
    assert.match(status.degraded_reason, /^postgres_(auth|connect)_failed$/);
    assert.strictEqual(status.warning_emitted, true);
    assert.strictEqual(status.memory_critical_blocked, false);
    assert.deepStrictEqual(status.model_facing_memory, {
      available: false,
      status: 'blocked',
      detail: 'Model-facing memory is unavailable while degraded. Postgres-backed memory required.',
    });

    assert.strictEqual(health.configured_backend, 'postgres');
    assert.strictEqual(health.active_backend, 'sqlite');
    assert.strictEqual(health.degraded, true);
    assert.match(health.degraded_reason, /^postgres_(auth|connect)_failed$/);
    assert.strictEqual(health.warning_emitted, true);
    assert.strictEqual(health.memory_critical_blocked, false);
    assert.strictEqual(health.postgres.status, 'degraded');
    assert.match(health.runbook, /brain health --raw/);
  });

  test('healthy backend truth preserves model-facing memory availability', async () => {
    const originalResolveBackendState = brainManager._resolveBackendState;
    const originalCheckPostgres = brainManager._checkPostgres;
    const originalCheckRabbitMq = brainManager._checkRabbitMq;
    const originalCheckPlanningServerDetailed = brainManager._checkPlanningServerDetailed;

    brainManager._resolveBackendState = async () => ({
      configured_backend: 'postgres',
      active_backend: 'postgres',
      degraded: false,
      degraded_reason: null,
      warning_emitted: false,
      memory_critical_blocked: false,
    });
    brainManager._checkPostgres = async () => ({ status: 'ok', detail: null });
    brainManager._checkRabbitMq = async () => ({ status: 'ok', detail: null });
    brainManager._checkPlanningServerDetailed = async () => ({ status: 'ok', detail: null });

    try {
      const status = await brainManager.getStatus();
      const health = await brainManager.checkHealth();

      assert.strictEqual(status.configured_backend, 'postgres');
      assert.strictEqual(status.active_backend, 'postgres');
      assert.strictEqual(status.degraded, false);
      assert.deepStrictEqual(status.model_facing_memory, {
        available: true,
        status: 'ok',
        detail: null,
      });

      assert.strictEqual(health.active_backend, 'postgres');
      assert.strictEqual(health.degraded, false);
      assert.strictEqual(health.model_facing_memory.available, true);
      assert.strictEqual(health.model_facing_memory.status, 'ok');
      assert.strictEqual(health.postgres.status, 'ok');
    } finally {
      brainManager._resolveBackendState = originalResolveBackendState;
      brainManager._checkPostgres = originalCheckPostgres;
      brainManager._checkRabbitMq = originalCheckRabbitMq;
      brainManager._checkPlanningServerDetailed = originalCheckPlanningServerDetailed;
    }
  });

  test('brain status CLI returns backend-state JSON in raw mode', () => {
    const result = spawnSync(
      process.execPath,
      ['get-stuff-done/bin/gsd-tools.cjs', 'brain', 'status', '--raw'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: buildCanonicalDegradedMemoryEnv(),
      }
    );

    assert.strictEqual(result.status, 0, result.stderr);
    const output = parseTrailingJson(result.stdout);
    assert.strictEqual(output.configured_backend, 'postgres');
    assert.strictEqual(output.active_backend, 'sqlite');
    assert.strictEqual(output.degraded, true);
    assert.strictEqual(output.degraded_reason, 'postgres_connect_failed');
    assert.strictEqual(output.model_facing_memory.available, false);
    assert.strictEqual(output.model_facing_memory.status, 'blocked');
  });

  test('brain health CLI blocks explicit Postgres-required checks', () => {
    const result = spawnSync(
      process.execPath,
      ['get-stuff-done/bin/gsd-tools.cjs', 'brain', 'health', '--require-postgres', '--raw'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: buildCanonicalDegradedMemoryEnv(),
      }
    );

    assert.notStrictEqual(result.status, 0);
    const output = parseTrailingJson(result.stdout);
    assert.strictEqual(output.memory_critical_blocked, true);
    assert.strictEqual(output.postgres.status, 'blocked');
    assert.match(output.postgres.detail, /Postgres is required/);
  });

  test('context build workflows block on model-facing memory under canonical postgres outage posture', () => {
    const planResult = spawnSync(
      process.execPath,
      ['get-stuff-done/bin/gsd-tools.cjs', 'context', 'build', '--workflow', 'plan-phase', '--raw'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: buildCanonicalDegradedMemoryEnv(),
      }
    );
    const executeResult = spawnSync(
      process.execPath,
      ['get-stuff-done/bin/gsd-tools.cjs', 'context', 'build', '--workflow', 'execute-plan', '--raw'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: buildCanonicalDegradedMemoryEnv(),
      }
    );

    assert.notStrictEqual(planResult.status, 0);
    assert.notStrictEqual(executeResult.status, 0);

    const planOutput = parseTrailingJson(planResult.stdout);
    const executeOutput = parseTrailingJson(executeResult.stdout);

    assert.strictEqual(planOutput.subsystem, 'model_facing_memory');
    assert.strictEqual(planOutput.reason, 'canonical_postgres_memory_unavailable');
    assert.strictEqual(executeOutput.subsystem, 'model_facing_memory');
    assert.strictEqual(executeOutput.reason, 'canonical_postgres_memory_unavailable');
  });
});

// GSD-AUTHORITY: 80.1-01-1:ca10049346b80a3e8928bb0a5230d3b579f7f86fd4ed61483c4ccce8866ed787
