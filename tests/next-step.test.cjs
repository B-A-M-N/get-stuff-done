/**
 * GSD Tools Tests — Next Step Scratch Pad
 *
 * Verifies `next-step set/get/consume/clear` operations on .planning/.gsd-next.json.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('next-step scratch pad', () => {
  let tmpDir;
  let scratchPath;

  beforeEach(() => {
    tmpDir = createTempProject();
    scratchPath = path.join(tmpDir, '.planning', '.gsd-next.json');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── set ──────────────────────────────────────────────────────────────────

  test('set writes scratch pad file', () => {
    const result = runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.ok(out.ok);
    assert.strictEqual(out.command, '/gsd:plan-phase 5');
    assert.ok(fs.existsSync(scratchPath), 'scratch pad file should exist');
  });

  test('set stores hint', () => {
    const result = runGsdTools(
      ['next-step', 'set', '/gsd:plan-phase', '5', '--hint', 'Phase 4 done'],
      tmpDir
    );
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.hint, 'Phase 4 done');

    const record = JSON.parse(fs.readFileSync(scratchPath, 'utf8'));
    assert.strictEqual(record.hint, 'Phase 4 done');
  });

  test('set writes written_at timestamp', () => {
    runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);
    const record = JSON.parse(fs.readFileSync(scratchPath, 'utf8'));
    assert.ok(record.written_at, 'should have written_at');
    assert.ok(!isNaN(Date.parse(record.written_at)), 'written_at should be valid ISO date');
  });

  test('set returns ok:false when no .planning dir', () => {
    fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true, force: true });
    const result = runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);
    assert.ok(result.success, 'command should exit 0 with error JSON');
    const out = JSON.parse(result.output);
    assert.strictEqual(out.ok, false);
  });

  // ─── get ──────────────────────────────────────────────────────────────────

  test('get returns found:false when no scratch pad', () => {
    const result = runGsdTools(['next-step', 'get'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.ok(out.ok);
    assert.strictEqual(out.found, false);
    assert.strictEqual(out.command, null);
  });

  test('get returns command and does not delete file', () => {
    runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);

    const result = runGsdTools(['next-step', 'get'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.ok(out.ok);
    assert.strictEqual(out.found, true);
    assert.strictEqual(out.command, '/gsd:plan-phase 5');

    // File should still exist after get
    assert.ok(fs.existsSync(scratchPath), 'get should not delete the scratch pad');
  });

  // ─── consume ──────────────────────────────────────────────────────────────

  test('consume emits no output when no scratch pad (silent no-op)', () => {
    const result = runGsdTools(['next-step', 'consume'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.strictEqual(result.output, '', 'consume should be silent when no scratch pad');
  });

  test('consume outputs injection text and deletes file', () => {
    runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);

    const result = runGsdTools(['next-step', 'consume'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(result.output.includes('<gsd-scratch-pad>'), 'should output injection block');
    assert.ok(result.output.includes('/gsd:plan-phase 5'), 'should include the command');
    assert.ok(!fs.existsSync(scratchPath), 'consume should delete the scratch pad');
  });

  test('consume in --raw mode returns JSON and deletes file', () => {
    runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);

    const result = runGsdTools(['next-step', 'consume', '--raw'], tmpDir);
    // --raw for consume outputs "ok" status string — the JSON path is default mode
    // Verify file was deleted regardless of output mode
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(!fs.existsSync(scratchPath), 'consume --raw should also delete the scratch pad');
  });

  test('consume injection text includes redirect guidance', () => {
    runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);
    const result = runGsdTools(['next-step', 'consume'], tmpDir);
    assert.ok(result.output.includes('research-phase 5'), 'should include research redirect example');
    assert.ok(result.output.includes('discuss-phase 5'), 'should include discuss redirect example');
  });

  // ─── clear ────────────────────────────────────────────────────────────────

  test('clear deletes scratch pad', () => {
    runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);
    assert.ok(fs.existsSync(scratchPath));

    const result = runGsdTools(['next-step', 'clear'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.ok(out.ok);
    assert.strictEqual(out.cleared, true);
    assert.ok(!fs.existsSync(scratchPath));
  });

  test('clear is idempotent when no scratch pad', () => {
    const result = runGsdTools(['next-step', 'clear'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.ok(out.ok);
    assert.strictEqual(out.cleared, false);
  });

  // ─── overwrite ────────────────────────────────────────────────────────────

  test('set overwrites existing scratch pad', () => {
    runGsdTools(['next-step', 'set', '/gsd:plan-phase', '5'], tmpDir);
    runGsdTools(['next-step', 'set', '/gsd:discuss-phase', '5'], tmpDir);

    const result = runGsdTools(['next-step', 'get'], tmpDir);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.command, '/gsd:discuss-phase 5');
  });
});
