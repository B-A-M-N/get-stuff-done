/**
 * E2E Enforcement Tests
 *
 * One test per hard-stop class to prove the enforcement boundary is real:
 *   1. Gate pending stops flow           (gate enforce exits 1)
 *   2. Missing checkpoint blocks         (verify checkpoint-coverage → bypass_suspected)
 *   3. Bad task commit blocks            (commit-task scope mismatch exits 1)
 *   4. Released gate allows resume       (gate release → gate check → clear → enforce exits 0 in yolo)
 *   5. health degraded-mode surfaces all active warnings
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runGsdTools, createTempProject, createTempGitProject, cleanup } = require('./helpers.cjs');

function writeConfig(tmpDir, obj) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify(obj, null, 2), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Gate pending stops flow
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: gate pending stops flow', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('gate enforce exits 1 in interactive mode — flow cannot continue', () => {
    writeConfig(tmpDir, { mode: 'interactive' });

    const r = runGsdTools(['gate', 'enforce', '--key', 'gates.execute_next_plan'], tmpDir);

    // Hard stop: non-zero exit code
    assert.strictEqual(r.success, false, 'gate enforce must exit 1 when gate is active');
    const out = JSON.parse(r.output);
    assert.strictEqual(out.blocked, true);
    assert.strictEqual(out.reason, 'interactive_mode');
  });

  test('gate enforce exits 1 in interactive mode even when gate explicitly enabled in config', () => {
    writeConfig(tmpDir, { mode: 'interactive', gates: { execute_next_plan: true } });

    const r = runGsdTools(['gate', 'enforce', '--key', 'gates.execute_next_plan'], tmpDir);
    assert.strictEqual(r.success, false, 'interactive mode always enforces regardless of explicit gate config');
  });

  test('gate check reports pending after enforce blocks — flow stays stopped', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);

    const check = runGsdTools(['gate', 'check', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(check.success, check.error);
    const state = JSON.parse(check.output);
    assert.strictEqual(state.clear, false, 'gate should remain pending after enforce blocked');
    assert.strictEqual(state.pending, true);
  });

  test('second gate enforce call also exits 1 while gate is pending', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);

    // Second call without release — still blocked
    const r2 = runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    assert.strictEqual(r2.success, false, 'repeated enforce without release should still exit 1');
  });
});

describe('enforcement: typed proof and runtime proof', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempGitProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('behavior-changing task without execution evidence exits 1 and writes failure artifact', () => {
    fs.writeFileSync(path.join(tmpDir, 'feature.js'), 'module.exports = {}\n');

    const r = runGsdTools(
      ['commit-task', 'feat(01-01): feature', '--scope', '01-01',
        '--proof-type', 'behavioral',
        '--verify-command', 'node --test tests/feature.test.cjs',
        '--files', 'feature.js'],
      tmpDir
    );

    assert.strictEqual(r.success, false, 'behavioral task without evidence should fail');
    const out = JSON.parse(r.output);
    assert.ok(out.errors.some(e => e.includes('Behavior-changing tasks require execution evidence')));
    assert.ok(out.failure_artifact_path, 'failure artifact path should be returned');

    const failureLines = fs.readFileSync(out.failure_artifact_path, 'utf-8').trim().split('\n').filter(Boolean);
    const failure = JSON.parse(failureLines[failureLines.length - 1]);
    assert.strictEqual(failure.status, 'INVALID');
    assert.strictEqual(failure.proof_type, 'behavioral');
  });

  test('runtime-facing task without runtime proof exits 1 and writes failure artifact', () => {
    fs.writeFileSync(path.join(tmpDir, 'cli.js'), 'module.exports = {}\n');

    const r = runGsdTools(
      ['commit-task', 'feat(01-01): cli', '--scope', '01-01',
        '--proof-type', 'behavioral',
        '--verify-command', 'node --test tests/cli.test.cjs',
        '--evidence', 'node --test tests/cli.test.cjs',
        '--runtime-surface',
        '--files', 'cli.js'],
      tmpDir
    );

    assert.strictEqual(r.success, false, 'runtime-facing task without runtime proof should fail');
    const out = JSON.parse(r.output);
    assert.ok(out.errors.some(e => e.includes('Runtime-facing tasks require installed/runtime proof')));
    assert.ok(out.failure_artifact_path, 'failure artifact path should be returned');
  });

  test('proof-only audit task succeeds when explicit evidence is supplied', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'existing.md'), '# existing\n');

    const r = runGsdTools(
      ['commit-task', 'docs(01-01): audit existing state', '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', '1',
        '--proof-only', '--proof-type', 'audit',
        '--verify-command', 'node get-stuff-done/bin/gsd-tools.cjs verify integrity --phase 01 --plan 01',
        '--evidence', 'file:existing.md',
        '--files', 'existing.md'],
      tmpDir
    );

    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.committed, false);
    assert.strictEqual(out.verified, true);
    const logPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-TASK-LOG.jsonl');
    const entry = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim().split('\n')[0]);
    assert.strictEqual(entry.proof_mode, 'proof_only');
    assert.strictEqual(entry.canonical_commit, null);
  });

  test('phase 71 integrity requires structured proof index agreement', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '71-proof');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'feature.js'), 'module.exports = {}\n');

    const r = runGsdTools(
      ['commit-task', 'feat(71-01): feature', '--scope', '71-01',
        '--phase', '71', '--plan', '01', '--task', '1',
        '--proof-type', 'behavioral',
        '--verify-command', 'node --test tests/feature.test.cjs',
        '--evidence', 'node --test tests/feature.test.cjs',
        '--files', 'feature.js'],
      tmpDir
    );
    assert.ok(r.success, r.error);
    const hash = JSON.parse(r.output).hash;

    fs.writeFileSync(path.join(phaseDir, '71-01-SUMMARY.md'), [
      '---',
      'phase: 71',
      'plan: 01',
      'subsystem: truth',
      'tags: [proof]',
      'provides: [proof-chain]',
      'duration: 5min',
      'completed: 2026-03-27',
      '---',
      '# Summary',
      '',
      '- **Tasks:** 1',
      '',
      '## Task Commits',
      '',
      `- Task 1: ${hash}`,
      '',
      '## Proof Index',
      '',
      '```json',
      JSON.stringify([
        {
          task: 1,
          canonical_commit: hash,
          files: ['feature.js'],
          verify: 'node --test tests/feature.test.cjs',
          evidence: ['node --test tests/feature.test.cjs'],
          runtime_required: false,
          runtime_proof: [],
        },
      ], null, 2),
      '```',
    ].join('\n'));

    const ri = runGsdTools(['verify', 'integrity', '--phase', '71', '--plan', '01'], tmpDir);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.checks.task_log_summary_agreement.pass, true, JSON.stringify(out.checks.task_log_summary_agreement));
  });
});

describe('enforcement: hardened verification artifact validation', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('verification-artifact rejects blocker anti-patterns that claim CONDITIONAL instead of INVALID', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '72-verification');
    fs.mkdirSync(phaseDir, { recursive: true });
    const verificationPath = path.join(phaseDir, '72-VERIFICATION.md');

    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-verification',
      'verified: 2026-03-27T19:30:00Z',
      'status: CONDITIONAL',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Runtime verification is enforced | VALID | `get-stuff-done/bin/lib/verify.cjs` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | VALID | `get-stuff-done/bin/lib/verify.cjs`, `node --check get-stuff-done/bin/lib/verify.cjs` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| src/live-path.js | `return mockResponse` | blocker | Mocked logic presented as real |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Blocker anti-pattern remains active"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"CONDITIONAL","reason":"Incorrect downgrade for blocker."}',
      '```',
    ].join('\n'));

    const r = runGsdTools(['verify', 'verification-artifact', '.planning/phases/72-verification/72-VERIFICATION.md'], tmpDir);
    assert.strictEqual(r.success, true, 'validator should return structured JSON even when artifact is invalid');
    const out = JSON.parse(r.output);
    assert.strictEqual(out.valid, false);
    assert.ok(out.errors.some(err => err.includes('Final Status must be INVALID')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Missing checkpoint artifact blocks completion
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: missing checkpoint artifact blocks completion', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('bypass_suspected when plan has checkpoint tasks but no CHECKPOINT.md', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-PLAN.md');
    fs.writeFileSync(planPath, '<task id="1" type="checkpoint:human-verify">Verify deployment</task>\n');

    const r = runGsdTools(
      ['verify', 'checkpoint-coverage', '.planning/phases/01-auth/01-01-PLAN.md', '--phase', '01'],
      tmpDir
    );
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.bypass_suspected, true, 'no CHECKPOINT.md with checkpoint tasks = bypass suspected');
    assert.strictEqual(out.checkpoint_file_exists, false);
  });

  test('bypass_suspected false when CHECKPOINT.md exists — legitimate checkpoint hit', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-PLAN.md');
    fs.writeFileSync(planPath, '<task id="1" type="checkpoint:decision">Choose strategy</task>\n');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'phases', '01-auth', 'CHECKPOINT.md'),
      '---\nstatus: pending\ntype: decision\n---\n'
    );

    const r = runGsdTools(
      ['verify', 'checkpoint-coverage', '.planning/phases/01-auth/01-01-PLAN.md', '--phase', '01'],
      tmpDir
    );
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.bypass_suspected, false, 'CHECKPOINT.md present = legitimate stop, not bypass');
  });

  test('plans without checkpoint tasks are always ok', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-PLAN.md');
    fs.writeFileSync(planPath, '<task id="1" type="implement">Build feature</task>\n');

    const r = runGsdTools(
      ['verify', 'checkpoint-coverage', '.planning/phases/01-auth/01-01-PLAN.md', '--phase', '01'],
      tmpDir
    );
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.has_checkpoints, false);
    assert.strictEqual(out.bypass_suspected, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bad task commit blocks progression
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: bad task commit exits 1', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempGitProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('commit-task exits 1 on scope mismatch — bash if! halts without JSON parsing', () => {
    fs.writeFileSync(path.join(tmpDir, 'feature.js'), 'module.exports = {}\n');

    const r = runGsdTools(
      ['commit-task', 'feat(99-01): wrong phase', '--scope', '01-01', '--files', 'feature.js'],
      tmpDir
    );

    // Hard stop: non-zero exit
    assert.strictEqual(r.success, false, 'commit-task must exit 1 when scope does not match');
    const out = JSON.parse(r.output);
    assert.strictEqual(out.committed, true, 'commit happened but verification failed');
    assert.strictEqual(out.verified, false);
    assert.ok(out.errors.some(e => e.includes('expected scope 01-01')));
  });

  test('commit-task exits 0 on correct scope — progression is unblocked', () => {
    fs.writeFileSync(path.join(tmpDir, 'feature.js'), 'module.exports = {}\n');

    const r = runGsdTools(
      ['commit-task', 'feat(01-01): add feature', '--scope', '01-01', '--files', 'feature.js'],
      tmpDir
    );

    assert.ok(r.success, `correct commit should exit 0: ${r.error}`);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.verified, true);
    assert.ok(out.hash);
  });

  test('commit-task nothing_to_commit exits 1 — prevents false progress', () => {
    fs.writeFileSync(path.join(tmpDir, 'existing.js'), 'same\n');
    execSync('git add existing.js', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "chore: initial"', { cwd: tmpDir, stdio: 'pipe' });

    const r = runGsdTools(
      ['commit-task', 'feat(01-01): re-commit unchanged', '--scope', '01-01', '--files', 'existing.js'],
      tmpDir
    );
    assert.strictEqual(r.success, false, 'nothing_to_commit should exit 1');
    const out = JSON.parse(r.output);
    assert.strictEqual(out.committed, false);
    assert.ok(out.errors.some(e => e.includes('nothing to commit')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3b. commit-task --prev-hash continuity enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: commit-task --prev-hash continuity check', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempGitProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('passes when prev-hash matches HEAD — normal two-task sequence', () => {
    // Task 1
    fs.writeFileSync(path.join(tmpDir, 'task1.js'), 'module.exports = {}\n');
    const r1 = runGsdTools(
      ['commit-task', 'feat(01-01): task 1', '--scope', '01-01', '--files', 'task1.js'],
      tmpDir
    );
    assert.ok(r1.success, r1.error);
    const hash1 = JSON.parse(r1.output).hash;

    // Task 2 with prev-hash pointing to task 1 — should pass
    fs.writeFileSync(path.join(tmpDir, 'task2.js'), 'module.exports = {}\n');
    const r2 = runGsdTools(
      ['commit-task', 'feat(01-01): task 2', '--scope', '01-01', '--files', 'task2.js', '--prev-hash', hash1],
      tmpDir
    );
    assert.ok(r2.success, `task 2 with correct prev-hash should pass: ${r2.error}`);
    assert.strictEqual(JSON.parse(r2.output).verified, true);
  });

  test('exits 1 when prev-hash is stale — out-of-band commit detected before staging', () => {
    // Task 1
    fs.writeFileSync(path.join(tmpDir, 'task1.js'), 'module.exports = {}\n');
    const r1 = runGsdTools(
      ['commit-task', 'feat(01-01): task 1', '--scope', '01-01', '--files', 'task1.js'],
      tmpDir
    );
    const hash1 = JSON.parse(r1.output).hash;

    // Out-of-band commit happens between task 1 and task 2
    fs.writeFileSync(path.join(tmpDir, 'oob.js'), 'oob\n');
    execSync('git add oob.js', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "manual: out-of-band"', { cwd: tmpDir, stdio: 'pipe' });

    // Task 2 with stale prev-hash — must fail before touching working tree
    fs.writeFileSync(path.join(tmpDir, 'task2.js'), 'module.exports = {}\n');
    const r2 = runGsdTools(
      ['commit-task', 'feat(01-01): task 2', '--scope', '01-01', '--files', 'task2.js', '--prev-hash', hash1],
      tmpDir
    );
    assert.strictEqual(r2.success, false, 'stale prev-hash should exit 1');
    const out = JSON.parse(r2.output);
    assert.strictEqual(out.committed, false, 'no commit should be made when continuity check fails');
    assert.ok(out.errors.some(e => e.includes('Continuity check failed')));
    assert.ok(out.errors.some(e => e.includes(hash1)));

    // Verify task2.js was NOT staged (working tree unchanged)
    const status = execSync('git status --short', { cwd: tmpDir, encoding: 'utf-8' });
    assert.ok(status.includes('task2.js'), 'task2.js should remain unstaged after continuity failure');
    assert.ok(!status.startsWith('A '), 'task2.js should not be in the index');
  });

  test('omitting --prev-hash on first task works normally (no continuity constraint)', () => {
    fs.writeFileSync(path.join(tmpDir, 'first.js'), 'module.exports = {}\n');
    const r = runGsdTools(
      ['commit-task', 'feat(01-01): first task', '--scope', '01-01', '--files', 'first.js'],
      tmpDir
    );
    assert.ok(r.success, `first task without prev-hash should pass: ${r.error}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Released gate allows auto-advance resume
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: released gate allows auto-advance resume', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('full cycle: enforce blocks → release clears → check reports clear', () => {
    writeConfig(tmpDir, { mode: 'interactive' });

    // Step 1: enforce blocks
    const r1 = runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    assert.strictEqual(r1.success, false, 'should be blocked');

    // Step 2: human acknowledges — release
    const r2 = runGsdTools(['gate', 'release', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(r2.success, r2.error);
    assert.strictEqual(JSON.parse(r2.output).was_blocked, true);

    // Step 3: check reports clear — auto-advance can proceed
    const r3 = runGsdTools(['gate', 'check', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(r3.success, r3.error);
    const state = JSON.parse(r3.output);
    assert.strictEqual(state.clear, true, 'gate should be clear after release');
    assert.strictEqual(state.pending, false);
    assert.strictEqual(state.released, true);
    assert.ok(state.released_at, 'released_at timestamp should be set');
  });

  test('gate enforce in yolo mode after release does not re-block (yolo always clears)', () => {
    writeConfig(tmpDir, { mode: 'yolo' });

    // In yolo mode enforce should never block — no release needed
    const r = runGsdTools(['gate', 'enforce', '--key', 'gates.execute_next_plan'], tmpDir);
    assert.ok(r.success, `yolo mode should never block: ${r.error}`);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.blocked, false);
    assert.strictEqual(out.reason, 'yolo_mode');
  });

  test('released artifact preserves audit trail of when it was blocked', () => {
    writeConfig(tmpDir, { mode: 'interactive' });

    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    const before = Date.now();
    runGsdTools(['gate', 'release', '--key', 'gates.confirm_plan'], tmpDir);
    const after = Date.now();

    const releasedPath = path.join(tmpDir, '.planning', 'gates', 'gates_confirm_plan-released.json');
    assert.ok(fs.existsSync(releasedPath), 'released artifact should exist');
    const record = JSON.parse(fs.readFileSync(releasedPath, 'utf-8'));
    assert.ok(record.blocked_at, 'blocked_at carries over from pending');
    assert.ok(record.released_at, 'released_at is set');
    assert.ok(new Date(record.released_at).getTime() >= before - 1000, 'released_at is recent');
    assert.ok(new Date(record.released_at).getTime() <= after + 1000, 'released_at is recent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. health degraded-mode surfaces all active warnings
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: health degraded-mode', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('config_ok true and no gate warnings when config is valid and no gates pending', () => {
    writeConfig(tmpDir, { mode: 'yolo' });
    const r = runGsdTools(['health', 'degraded-mode'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    // config is valid: no config-related warnings
    assert.strictEqual(out.config_ok, true);
    assert.deepStrictEqual(out.warnings.filter(w => w.includes('config')), []);
    // no pending gates
    assert.deepStrictEqual(out.gate_pending_keys, []);
    assert.ok(!out.warnings.some(w => w.includes('Gate pending')));
    assert.ok(['HEALTHY', 'DEGRADED', 'UNSAFE'].includes(out.canonical_state));
  });

  test('reports degraded when config.json is malformed', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), 'not-json{{{');
    const r = runGsdTools(['health', 'degraded-mode'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.degraded, true);
    assert.strictEqual(out.config_ok, false);
    assert.ok(out.warnings.some(w => w.includes('config.json')));
    assert.ok(out.fallbacks.length > 0, 'fallbacks should describe what defaults are in use');
    assert.strictEqual(out.subsystems.planning_truth.canonical_state, 'DEGRADED');
  });

  test('reports degraded when a gate is pending', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir); // creates pending

    const r = runGsdTools(['health', 'degraded-mode'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.degraded, true);
    assert.ok(out.gate_pending_keys.length > 0, 'pending gate key should be listed');
    assert.ok(out.warnings.some(w => w.includes('Gate pending')));
    assert.strictEqual(out.subsystems.planning_truth.canonical_state, 'DEGRADED');
  });

  test('reports ok after gate is released', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    runGsdTools(['gate', 'release', '--key', 'gates.confirm_plan'], tmpDir);

    const r = runGsdTools(['health', 'degraded-mode'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.gate_pending_keys.length, 0, 'no pending gates after release');
    // degraded may still be true if planning files are missing, but pending gates are gone
    assert.ok(!out.warnings.some(w => w.includes('Gate pending')), 'no gate-pending warning after release');
  });
});

describe('enforcement: governance narrowing preserves hard backstops', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('warn-only state inspection does not weaken verify integrity blocking under unsafe posture', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'drift'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');

    const stateView = runGsdTools(['state', 'json', '--raw'], tmpDir, {
      env: { GSD_MEMORY_MODE: 'sqlite', NODE_NO_WARNINGS: '1' },
    });
    assert.strictEqual(stateView.success, true, stateView.error);

    const integrity = runGsdTools(['verify', 'integrity', '--raw'], tmpDir, {
      env: { GSD_MEMORY_MODE: 'sqlite', NODE_NO_WARNINGS: '1' },
    });
    assert.strictEqual(integrity.success, false, 'verify integrity must remain blocked under unsafe truth posture');
    const out = JSON.parse(integrity.output);
    assert.strictEqual(out.canonical_state, 'UNSAFE');
    assert.ok(['drift_truth', 'reconciliation_truth'].includes(out.subsystem));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. verify integrity — coherence audit
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: verify integrity', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempGitProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('coherent after clean two-task sequence with prev-hash', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });

    // Task 1
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'module.exports = {}\n');
    const r1 = runGsdTools(
      ['commit-task', 'feat(01-01): task 1', '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', '1', '--files', 'a.js'],
      tmpDir
    );
    assert.ok(r1.success, r1.error);
    const hash1 = JSON.parse(r1.output).hash;

    // Task 2 with prev-hash
    fs.writeFileSync(path.join(tmpDir, 'b.js'), 'module.exports = {}\n');
    const r2 = runGsdTools(
      ['commit-task', 'feat(01-01): task 2', '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', '2',
        '--prev-hash', hash1, '--files', 'b.js'],
      tmpDir
    );
    assert.ok(r2.success, r2.error);

    // Integrity should be coherent
    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    assert.ok(ri.success, ri.error);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.coherent, true, `expected coherent: ${JSON.stringify(out.errors)}`);
    assert.strictEqual(out.checks.head_matches_task_log.pass, true);
    assert.strictEqual(out.checks.no_pending_gates.pass, true);
    assert.strictEqual(out.checks.task_log_commits_exist.pass, true);
    assert.strictEqual(out.checks.task_log_commits_exist.checked, 2);
  });

  test('incoherent when pending gate exists', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);

    const ri = runGsdTools(['verify', 'integrity'], tmpDir);
    assert.ok(ri.success, ri.error);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.coherent, false);
    assert.strictEqual(out.checks.no_pending_gates.pass, false);
    assert.ok(out.errors.some(e => e.includes('Pending gate')));
  });

  test('incoherent when HEAD does not match last task log entry', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });

    // Commit task 1
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'module.exports = {}\n');
    runGsdTools(
      ['commit-task', 'feat(01-01): task 1', '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', '1', '--files', 'a.js'],
      tmpDir
    );

    // Out-of-band commit moves HEAD past the task log entry
    fs.writeFileSync(path.join(tmpDir, 'oob.js'), 'oob\n');
    execSync('git add oob.js', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "manual: oob"', { cwd: tmpDir, stdio: 'pipe' });

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    assert.ok(ri.success, ri.error);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.coherent, false);
    assert.strictEqual(out.checks.head_matches_task_log.pass, false);
    assert.ok(out.errors.some(e => e.includes('out-of-band commit')));
  });

  test('coherent with no phase/plan — only checks gates', () => {
    writeConfig(tmpDir, { mode: 'yolo' });
    const ri = runGsdTools(['verify', 'integrity'], tmpDir);
    assert.ok(ri.success, ri.error);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.coherent, true);
    assert.ok(out.checks.head_matches_task_log.note.includes('skipped'));
    assert.ok(out.checks.task_log_commits_exist.note.includes('skipped'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. task-log recovery reconstructs summary inputs after context reset
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: task-log recovery after context reset', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
  });
  afterEach(() => { cleanup(tmpDir); });

  test('task-log read recovers all hashes after simulated reset', () => {
    // Simulate 3 tasks committed by the executor
    const expectedHashes = [];
    for (let i = 1; i <= 3; i++) {
      const file = `task${i}.js`;
      fs.writeFileSync(path.join(tmpDir, file), `// task ${i}\n`);
      const r = runGsdTools(
        ['commit-task', `feat(01-01): task ${i}`, '--scope', '01-01',
          '--phase', '01', '--plan', '01', '--task', String(i), '--files', file],
        tmpDir
      );
      assert.ok(r.success, `task ${i} commit failed: ${r.error}`);
      expectedHashes.push(JSON.parse(r.output).hash);
    }

    // Simulate context reset: TASK_COMMITS array is gone
    // Recovery: task-log read should return all 3 entries
    const r = runGsdTools(['task-log', 'read', '--phase', '01', '--plan', '01'], tmpDir);
    assert.ok(r.success, r.error);
    const out = JSON.parse(r.output);
    assert.strictEqual(out.found, true);
    assert.strictEqual(out.count, 3);

    // Every hash from the log matches what was committed
    for (let i = 0; i < 3; i++) {
      assert.strictEqual(out.tasks[i].hash, expectedHashes[i], `task ${i + 1} hash mismatch`);
      assert.strictEqual(out.tasks[i].task, i + 1);
      assert.ok(out.tasks[i].subject.includes(`feat(01-01): task ${i + 1}`));
    }
  });

  test('recovered hashes pass integrity check — log is coherent after recovery', () => {
    // Commit 2 tasks
    for (let i = 1; i <= 2; i++) {
      const file = `t${i}.js`;
      fs.writeFileSync(path.join(tmpDir, file), `// ${i}\n`);
      runGsdTools(
        ['commit-task', `feat(01-01): t${i}`, '--scope', '01-01',
          '--phase', '01', '--plan', '01', '--task', String(i), '--files', file],
        tmpDir
      );
    }

    // Integrity check confirms log entries are all valid commits
    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    assert.ok(ri.success, ri.error);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.checks.task_log_commits_exist.pass, true);
    assert.strictEqual(out.checks.task_log_commits_exist.checked, 2);
    assert.deepStrictEqual(out.checks.task_log_commits_exist.missing, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. verify integrity — extended checks (recovery, cross-artifact, multi-actor)
// ─────────────────────────────────────────────────────────────────────────────

describe('enforcement: verify integrity — extended', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
  });
  afterEach(() => { cleanup(tmpDir); });

  test('detects truncated last task log entry', () => {
    // Write a valid entry then a truncated one
    const logFile = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-TASK-LOG.jsonl');
    fs.writeFileSync(logFile, '{"task":1,"hash":"abc1234","subject":"feat(01-01): t1","scope":"01-01","ts":"2026-01-01T00:00:00.000Z"}\n{"task":2,"hash":"def\n', 'utf-8');

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    assert.ok(ri.success, ri.error);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.coherent, false);
    assert.strictEqual(out.checks.task_log_last_entry_valid.pass, false);
    assert.strictEqual(out.checks.task_log_last_entry_valid.truncated, true);
    assert.ok(out.errors.some(e => /truncated|interrupted/i.test(e)));
  });

  test('detects task log entry missing hash field', () => {
    const logFile = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-TASK-LOG.jsonl');
    fs.writeFileSync(logFile, '{"task":1,"subject":"feat(01-01): t1","scope":"01-01","ts":"2026-01-01T00:00:00.000Z"}\n', 'utf-8');

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    assert.ok(ri.success, ri.error);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.coherent, false);
    assert.strictEqual(out.checks.task_log_last_entry_valid.pass, false);
    assert.strictEqual(out.checks.task_log_last_entry_valid.missing_hash, true);
  });

  test('task log last entry valid when log is clean', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'x\n');
    const r = runGsdTools(
      ['commit-task', 'feat(01-01): t1', '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', '1', '--files', 'a.js'],
      tmpDir
    );
    assert.ok(r.success, r.error);

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.checks.task_log_last_entry_valid.pass, true);
    assert.strictEqual(out.checks.task_log_last_entry_valid.truncated, false);
  });

  test('commit-task records branch field in task log', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'x\n');
    const r = runGsdTools(
      ['commit-task', 'feat(01-01): t1', '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', '1', '--files', 'a.js'],
      tmpDir
    );
    assert.ok(r.success, r.error);

    const logFile = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-TASK-LOG.jsonl');
    const entry = JSON.parse(fs.readFileSync(logFile, 'utf-8').trim());
    assert.ok(typeof entry.branch === 'string', 'branch field should be a string');
    assert.ok(entry.branch.length > 0, 'branch field should not be empty');
  });

  test('branch consistency passes when all entries recorded on same branch', () => {
    for (let i = 1; i <= 2; i++) {
      const f = `t${i}.js`;
      fs.writeFileSync(path.join(tmpDir, f), `x\n`);
      runGsdTools(['commit-task', `feat(01-01): t${i}`, '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', String(i), '--files', f], tmpDir);
    }
    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.checks.task_log_branch_consistency.pass, true);
    assert.strictEqual(out.checks.task_log_branch_consistency.foreign_entries.length, 0);
  });

  test('branch consistency warns when log entry has different branch', () => {
    // Write a log entry with a fabricated different branch
    const logFile = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-TASK-LOG.jsonl');
    // First commit a real task so HEAD has a real hash
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'x\n');
    const r = runGsdTools(['commit-task', 'feat(01-01): t1', '--scope', '01-01',
      '--phase', '01', '--plan', '01', '--task', '1', '--files', 'a.js'], tmpDir);
    assert.ok(r.success, r.error);
    const hash = JSON.parse(r.output).hash;

    // Overwrite the log with an entry claiming a different branch
    fs.writeFileSync(logFile,
      JSON.stringify({ task: 1, hash, subject: 'feat(01-01): t1', scope: '01-01', branch: 'gsd/phase-02-other', ts: new Date().toISOString() }) + '\n',
      'utf-8'
    );

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.checks.task_log_branch_consistency.pass, false);
    assert.ok(out.checks.task_log_branch_consistency.foreign_entries.length > 0);
    // Branch mismatch is a stop-the-line warning
    const stopWarnings = out.warnings.filter(w => w.severity === 'stop');
    assert.ok(stopWarnings.some(w => /branch/i.test(w.message)));
  });

  test('ancestry check passes for normal commits', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'x\n');
    runGsdTools(['commit-task', 'feat(01-01): t1', '--scope', '01-01',
      '--phase', '01', '--plan', '01', '--task', '1', '--files', 'a.js'], tmpDir);

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.checks.task_log_ancestry.pass, true);
    assert.strictEqual(out.checks.task_log_ancestry.not_ancestor.length, 0);
  });

  test('ancestry check fails when log hash is not an ancestor of HEAD', () => {
    // Commit a task, then hard-reset HEAD backwards (losing that commit from ancestry)
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'x\n');
    const r = runGsdTools(['commit-task', 'feat(01-01): t1', '--scope', '01-01',
      '--phase', '01', '--plan', '01', '--task', '1', '--files', 'a.js'], tmpDir);
    assert.ok(r.success, r.error);
    const hash = JSON.parse(r.output).hash;

    // Hard-reset to initial commit (removes the task commit from HEAD ancestry)
    const initial = execSync('git rev-list --max-parents=0 HEAD', { cwd: tmpDir, stdio: 'pipe' }).toString().trim();
    execSync(`git reset --hard ${initial}`, { cwd: tmpDir, stdio: 'pipe' });

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.coherent, false);
    assert.strictEqual(out.checks.task_log_ancestry.pass, false);
    assert.ok(out.checks.task_log_ancestry.not_ancestor.some(e => e.hash === hash));
  });

  test('warnings have severity field with stop or ignorable', () => {
    // Produce a stale pending gate warning
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    // Manually age the pending artifact to simulate staleness
    const gatesDir = path.join(tmpDir, '.planning', 'gates');
    const pendingFile = fs.readdirSync(gatesDir).find(f => f.endsWith('-pending.json'));
    if (pendingFile) {
      const p = path.join(gatesDir, pendingFile);
      const rec = JSON.parse(fs.readFileSync(p, 'utf-8'));
      rec.blocked_at = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2h ago
      fs.writeFileSync(p, JSON.stringify(rec), 'utf-8');
    }

    const ri = runGsdTools(['verify', 'integrity'], tmpDir);
    const out = JSON.parse(ri.output);
    // warnings are objects with message + severity
    for (const w of out.warnings) {
      assert.ok(typeof w === 'object', 'each warning should be an object');
      assert.ok(typeof w.message === 'string', 'warning should have message');
      assert.ok(w.severity === 'stop' || w.severity === 'ignorable', `unexpected severity: ${w.severity}`);
    }
  });

  test('task log summary agreement passes when summary hashes match log', () => {
    // Commit 2 tasks
    const hashes = [];
    for (let i = 1; i <= 2; i++) {
      const f = `t${i}.js`;
      fs.writeFileSync(path.join(tmpDir, f), `x\n`);
      const r = runGsdTools(['commit-task', `feat(01-01): t${i}`, '--scope', '01-01',
        '--phase', '01', '--plan', '01', '--task', String(i), '--files', f], tmpDir);
      hashes.push(JSON.parse(r.output).hash);
    }
    // Write a SUMMARY.md that includes both hashes in ## Task Commits
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, `---\nphase: 1\nplan: 01-01\n---\n\n## Task Commits\n\n- ${hashes[0]}\n- ${hashes[1]}\n`, 'utf-8');

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.checks.task_log_summary_agreement.pass, true);
    assert.strictEqual(out.checks.task_log_summary_agreement.in_log_not_summary.length, 0);
  });

  test('task log summary agreement fails when summary is missing a log hash', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'x\n');
    const r = runGsdTools(['commit-task', 'feat(01-01): t1', '--scope', '01-01',
      '--phase', '01', '--plan', '01', '--task', '1', '--files', 'a.js'], tmpDir);
    const hash = JSON.parse(r.output).hash;

    // Write SUMMARY that omits the hash
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, `---\nphase: 1\nplan: 01-01\n---\n\n## Task Commits\n\n(none yet)\n`, 'utf-8');

    const ri = runGsdTools(['verify', 'integrity', '--phase', '01', '--plan', '01'], tmpDir);
    const out = JSON.parse(ri.output);
    assert.strictEqual(out.checks.task_log_summary_agreement.pass, false);
    assert.ok(out.checks.task_log_summary_agreement.in_log_not_summary.includes(hash));
    assert.ok(out.errors.some(e => /absent from SUMMARY/i.test(e)));
  });
});

// GSD-AUTHORITY: 72-02-1:38111b036d39d9d1b4de0d3b1bfb2a26185eb1a586ed6a38b21e1115984eb47c
