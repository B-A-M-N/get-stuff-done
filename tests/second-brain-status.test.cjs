const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('node:child_process');

const SECOND_BRAIN_PATH = '../get-stuff-done/bin/lib/second-brain.cjs';
const BRAIN_MANAGER_PATH = '../get-stuff-done/bin/lib/brain-manager.cjs';
const BROKER_PATH = '../get-stuff-done/bin/lib/broker.cjs';

function clearCaches() {
  delete require.cache[require.resolve(SECOND_BRAIN_PATH)];
  delete require.cache[require.resolve(BRAIN_MANAGER_PATH)];
  delete require.cache[require.resolve(BROKER_PATH)];
}

function parseTrailingJson(text) {
  const match = String(text).match(/(\{[\s\S]*\})\s*$/);
  if (!match) {
    throw new Error(`No JSON object found in output: ${text}`);
  }
  return JSON.parse(match[1]);
}

describe('second-brain status and health', () => {
  let originalCheckPlanningServer;
  let originalPoolConnect;
  let originalGetBackendState;
  let originalRequirePostgres;
  let originalBrokerConnect;
  let originalBrokerState;

  beforeEach(() => {
    clearCaches();
    const secondBrain = require(SECOND_BRAIN_PATH);
    const brainManager = require(BRAIN_MANAGER_PATH);
    const broker = require(BROKER_PATH);

    originalCheckPlanningServer = brainManager._checkPlanningServer;
    originalPoolConnect = secondBrain.pool.connect;
    originalGetBackendState = secondBrain.getBackendState;
    originalRequirePostgres = secondBrain.requirePostgres;
    originalBrokerConnect = broker.connect;
    originalBrokerState = broker.isConnected;
    broker.connect = async () => {
      broker.isConnected = false;
    };
  });

  afterEach(async () => {
    const secondBrain = require(SECOND_BRAIN_PATH);
    const brainManager = require(BRAIN_MANAGER_PATH);
    const broker = require(BROKER_PATH);

    secondBrain.pool.connect = originalPoolConnect;
    secondBrain.getBackendState = originalGetBackendState;
    secondBrain.requirePostgres = originalRequirePostgres;
    brainManager._checkPlanningServer = originalCheckPlanningServer;
    broker.connect = originalBrokerConnect;
    broker.isConnected = originalBrokerState;
    await broker.close();
    await secondBrain.close();
    clearCaches();
  });

  test('manager status returns the authoritative backend-state keys', async () => {
    const secondBrain = require(SECOND_BRAIN_PATH);
    const brainManager = require(BRAIN_MANAGER_PATH);

    secondBrain.getBackendState = () => ({
      configured_backend: 'postgres',
      active_backend: 'sqlite',
      degraded: true,
      degraded_reason: 'postgres_connect_failed',
      warning_emitted: true,
      memory_critical_blocked: false,
      degraded_details: { message: 'connect ECONNREFUSED' },
    });

    const status = await brainManager.getStatus();
    assert.deepStrictEqual(status, {
      configured_backend: 'postgres',
      active_backend: 'sqlite',
      degraded: true,
      degraded_reason: 'postgres_connect_failed',
      warning_emitted: true,
      memory_critical_blocked: false,
    });
  });

  test('manager health returns backend truth, diagnostics, and degraded runbook', async () => {
    const secondBrain = require(SECOND_BRAIN_PATH);
    const brainManager = require(BRAIN_MANAGER_PATH);

    secondBrain.getBackendState = () => ({
      configured_backend: 'postgres',
      active_backend: 'sqlite',
      degraded: true,
      degraded_reason: 'postgres_auth_failed',
      warning_emitted: true,
      memory_critical_blocked: false,
      degraded_details: { message: 'bad password' },
    });
    secondBrain.pool.connect = async () => {
      throw new Error('should not probe postgres while degraded');
    };
    brainManager._checkPlanningServer = async () => 'ok';

    const health = await brainManager.checkHealth();
    assert.strictEqual(health.configured_backend, 'postgres');
    assert.strictEqual(health.active_backend, 'sqlite');
    assert.strictEqual(health.degraded, true);
    assert.strictEqual(health.degraded_reason, 'postgres_auth_failed');
    assert.strictEqual(health.warning_emitted, true);
    assert.strictEqual(health.memory_critical_blocked, false);
    assert.match(health.runbook, /brain health --raw/);
    assert.match(health.postgres.detail, /bad password/);
    assert.strictEqual(health.planningServer.status, 'ok');
  });

  test('brain health require-postgres reports memory-critical blocking', async () => {
    const secondBrain = require(SECOND_BRAIN_PATH);
    const brainManager = require(BRAIN_MANAGER_PATH);

    secondBrain.getBackendState = () => ({
      configured_backend: 'postgres',
      active_backend: 'sqlite',
      degraded: true,
      degraded_reason: 'postgres_unavailable',
      warning_emitted: true,
      memory_critical_blocked: false,
      degraded_details: { message: 'offline' },
    });
    secondBrain.requirePostgres = () => {
      const error = new Error('Postgres is required for brain health');
      error.code = 'SECOND_BRAIN_POSTGRES_REQUIRED';
      throw error;
    };
    brainManager._checkPlanningServer = async () => 'ok';

    const health = await brainManager.checkHealth({ requirePostgres: true });
    assert.strictEqual(health.memory_critical_blocked, true);
    assert.strictEqual(health.allOk, false);
    assert.match(health.postgres.detail, /required/);
  });

  test('cli brain status and brain health require-postgres expose the JSON contract', () => {
    const cwd = path.resolve(__dirname, '..');
    const env = {
      ...process.env,
      GSD_MEMORY_MODE: 'sqlite',
    };

    const statusResult = spawnSync('node', ['get-stuff-done/bin/gsd-tools.cjs', 'brain', 'status', '--raw'], {
      cwd,
      env,
      encoding: 'utf8',
    });
    assert.strictEqual(statusResult.status, 0);
    const statusJson = parseTrailingJson(statusResult.stdout);
    for (const key of ['configured_backend', 'active_backend', 'degraded', 'degraded_reason', 'warning_emitted', 'memory_critical_blocked']) {
      assert.ok(Object.prototype.hasOwnProperty.call(statusJson, key), `missing status key ${key}`);
    }

    const healthResult = spawnSync('node', ['get-stuff-done/bin/gsd-tools.cjs', 'brain', 'health', '--require-postgres', '--raw'], {
      cwd,
      env,
      encoding: 'utf8',
    });
    assert.notStrictEqual(healthResult.status, 0);
    const healthJson = parseTrailingJson(healthResult.stdout);
    for (const key of ['configured_backend', 'active_backend', 'degraded', 'degraded_reason', 'warning_emitted', 'memory_critical_blocked']) {
      assert.ok(Object.prototype.hasOwnProperty.call(healthJson, key), `missing health key ${key}`);
    }
    assert.strictEqual(healthJson.memory_critical_blocked, true);
  });
});
