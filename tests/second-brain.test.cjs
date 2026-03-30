const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { normalizeInternal } = require('../get-stuff-done/bin/lib/internal-normalizer.cjs');
const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');
const broker = require('../get-stuff-done/bin/lib/broker.cjs');

/**
 * Mocks Postgres pool to simulate failure by throwing on all query calls.
 * This targets the actual dependency boundary (pool.query) rather than internal pg mechanics.
 * @param {object} pool - The pg Pool instance to mock
 * @returns {function} Restore function to revert the mock
 */
function mockPostgresFailure(pool) {
  const originalQuery = pool.query;
  pool.query = async () => {
    throw new Error('Connection refused (Simulated)');
  };
  return () => {
    pool.query = originalQuery;
  };
}

describe('Second Brain E2E Integration', () => {
  let tmpDir;

  beforeEach(async () => {
    // Ensure clean Second Brain state before each test
    await secondBrain.resetForTests();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-second-brain-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Fully reset the Second Brain singleton after each test
    await secondBrain.resetForTests();
  });

  test('normalization pipeline pushes data to the Second Brain (Mocked Postgres/RabbitMQ)', async () => {
    const jsFilePath = path.join(tmpDir, '.planning', 'test.js');
    fs.writeFileSync(jsFilePath, 'function testFunc() {}', 'utf8');

    // Mock Postgres client
    const queries = [];
    const mockClient = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
      release: () => {}
    };

    const originalConnect = secondBrain.pool.connect;
    secondBrain.pool.connect = async () => mockClient;
    const originalQuery = secondBrain.pool.query;
    // pool.query is used directly during initialization; mock it to succeed without tracking
    secondBrain.pool.query = async () => ({ rows: [] });

    // Mock RabbitMQ publish
    const originalPublish = broker.publish;
    const publishedMessages = [];
    broker.publish = async (topic, message) => {
      publishedMessages.push({ topic, message });
      return true;
    };
    const originalIsConnected = broker.isConnected;
    broker.isConnected = true;

    try {
      await normalizeInternal(tmpDir);

      // Verify Postgres calls
      const insertArtifact = queries.find(q => q.sql && q.sql.includes('INSERT INTO gsd_local_brain.artifacts'));
      assert.ok(insertArtifact, 'Should have inserted artifact into Postgres');
      // The source_uri is the second parameter in the INSERT (after id)
      assert.strictEqual(insertArtifact.params[1], '.planning/test.js', 'Should include correct source_uri');

      const insertSymbol = queries.find(q => q.sql && q.sql.includes('INSERT INTO gsd_local_brain.symbols'));
      assert.ok(insertSymbol, 'Should have inserted symbol into Postgres');
      assert.ok(insertSymbol.params.includes('testFunc'), 'Should include symbol name');

      // Verify RabbitMQ calls
      const pulseEvent = publishedMessages.find(m => m.topic === 'symbol.ingested');
      assert.ok(pulseEvent, 'Should have emitted symbol.ingested event');
      assert.strictEqual(pulseEvent.message.symbolName, 'testFunc');

    } finally {
      // Restore
      secondBrain.pool.connect = originalConnect;
      secondBrain.pool.query = originalQuery;
      broker.publish = originalPublish;
      broker.isConnected = originalIsConnected;
    }
  });

  test('Fault Tolerance: Postgres Down handles gracefully', async () => {
    const jsFilePath = path.join(tmpDir, '.planning', 'test.js');
    fs.writeFileSync(jsFilePath, 'function testFunc() {}', 'utf8');

    const restorePg = mockPostgresFailure(secondBrain.pool);

    try {
      // Should NOT throw
      await normalizeInternal(tmpDir);
      // Postgres failure should trigger SQLite fallback (degraded mode), not offlineMode
      assert.strictEqual(secondBrain.useSqlite, true, 'Should fall back to SQLite');
      assert.strictEqual(secondBrain.backendState.degraded, true, 'Should mark backend as degraded');
      assert.strictEqual(secondBrain.offlineMode, false, 'Should NOT set offlineMode when fallback exists');
    } finally {
      restorePg();
    }
  });

  test('Fault Tolerance: RabbitMQ Down handles gracefully', async () => {
    const jsFilePath = path.join(tmpDir, '.planning', 'test.js');
    fs.writeFileSync(jsFilePath, 'function testFunc() {}', 'utf8');

    // Mock Postgres to succeed (both connect and direct pool.query)
    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {}
    };
    const originalConnect = secondBrain.pool.connect;
    secondBrain.pool.connect = async () => mockClient;
    const originalQuery = secondBrain.pool.query;
    secondBrain.pool.query = async () => ({ rows: [] });

    const originalPublish = broker.publish;
    broker.publish = async (topic) => {
       console.error(`Failed to publish message to ${topic}: Socket closed (Simulated)`);
       return null;
    };
    const originalIsConnected = broker.isConnected;
    broker.isConnected = true;

    try {
       // Should NOT throw
       await normalizeInternal(tmpDir);
    } finally {
      secondBrain.pool.connect = originalConnect;
      secondBrain.pool.query = originalQuery;
      broker.publish = originalPublish;
      broker.isConnected = originalIsConnected;
    }
  });

  test('Combined Resilience: Both services down', async () => {
    const jsFilePath = path.join(tmpDir, '.planning', 'test.js');
    fs.writeFileSync(jsFilePath, 'function testFunc() {}', 'utf8');

    const restorePg = mockPostgresFailure(secondBrain.pool);

    const originalIsConnected = broker.isConnected;
    broker.isConnected = false;

    try {
       // Should NOT throw
       await normalizeInternal(tmpDir);
       // Both services down should still trigger SQLite fallback
       assert.strictEqual(secondBrain.useSqlite, true, 'Should fall back to SQLite');
       assert.strictEqual(secondBrain.backendState.degraded, true, 'Should mark backend as degraded');
       assert.strictEqual(secondBrain.offlineMode, false, 'Should NOT set offlineMode when fallback exists');
    } finally {
      restorePg();
      broker.isConnected = originalIsConnected;
    }
  });
});
