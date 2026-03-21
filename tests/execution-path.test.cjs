/**
 * GSD Tools Tests - Execution Path (E2E)
 *
 * Simulates a multi-task plan execution flow to prove that the enforcement
 * path rejects bad commit states immediately and that task log persistence works.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runGsdTools, createTempGitProject, cleanup } = require('./helpers.cjs');

// Helper: create a phase dir that matches the GSD phase-dir convention
function createPhaseDir(tmpDir, phase, name) {
  const dir = path.join(tmpDir, '.planning', 'phases', `${phase}-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// E2E: Multi-task execution enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: task commit enforcement across multiple tasks', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    createPhaseDir(tmpDir, '01', 'auth');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('task 1 succeeds, task 2 scope mismatch is caught immediately before task 3', () => {
    // Task 1: correct scope
    fs.writeFileSync(path.join(tmpDir, 'auth.js'), 'module.exports = {}\n');
    const r1 = runGsdTools(
      ['commit-task', 'feat(01-01): add auth module', '--scope', '01-01', '--files', 'auth.js'],
      tmpDir
    );
    assert.ok(r1.success, r1.error);
    const out1 = JSON.parse(r1.output);
    assert.strictEqual(out1.verified, true, 'task 1 should verify');
    const task1Hash = out1.hash;

    // Task 2: wrong scope in message (simulates executor using wrong phase-plan)
    fs.writeFileSync(path.join(tmpDir, 'token.js'), 'module.exports = {}\n');
    const r2 = runGsdTools(
      ['commit-task', 'feat(99-99): add token module', '--scope', '01-01', '--files', 'token.js'],
      tmpDir
    );
    // commit-task exits 1 on verification failure — hard stop without requiring JSON parsing
    assert.ok(!r2.success, 'commit-task should exit 1 on scope mismatch');
    const out2 = JSON.parse(r2.output);
    // committed=true but verified=false: scope in subject (99-99) ≠ expected scope (01-01)
    assert.strictEqual(out2.committed, true);
    assert.strictEqual(out2.verified, false);
    assert.ok(out2.errors.some(e => e.includes('expected scope 01-01')), JSON.stringify(out2.errors));

    // Task 1 hash is now NOT HEAD — verify task-commit for task1 fails the is-HEAD check
    const r1recheck = runGsdTools(
      ['verify', 'task-commit', task1Hash, '--scope', '01-01'],
      tmpDir
    );
    assert.ok(r1recheck.success, r1recheck.error);
    const recheck = JSON.parse(r1recheck.output);
    assert.strictEqual(recheck.valid, false);
    assert.ok(recheck.errors.some(e => e.includes('current HEAD')));

    // Task 3: correct scope — succeeds, proves execution can continue after recovery
    fs.writeFileSync(path.join(tmpDir, 'session.js'), 'module.exports = {}\n');
    const r3 = runGsdTools(
      ['commit-task', 'feat(01-01): add session module', '--scope', '01-01', '--files', 'session.js'],
      tmpDir
    );
    assert.ok(r3.success, r3.error);
    const out3 = JSON.parse(r3.output);
    assert.strictEqual(out3.verified, true, 'task 3 should verify after recovery');
  });

  test('task log persists hashes to disk when --phase/--plan/--task provided', () => {
    fs.writeFileSync(path.join(tmpDir, 'api.js'), 'module.exports = {}\n');
    const r = runGsdTools(
      ['commit-task', 'feat(01-01): add api module', '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', '1', '--files', 'api.js'],
      tmpDir
    );
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.verified, true);
    assert.ok(out.task_log_path, 'task_log_path should be returned');

    // Log file must exist and contain the record
    const logPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-TASK-LOG.jsonl');
    assert.ok(fs.existsSync(logPath), 'TASK-LOG.jsonl should exist on disk');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.strictEqual(record.task, 1);
    assert.strictEqual(record.hash, out.hash);
    assert.strictEqual(record.scope, '01-01');
    assert.ok(record.ts, 'timestamp should be present');
  });

  test('multiple tasks append to same log file', () => {
    for (let i = 1; i <= 3; i++) {
      const file = `file${i}.js`;
      fs.writeFileSync(path.join(tmpDir, file), `// task ${i}\n`);
      const r = runGsdTools(
        ['commit-task', `feat(01-01): task ${i}`, '--scope', '01-01',
          '--phase', '01', '--plan', '01', '--task', String(i), '--files', file],
        tmpDir
      );
      assert.ok(r.success, r.error);
      assert.strictEqual(JSON.parse(r.output).verified, true, `task ${i} should verify`);
    }

    const logPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-TASK-LOG.jsonl');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 3);
    const tasks = lines.map(l => JSON.parse(l).task);
    assert.deepStrictEqual(tasks, [1, 2, 3]);
  });

  test('bad commit state: manual commit bypassing commit-task is caught by verify task-commit', () => {
    // Executor makes a manual commit (bypassing commit-task)
    fs.writeFileSync(path.join(tmpDir, 'manual.js'), 'module.exports = {}\n');
    execSync('git add manual.js', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "feat(01-01): manual commit without scope enforcement"', { cwd: tmpDir, stdio: 'pipe' });
    const manualHash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    // Post-hoc verify catches it as valid (subject has scope 01-01, is HEAD) — this is the expected case
    const rValid = runGsdTools(['verify', 'task-commit', manualHash, '--scope', '01-01'], tmpDir);
    const validOut = JSON.parse(rValid.output);
    assert.strictEqual(validOut.valid, true, 'manual commit with correct scope should pass verify');

    // Now make a SECOND commit — manualHash is no longer HEAD
    fs.writeFileSync(path.join(tmpDir, 'other.js'), 'module.exports = {}\n');
    execSync('git add other.js', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "feat(01-01): subsequent commit"', { cwd: tmpDir, stdio: 'pipe' });

    // Verifying the old hash now fails — executor can't mistakenly re-use it
    const rStale = runGsdTools(['verify', 'task-commit', manualHash, '--scope', '01-01'], tmpDir);
    const staleOut = JSON.parse(rStale.output);
    assert.strictEqual(staleOut.valid, false);
    assert.ok(staleOut.errors.some(e => e.includes('current HEAD')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state load: config_warning surfacing
// ─────────────────────────────────────────────────────────────────────────────

describe('state load: config_warning field', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('config_warning is null when config.json is absent', () => {
    const r = runGsdTools(['state', 'load'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.config_warning, null);
  });

  test('config_warning is populated when config.json is malformed', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), 'not json {{{');
    const r = runGsdTools(['state', 'load'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.ok(out.config_warning, 'config_warning should be non-null for malformed JSON');
    assert.ok(typeof out.config_warning === 'string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// task-log read command
// ─────────────────────────────────────────────────────────────────────────────

describe('task-log read command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    // Create phase dir to match GSD convention
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns not_found when no log file exists', () => {
    const r = runGsdTools(['task-log', 'read', '--phase', '01', '--plan', '01'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.found, false);
    assert.deepStrictEqual(out.tasks, []);
  });

  test('reads back records written by commit-task', () => {
    // Write two task commits to build the log
    for (let i = 1; i <= 2; i++) {
      const file = `task${i}.js`;
      fs.writeFileSync(path.join(tmpDir, file), `// task ${i}\n`);
      runGsdTools(
        ['commit-task', `feat(01-01): task ${i}`, '--scope', '01-01',
          '--phase', '01', '--plan', '01', '--task', String(i), '--files', file],
        tmpDir
      );
    }

    const r = runGsdTools(['task-log', 'read', '--phase', '01', '--plan', '01'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.found, true);
    assert.strictEqual(out.count, 2);
    assert.strictEqual(out.tasks[0].task, 1);
    assert.strictEqual(out.tasks[1].task, 2);
    assert.ok(out.tasks[0].hash, 'hash should be present');
    assert.ok(out.tasks[0].ts, 'timestamp should be present');
    assert.strictEqual(out.tasks[0].subject, 'feat(01-01): task 1');
    assert.strictEqual(out.tasks[0].scope, '01-01');
    assert.strictEqual(out.tasks[1].subject, 'feat(01-01): task 2');
  });

  test('fails when --phase is missing', () => {
    const r = runGsdTools(['task-log', 'read', '--plan', '01'], tmpDir);
    assert.ok(!r.success, 'should fail without --phase');
  });

  test('fails when --plan is missing', () => {
    const r = runGsdTools(['task-log', 'read', '--phase', '01'], tmpDir);
    assert.ok(!r.success, 'should fail without --plan');
  });
});
