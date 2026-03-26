const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { persistItlOutput } = require('../get-stuff-done/bin/lib/itl.cjs');

describe('ITL Persistence', () => {
  test('persistItlOutput writes JSON file with expected fields', () => {
    // Create a temporary CWD structure
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-itl-test-'));
    const phasesDir = path.join(tempCwd, '.planning', 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    const phaseDirName = '51-test';
    const phaseDir = path.join(phasesDir, phaseDirName);
    fs.mkdirSync(phaseDir, { recursive: true });
    const paddedPhase = '51';

    // Mock ITL result object
    const itlResult = {
      ambiguity: { severity: 'medium', findings: [] },
      lockability: { locked: true },
      interpretation: 'Test interpretation',
      summary: 'Test summary',
      generated_at: new Date().toISOString(),
    };

    // Call persistItlOutput
    const returnedPath = persistItlOutput(tempCwd, paddedPhase, itlResult);

    // Should return the relative path
    assert.ok(returnedPath, 'Function should return a path');
    const fullPath = path.join(tempCwd, returnedPath);
    assert.ok(fs.existsSync(fullPath), `File should exist at ${fullPath}`);

    // Read and validate content
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    assert.strictEqual(content.ambiguity.severity, 'medium');
    assert.strictEqual(content.lockability.locked, true);
    assert.strictEqual(content.interpretation, 'Test interpretation');
    assert.strictEqual(content.summary, 'Test summary');
    assert.ok(content.generated_at, 'Should have generated_at timestamp');

    // Cleanup
    fs.rmSync(tempCwd, { recursive: true, force: true });
  });

  test('persistItlOutput returns null if phases dir missing', () => {
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-itl-test-'));
    // No .planning/phases directory
    const result = persistItlOutput(tempCwd, '51', { ambiguity: {}, lockability: {} });
    assert.strictEqual(result, null, 'Should return null when phases dir does not exist');
    fs.rmSync(tempCwd, { recursive: true, force: true });
  });

  test('persistItlOutput returns null if phase not found', () => {
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-itl-test-'));
    const phasesDir = path.join(tempCwd, '.planning', 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    // Create a dir that does NOT start with '51'
    fs.mkdirSync(path.join(phasesDir, '52-other'), { recursive: true });
    const result = persistItlOutput(tempCwd, '51', { ambiguity: {}, lockability: {} });
    assert.strictEqual(result, null, 'Should return null when phase dir not found');
    fs.rmSync(tempCwd, { recursive: true, force: true });
  });
});
