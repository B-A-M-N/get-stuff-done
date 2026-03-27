const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');
const brainManager = require('../get-stuff-done/bin/lib/brain-manager.cjs');

function parseTrailingJson(text) {
  const match = String(text).match(/(\{[\s\S]*\})\s*$/);
  if (!match) {
    throw new Error(`No JSON object found in output: ${text}`);
  }
  return JSON.parse(match[1]);
}

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

  test('brainManager surfaces authoritative degraded backend state and runbook', async () => {
    secondBrain.transitionToDegraded('postgres_connect_failed', { message: 'connect ECONNREFUSED' });

    const status = brainManager.getStatus();
    assert.deepStrictEqual(status, {
      configured_backend: 'postgres',
      active_backend: 'sqlite',
      degraded: true,
      degraded_reason: 'postgres_connect_failed',
      warning_emitted: true,
      memory_critical_blocked: false,
    });

    const health = await brainManager.checkHealth();
    assert.strictEqual(health.configured_backend, 'postgres');
    assert.strictEqual(health.active_backend, 'sqlite');
    assert.strictEqual(health.degraded, true);
    assert.strictEqual(health.degraded_reason, 'postgres_connect_failed');
    assert.strictEqual(health.warning_emitted, true);
    assert.strictEqual(health.memory_critical_blocked, false);
    assert.strictEqual(health.postgres.status, 'degraded');
    assert.match(health.runbook, /brain health --raw/);
  });

  test('brain status CLI returns backend-state JSON in raw mode', () => {
    const result = spawnSync(
      process.execPath,
      ['get-stuff-done/bin/gsd-tools.cjs', 'brain', 'status', '--raw'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          GSD_MEMORY_MODE: 'sqlite',
          PGHOST: '',
          PGPORT: '',
          PGDATABASE: '',
          PGUSER: '',
          PGPASSWORD: '',
          DATABASE_URL: '',
        },
      }
    );

    assert.strictEqual(result.status, 0, result.stderr);
    const output = parseTrailingJson(result.stdout);
    assert.deepStrictEqual(Object.keys(output).sort(), [
      'active_backend',
      'configured_backend',
      'degraded',
      'degraded_reason',
      'memory_critical_blocked',
      'warning_emitted',
    ]);
  });

  test('brain health CLI blocks explicit Postgres-required checks', () => {
    const result = spawnSync(
      process.execPath,
      ['get-stuff-done/bin/gsd-tools.cjs', 'brain', 'health', '--require-postgres', '--raw'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          GSD_MEMORY_MODE: 'sqlite',
          PGHOST: '',
          PGPORT: '',
          PGDATABASE: '',
          PGUSER: '',
          PGPASSWORD: '',
          DATABASE_URL: '',
        },
      }
    );

    assert.notStrictEqual(result.status, 0);
    const output = parseTrailingJson(result.stdout);
    assert.strictEqual(output.memory_critical_blocked, true);
    assert.strictEqual(output.postgres.status, 'blocked');
    assert.match(output.postgres.detail, /Postgres is required/);
  });
});
