const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert');

const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');

describe('second-brain lifecycle helpers', () => {
  beforeEach(async () => {
    await secondBrain.resetForTests();
  });

  afterEach(async () => {
    await secondBrain.resetForTests();
  });

  after(async () => {
    await secondBrain.close();
  });

  test('close is idempotent and does not end the same pool twice', async () => {
    let endCalls = 0;
    secondBrain.pool = {
      end: async () => {
        endCalls += 1;
      },
      on: () => {}
    };

    await secondBrain.close();
    await secondBrain.close();

    assert.strictEqual(endCalls, 1);
  });

  test('resetForTests restores a usable clean backend state after repeated teardown', async () => {
    let sqliteCloseCalls = 0;
    secondBrain.sqliteDb = {
      close: () => {
        sqliteCloseCalls += 1;
      }
    };
    secondBrain.useSqlite = true;
    secondBrain.transitionToDegraded('postgres_unavailable', { message: 'offline' });

    await secondBrain.close();
    await secondBrain.resetForTests();
    await secondBrain.resetForTests();

    const state = secondBrain.getBackendState();
    assert.strictEqual(sqliteCloseCalls, 1);
    assert.strictEqual(state.configured_backend, 'postgres');
    assert.strictEqual(state.active_backend, 'postgres');
    assert.strictEqual(state.degraded, false);
    assert.strictEqual(state.degraded_reason, null);
    assert.strictEqual(state.warning_emitted, false);
    assert.strictEqual(state.memory_critical_blocked, false);
    assert.ok(secondBrain.pool);
  });
});
