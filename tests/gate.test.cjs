const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writeConfig(tmpDir, obj) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify(obj, null, 2), 'utf8');
}

function gatesDir(tmpDir) {
  return path.join(tmpDir, '.planning', 'gates');
}

function pendingFile(tmpDir, key) {
  return path.join(gatesDir(tmpDir), `${key.replace('.', '_')}-pending.json`);
}

function releasedFile(tmpDir, key) {
  return path.join(gatesDir(tmpDir), `${key.replace('.', '_')}-released.json`);
}

describe('gate enforce', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('exits 0 and reports clear in yolo mode', () => {
    writeConfig(tmpDir, { mode: 'yolo' });
    const result = runGsdTools(['gate', 'enforce', '--key', 'gates.execute_next_plan'], tmpDir);
    assert.ok(result.success, `should exit 0 in yolo mode: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.blocked, false);
    assert.strictEqual(out.reason, 'yolo_mode');
  });

  test('exits 1 and reports blocked in interactive mode', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    const result = runGsdTools(['gate', 'enforce', '--key', 'gates.execute_next_plan'], tmpDir);
    assert.strictEqual(result.success, false, 'should exit 1 in interactive mode');
    const out = JSON.parse(result.output);
    assert.strictEqual(out.blocked, true);
    assert.strictEqual(out.reason, 'interactive_mode');
  });

  test('writes pending artifact on block', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    const pending = pendingFile(tmpDir, 'gates.confirm_plan');
    assert.ok(fs.existsSync(pending), 'pending artifact should be written on block');
    const record = JSON.parse(fs.readFileSync(pending, 'utf-8'));
    assert.strictEqual(record.key, 'gates.confirm_plan');
    assert.strictEqual(record.reason, 'interactive_mode');
    assert.ok(record.blocked_at, 'blocked_at timestamp should be present');
  });

  test('does not write pending artifact when clear', () => {
    writeConfig(tmpDir, { mode: 'yolo' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(!fs.existsSync(pendingFile(tmpDir, 'gates.confirm_plan')), 'no pending artifact when clear');
  });

  test('safety gate always enforces even in yolo mode', () => {
    writeConfig(tmpDir, { mode: 'yolo', safety: { always_confirm_destructive: true } });
    const result = runGsdTools(['gate', 'enforce', '--key', 'safety.always_confirm_destructive'], tmpDir);
    assert.strictEqual(result.success, false, 'safety gate should exit 1 in yolo mode');
    const out = JSON.parse(result.output);
    assert.strictEqual(out.blocked, true);
    assert.strictEqual(out.reason, 'safety_enabled');
  });

  test('custom mode with gate disabled exits 0', () => {
    writeConfig(tmpDir, { mode: 'custom', gates: { execute_next_plan: false } });
    const result = runGsdTools(['gate', 'enforce', '--key', 'gates.execute_next_plan'], tmpDir);
    assert.ok(result.success, `custom+disabled should exit 0: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.blocked, false);
    assert.strictEqual(out.reason, 'gate_disabled');
  });

  test('errors on unknown key', () => {
    const result = runGsdTools(['gate', 'enforce', '--key', 'gates.nonexistent'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Unknown prompt policy key'));
  });
});

describe('gate release', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('writes released artifact and removes pending', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    // First: enforce to create pending
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(fs.existsSync(pendingFile(tmpDir, 'gates.confirm_plan')), 'pending should exist before release');

    // Release
    const result = runGsdTools(['gate', 'release', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.released, true);
    assert.strictEqual(out.was_blocked, true);

    assert.ok(!fs.existsSync(pendingFile(tmpDir, 'gates.confirm_plan')), 'pending should be removed after release');
    assert.ok(fs.existsSync(releasedFile(tmpDir, 'gates.confirm_plan')), 'released artifact should exist');
  });

  test('release is idempotent when no pending file exists', () => {
    const result = runGsdTools(['gate', 'release', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.released, true);
    assert.strictEqual(out.was_blocked, false);
    assert.ok(fs.existsSync(releasedFile(tmpDir, 'gates.confirm_plan')), 'released artifact written even without prior pending');
  });

  test('released artifact contains timestamps', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    runGsdTools(['gate', 'release', '--key', 'gates.confirm_plan'], tmpDir);

    const record = JSON.parse(fs.readFileSync(releasedFile(tmpDir, 'gates.confirm_plan'), 'utf-8'));
    assert.ok(record.blocked_at, 'blocked_at should carry over from pending');
    assert.ok(record.released_at, 'released_at should be set');
    assert.strictEqual(record.key, 'gates.confirm_plan');
  });
});

