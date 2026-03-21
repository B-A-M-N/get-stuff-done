const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { normalizeInternal } = require('../get-stuff-done/bin/lib/internal-normalizer.cjs');
const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');
const broker = require('../get-stuff-done/bin/lib/broker.cjs');

describe('Second Brain E2E Integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-second-brain-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Reset states
    secondBrain.offlineMode = false;
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
      assert.ok(insertArtifact.params.includes('test.js'), 'Should include source_uri');

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
      broker.publish = originalPublish;
      broker.isConnected = originalIsConnected;
    }
  });

  test('Fault Tolerance: Postgres Down handles gracefully', async () => {
    const jsFilePath = path.join(tmpDir, '.planning', 'test.js');
    fs.writeFileSync(jsFilePath, 'function testFunc() {}', 'utf8');

    const originalConnect = secondBrain.pool.connect;
    secondBrain.pool.connect = async () => {
      throw new Error('Connection refused (Simulated)');
    };

    try {
      // Should NOT throw
      await normalizeInternal(tmpDir);
      assert.strictEqual(secondBrain.offlineMode, true, 'Should set offlineMode to true on connection failure');
    } finally {
      secondBrain.pool.connect = originalConnect;
    }
  });

  test('Fault Tolerance: RabbitMQ Down handles gracefully', async () => {
    const jsFilePath = path.join(tmpDir, '.planning', 'test.js');
    fs.writeFileSync(jsFilePath, 'function testFunc() {}', 'utf8');

    // Mock Postgres to succeed
    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {}
    };
    const originalConnect = secondBrain.pool.connect;
    secondBrain.pool.connect = async () => mockClient;

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
      broker.publish = originalPublish;
      broker.isConnected = originalIsConnected;
    }
  });

  test('Combined Resilience: Both services down', async () => {
    const jsFilePath = path.join(tmpDir, '.planning', 'test.js');
    fs.writeFileSync(jsFilePath, 'function testFunc() {}', 'utf8');

    const originalConnect = secondBrain.pool.connect;
    secondBrain.pool.connect = async () => { throw new Error('DB Down'); };

    const originalIsConnected = broker.isConnected;
    broker.isConnected = false;

    try {
       // Should NOT throw
       await normalizeInternal(tmpDir);
       assert.strictEqual(secondBrain.offlineMode, true);
    } finally {
      secondBrain.pool.connect = originalConnect;
      broker.isConnected = originalIsConnected;
    }
  });
});
