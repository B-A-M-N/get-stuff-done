const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');

describe('second-brain backend state', () => {
  let warnCalls = [];
  let originalWarn;

  beforeEach(async () => {
    originalWarn = console.warn;
    warnCalls = [];
    console.warn = (...args) => {
      warnCalls.push(args.join(' '));
    };
    await secondBrain.resetForTests();
  });

  afterEach(async () => {
    console.warn = originalWarn;
    await secondBrain.resetForTests();
  });

  test('classifies auth and connection failures into degraded SQLite state', () => {
    secondBrain.transitionToDegraded(
      secondBrain.classifyPostgresFailure(new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string')),
      { message: 'bad auth' }
    );

    const state = secondBrain.getBackendState();
    assert.strictEqual(state.configured_backend, 'postgres');
    assert.strictEqual(state.active_backend, 'sqlite');
    assert.strictEqual(state.degraded, true);
    assert.strictEqual(state.degraded_reason, 'postgres_auth_failed');
    assert.strictEqual(state.warning_emitted, true);
    assert.strictEqual(state.memory_critical_blocked, false);
    assert.deepStrictEqual(warnCalls, ['Brain degraded: Postgres unavailable, using SQLite fallback.']);
  });

  test('repeating the same degraded reason does not emit a second warning', () => {
    secondBrain.transitionToDegraded('postgres_connect_failed', { message: 'connect ECONNREFUSED' });
    secondBrain.transitionToDegraded('postgres_connect_failed', { message: 'connect ECONNREFUSED' });

    assert.strictEqual(warnCalls.length, 1);
    assert.strictEqual(secondBrain.getBackendState().degraded_reason, 'postgres_connect_failed');
  });

  test('changing the degraded reason emits one new warning and updates state', () => {
    secondBrain.transitionToDegraded('postgres_connect_failed', { message: 'connect ECONNREFUSED' });
    secondBrain.transitionToDegraded('postgres_pool_exhausted', { message: 'sorry, too many clients already' });

    const state = secondBrain.getBackendState();
    assert.strictEqual(warnCalls.length, 2);
    assert.strictEqual(state.degraded_reason, 'postgres_pool_exhausted');
    assert.strictEqual(state.warning_emitted, true);
  });
});