describe('gate check', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('reports clear when no gates exist', () => {
    const result = runGsdTools(['gate', 'check', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.clear, true);
    assert.strictEqual(out.pending, false);
    assert.strictEqual(out.released, false);
  });

  test('reports not clear when pending file exists', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);

    const result = runGsdTools(['gate', 'check', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.clear, false);
    assert.strictEqual(out.pending, true);
  });

  test('reports clear and released after release', () => {
    writeConfig(tmpDir, { mode: 'interactive' });
    runGsdTools(['gate', 'enforce', '--key', 'gates.confirm_plan'], tmpDir);
    runGsdTools(['gate', 'release', '--key', 'gates.confirm_plan'], tmpDir);

    const result = runGsdTools(['gate', 'check', '--key', 'gates.confirm_plan'], tmpDir);
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.clear, true);
    assert.strictEqual(out.pending, false);
    assert.strictEqual(out.released, true);
    assert.ok(out.released_at, 'released_at should be present');
  });
});

describe('verify checkpoint-coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('no checkpoints in plan — ok, bypass_suspected false', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-PLAN.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, `---\nphase: "01"\n---\n\n## Tasks\n\n<task id="1" name="setup" type="implement">\nDo setup\n</task>\n`);

    const result = runGsdTools(
      ['verify', 'checkpoint-coverage', '.planning/phases/01-auth/01-01-PLAN.md'],
      tmpDir
    );
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.has_checkpoints, false);
    assert.strictEqual(out.checkpoint_count, 0);
    assert.strictEqual(out.bypass_suspected, false);
  });

  test('plan has checkpoint tasks, no CHECKPOINT.md — bypass_suspected true', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-PLAN.md');
    fs.writeFileSync(planPath, `---\nphase: "01"\n---\n\n<task id="1" type="checkpoint:human-verify">\nVerify deployment\n</task>\n`);

    const result = runGsdTools(
      ['verify', 'checkpoint-coverage', '.planning/phases/01-auth/01-01-PLAN.md', '--phase', '01'],
      tmpDir
    );
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.has_checkpoints, true);
    assert.strictEqual(out.checkpoint_count, 1);
    assert.deepStrictEqual(out.checkpoint_types, ['checkpoint:human-verify']);
    assert.strictEqual(out.checkpoint_file_exists, false);
    assert.strictEqual(out.bypass_suspected, true);
  });

  test('plan has checkpoint tasks and CHECKPOINT.md exists — bypass_suspected false', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-PLAN.md');
    fs.writeFileSync(planPath, `<task id="1" type="checkpoint:decision">\nChoose approach\n</task>\n`);
    fs.writeFileSync(path.join(tmpDir, '.planning', 'phases', '01-auth', 'CHECKPOINT.md'), '---\nstatus: pending\n---\n');

    const result = runGsdTools(
      ['verify', 'checkpoint-coverage', '.planning/phases/01-auth/01-01-PLAN.md', '--phase', '01'],
      tmpDir
    );
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.has_checkpoints, true);
    assert.strictEqual(out.checkpoint_file_exists, true);
    assert.strictEqual(out.bypass_suspected, false);
  });

  test('multiple checkpoint types are all captured', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-auth', '01-01-PLAN.md');
    fs.writeFileSync(planPath, [
      '<task id="1" type="checkpoint:human-verify">V</task>',
      '<task id="2" type="checkpoint:decision">D</task>',
      '<task id="3" type="checkpoint:human-action">A</task>',
    ].join('\n'));

    const result = runGsdTools(
      ['verify', 'checkpoint-coverage', '.planning/phases/01-auth/01-01-PLAN.md'],
      tmpDir
    );
    assert.ok(result.success, result.error);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.checkpoint_count, 3);
    assert.ok(out.checkpoint_types.includes('checkpoint:human-verify'));
    assert.ok(out.checkpoint_types.includes('checkpoint:decision'));
    assert.ok(out.checkpoint_types.includes('checkpoint:human-action'));
  });
});
