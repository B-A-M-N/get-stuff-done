/**
 * checkGrant unit tests
 *
 * Tests for the SecondBrain checkGrant method covering:
 * - Postgres mode (useSqlite=false) proceeds to query database
 * - SQLite unavailable (useSqlite=true, sqliteDb=null) denies access
 * - offlineMode=true allows planning server bypass, denies other resources
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Access the secondBrain singleton
const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');

describe('checkGrant', () => {
  let originalState = {};

  beforeEach(() => {
    // Save original state to restore after each test
    originalState = {
      useSqlite: secondBrain.useSqlite,
      sqliteDb: secondBrain.sqliteDb,
      offlineMode: secondBrain.offlineMode,
      listGrants: secondBrain.listGrants
    };
  });

  afterEach(() => {
    // Restore original state
    secondBrain.useSqlite = originalState.useSqlite;
    secondBrain.sqliteDb = originalState.sqliteDb;
    secondBrain.offlineMode = originalState.offlineMode;
    secondBrain.listGrants = originalState.listGrants;
  });

  test('Postgres mode: checkGrant proceeds to call listGrants when useSqlite=false', async () => {
    // Setup: Postgres mode (useSqlite=false, sqliteDb=null), offlineMode=false
    secondBrain.useSqlite = false;
    secondBrain.sqliteDb = null;
    secondBrain.offlineMode = false;

    // Stub listGrants to track if it was called
    let listGrantsCalled = false;
    const originalListGrants = secondBrain.listGrants;
    secondBrain.listGrants = async () => {
      listGrantsCalled = true;
      return []; // Return empty grants array
    };

    // Execute checkGrant
    const result = await secondBrain.checkGrant('http://example.com');

    // Verify that listGrants was called (check proceeded to query)
    assert.strictEqual(listGrantsCalled, true, 'listGrants should be called in Postgres mode');
    // Result should be false (no grants) but that's expected
    assert.strictEqual(result, false);
  });

  test('SQLite unavailable: checkGrant returns false without calling listGrants when useSqlite=true and sqliteDb=null', async () => {
    // Setup: SQLite mode but database not available
    secondBrain.useSqlite = true;
    secondBrain.sqliteDb = null;
    secondBrain.offlineMode = false;

    // Stub listGrants to track if it was called
    let listGrantsCalled = false;
    secondBrain.listGrants = async () => {
      listGrantsCalled = true;
      return [];
    };

    // Execute checkGrant
    const result = await secondBrain.checkGrant('http://example.com');

    // Verify that listGrants was NOT called (early return due to unavailable DB)
    assert.strictEqual(listGrantsCalled, false, 'listGrants should NOT be called when SQLite unavailable');
    assert.strictEqual(result, false, 'checkGrant should return false for non-planning resources');
  });

  test('offlineMode: planning server resources bypass check, others denied', async () => {
    // Setup: offlineMode=true
    secondBrain.useSqlite = false;
    secondBrain.sqliteDb = null;
    secondBrain.offlineMode = true;

    // Stub listGrants to ensure it's not called
    let listGrantsCalled = false;
    secondBrain.listGrants = async () => {
      listGrantsCalled = true;
      return [];
    };

    // Test 1: Planning server resource should be allowed
    const planningResult = await secondBrain.checkGrant('http://localhost:3011/health');
    assert.strictEqual(planningResult, true, 'Planning server access should be granted in offlineMode');
    assert.strictEqual(listGrantsCalled, false, 'listGrants should not be called for planning bypass');

    // Test 2: Non-planning resource should be denied
    const externalResult = await secondBrain.checkGrant('http://example.com');
    assert.strictEqual(externalResult, false, 'External resources should be denied in offlineMode');
    assert.strictEqual(listGrantsCalled, false, 'listGrants should not be called for denied resources');
  });

  test('SQLite available: checkGrant proceeds to call listGrants when useSqlite=true and sqliteDb is set', async () => {
    // Setup: SQLite mode with database available
    secondBrain.useSqlite = true;
    // Use a simple stub object - checkGrant only checks truthiness of sqliteDb
    secondBrain.sqliteDb = { close: () => {} }; // Mock db object
    secondBrain.offlineMode = false;

    // Stub listGrants to track if it was called
    let listGrantsCalled = false;
    const originalListGrants = secondBrain.listGrants;
    secondBrain.listGrants = async () => {
      listGrantsCalled = true;
      return []; // Return empty array for simplicity
    };

    // Execute checkGrant
    const result = await secondBrain.checkGrant('http://example.com');

    // Verify that listGrants was called
    assert.strictEqual(listGrantsCalled, true, 'listGrants should be called when SQLite is available');

    // Cleanup
    secondBrain.sqliteDb = null;
    secondBrain.listGrants = originalListGrants;
  });
});
