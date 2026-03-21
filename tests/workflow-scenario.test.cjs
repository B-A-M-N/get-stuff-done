/**
 * Full Workflow Scenario Tests
 *
 * Drives a complete execute-plan sequence start-to-finish using the enforcement
 * boundary primitives. Proves that the primitives work together coherently, not
 * just in isolation.
 *
 * Scenarios:
 *   1. Sequential task completion → coherent context → verify integrity passes
 *   2. complete-task rejects non-sequential task number
 *   3. complete-task rejects task N when log is empty and N != 1
 *   4. context build after valid task log → coherent: true
 *   5. verify integrity detects orphaned CHECKPOINT.md (non-resolved, no gate)
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runGsdTools, createTempGitProject, cleanup } = require('./helpers.cjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeFile(dir, relPath, content) {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function setupPhase(tmpDir, phase = '1', plan = '1') {
  const phaseDir = `.planning/phases/${phase.padStart(2, '0')}-test-phase`;
  fs.mkdirSync(path.join(tmpDir, phaseDir), { recursive: true });

  // STATE.md with frontmatter
  writeFile(tmpDir, '.planning/STATE.md', [
    '---',
    `current_phase: ${phase}`,
    `current_plan: ${plan}`,
    '---',
    `# State`,
  ].join('\n'));

  // Simple PLAN.md
  writeFile(tmpDir, `${phaseDir}/${phase}-${plan}-PLAN.md`, [
    '# Plan',
    '',
    '<task>',
    '<name>Task 1: scaffold</name>',
    '<files>src/main.js</files>',
    '</task>',
    '',
    '<task>',
    '<name>Task 2: wire</name>',
    '<files>src/wire.js</files>',
    '</task>',
    '',
    '<task>',
    '<name>Task 3: tests</name>',
    '<files>src/main.test.js</files>',
    '</task>',
  ].join('\n'));

  return phaseDir;
}

function commitFile(tmpDir, relPath, content, message) {
  writeFile(tmpDir, relPath, content);
  execSync(`git add "${relPath}"`, { cwd: tmpDir, stdio: 'pipe' });
  execSync(`git commit -m "${message}"`, { cwd: tmpDir, stdio: 'pipe' });
  const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
  return hash;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Sequential complete-task → coherent context
// ─────────────────────────────────────────────────────────────────────────────

describe('workflow-scenario: sequential complete-task produces coherent state', () => {
  let tmpDir;
  let phaseDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    phaseDir = setupPhase(tmpDir, '1', '1');
    execSync('git add -A && git commit -m "setup planning"', { cwd: tmpDir, stdio: 'pipe', shell: true });
  });
  afterEach(() => { cleanup(tmpDir); });

  test('complete-task 1 succeeds and records to task log', () => {
    writeFile(tmpDir, 'src/main.js', 'console.log("hello")');
    execSync('git add src/main.js', { cwd: tmpDir, stdio: 'pipe' });

    const r = runGsdTools([
      'complete-task', 'feat(1-1): scaffold main',
      '--scope', '1-1',
      '--phase', '1', '--plan', '1', '--task', '1',
      '--files', 'src/main.js',
    ], tmpDir);

    assert.ok(r.success, `complete-task task 1 should succeed: ${r.error}`);
    const out = JSON.parse(r.output);
    assert.ok(out.committed, 'should be committed');
    assert.ok(out.verified, 'should be verified');
    assert.ok(out.hash, 'should have a hash');

    // Task log should have one entry
    const logPath = path.join(tmpDir, phaseDir, '1-1-TASK-LOG.jsonl');
    assert.ok(fs.existsSync(logPath), 'task log should exist');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1, 'task log should have 1 entry');
    const entry = JSON.parse(lines[0]);
    assert.strictEqual(entry.task, 1);
    assert.strictEqual(entry.hash, out.hash);
  });

  test('complete-task 2 succeeds after task 1', () => {
    // Task 1
    writeFile(tmpDir, 'src/main.js', 'console.log("hello")');
    runGsdTools(['complete-task', 'feat(1-1): scaffold', '--scope', '1-1', '--phase', '1', '--plan', '1', '--task', '1', '--files', 'src/main.js'], tmpDir);

    // Task 2
    writeFile(tmpDir, 'src/wire.js', 'module.exports = {}');
    const r2 = runGsdTools(['complete-task', 'feat(1-1): wire', '--scope', '1-1', '--phase', '1', '--plan', '1', '--task', '2', '--files', 'src/wire.js'], tmpDir);

    assert.ok(r2.success, `complete-task task 2 should succeed: ${r2.error}`);
    const logPath = path.join(tmpDir, phaseDir, '1-1-TASK-LOG.jsonl');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 2, 'task log should have 2 entries after two tasks');
  });

  test('verify integrity is coherent after sequential tasks', () => {
    // Complete 2 sequential tasks
    writeFile(tmpDir, 'src/main.js', 'x');
    runGsdTools(['complete-task', 'feat(1-1): t1', '--scope', '1-1', '--phase', '1', '--plan', '1', '--task', '1', '--files', 'src/main.js'], tmpDir);
    writeFile(tmpDir, 'src/wire.js', 'y');
    runGsdTools(['complete-task', 'feat(1-1): t2', '--scope', '1-1', '--phase', '1', '--plan', '1', '--task', '2', '--files', 'src/wire.js'], tmpDir);

    const r = runGsdTools(['verify', 'integrity', '--phase', '1', '--plan', '1'], tmpDir);
    assert.ok(r.success, `verify integrity should exit 0: ${r.error}\n${r.output}`);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.coherent, true, `integrity should be coherent: ${JSON.stringify(out.errors)}`);
    assert.strictEqual(out.errors.length, 0, `no errors expected: ${JSON.stringify(out.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: complete-task rejects non-sequential task number
// ─────────────────────────────────────────────────────────────────────────────

describe('workflow-scenario: complete-task enforces sequential numbering', () => {
  let tmpDir;
  let phaseDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    phaseDir = setupPhase(tmpDir, '1', '1');
    execSync('git add -A && git commit -m "setup"', { cwd: tmpDir, stdio: 'pipe', shell: true });
  });
  afterEach(() => { cleanup(tmpDir); });

  test('complete-task task 3 fails when last log entry is task 1 (skip detected)', () => {
    // Complete task 1
    writeFile(tmpDir, 'src/main.js', 'x');
    runGsdTools(['complete-task', 'feat(1-1): t1', '--scope', '1-1', '--phase', '1', '--plan', '1', '--task', '1', '--files', 'src/main.js'], tmpDir);

    // Try to skip to task 3
    writeFile(tmpDir, 'src/skip.js', 'z');
    const r = runGsdTools(['complete-task', 'feat(1-1): t3', '--scope', '1-1', '--phase', '1', '--plan', '1', '--task', '3', '--files', 'src/skip.js'], tmpDir);

    assert.strictEqual(r.success, false, 'complete-task should fail when skipping task 2');
    const out = JSON.parse(r.output);
    assert.ok(out.errors?.some(e => /task number gap/i.test(e) || /expected task 2/i.test(e)),
      `Error should mention task gap: ${JSON.stringify(out.errors)}`);
  });

  test('complete-task task 2 fails when log is empty (expected task 1 first)', () => {
    // No prior tasks — task 2 should be rejected
    writeFile(tmpDir, 'src/main.js', 'x');
    const r = runGsdTools(['complete-task', 'feat(1-1): t2', '--scope', '1-1', '--phase', '1', '--plan', '1', '--task', '2', '--files', 'src/main.js'], tmpDir);

    assert.strictEqual(r.success, false, 'complete-task should fail when task 2 is first entry');
    const out = JSON.parse(r.output);
    assert.ok(out.errors?.some(e => /task number gap/i.test(e) || /expected task 1/i.test(e)),
      `Error should mention expected task 1: ${JSON.stringify(out.errors)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: complete-task requires all three context flags
// ─────────────────────────────────────────────────────────────────────────────

describe('workflow-scenario: complete-task requires phase/plan/task', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    setupPhase(tmpDir, '1', '1');
    execSync('git add -A && git commit -m "setup"', { cwd: tmpDir, stdio: 'pipe', shell: true });
  });
  afterEach(() => { cleanup(tmpDir); });

  test('complete-task without --phase exits 1', () => {
    writeFile(tmpDir, 'src/x.js', 'x');
    const r = runGsdTools(['complete-task', 'feat(1-1): x', '--scope', '1-1', '--plan', '1', '--task', '1', '--files', 'src/x.js'], tmpDir);
    assert.strictEqual(r.success, false, 'should fail without --phase');
  });

  test('complete-task without --task exits 1', () => {
    writeFile(tmpDir, 'src/x.js', 'x');
    const r = runGsdTools(['complete-task', 'feat(1-1): x', '--scope', '1-1', '--phase', '1', '--plan', '1', '--files', 'src/x.js'], tmpDir);
    assert.strictEqual(r.success, false, 'should fail without --task');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: verify integrity detects orphaned CHECKPOINT.md
// ─────────────────────────────────────────────────────────────────────────────

describe('workflow-scenario: verify integrity detects orphaned checkpoint', () => {
  let tmpDir;
  let phaseDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    phaseDir = setupPhase(tmpDir, '1', '1');
    execSync('git add -A && git commit -m "setup"', { cwd: tmpDir, stdio: 'pipe', shell: true });
  });
  afterEach(() => { cleanup(tmpDir); });

  test('non-resolved CHECKPOINT.md with no pending gate surfaces warning', () => {
    // Write a non-resolved CHECKPOINT.md (simulating executor that wrote checkpoint but gate wasn't created)
    writeFile(tmpDir, `${phaseDir}/CHECKPOINT.md`, [
      '---',
      'status: awaiting-response',
      'why_blocked: "Need human review"',
      'what_is_uncertain: "Layout alignment"',
      '---',
      '# Checkpoint',
    ].join('\n'));
    execSync(`git add "${phaseDir}/CHECKPOINT.md" && git commit -m "chore(1-1): add checkpoint"`,
      { cwd: tmpDir, stdio: 'pipe', shell: true });

    const r = runGsdTools(['verify', 'integrity', '--phase', '1', '--plan', '1'], tmpDir);
    // Integrity may still be coherent (no errors) but should have a stop-severity warning
    const out = JSON.parse(r.output);
    const hasOrphanWarning = out.warnings?.some(w =>
      /checkpoint.*no pending gate|checkpoint.*unresolvable|CHECKPOINT\.md exists.*awaiting/i.test(w.message || w)
    );
    assert.ok(hasOrphanWarning,
      `verify integrity should warn about orphaned CHECKPOINT.md: ${JSON.stringify(out.warnings)}`);
  });
});
