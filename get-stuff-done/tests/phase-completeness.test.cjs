const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// Path to gsd-tools CLI
const GSD_TOOLS = path.resolve(__dirname, '..', 'bin', 'gsd-tools.cjs');

function runPhaseCompleteness(cwd, phase) {
  return spawnSync('node', [GSD_TOOLS, 'verify', 'phase-completeness', phase, '--cwd', cwd, '--raw'], {
    encoding: 'utf-8',
  });
}

test('phase completeness passes when all plans have summaries', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));

  try {
    const planningDir = path.join(tempDir, '.planning');
    fs.mkdirSync(planningDir);
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir);
    const phaseDir = path.join(phasesDir, '99-complete-phase');
    fs.mkdirSync(phaseDir);

    // Create PLAN and SUMMARY files
    fs.writeFileSync(path.join(phaseDir, '99-PLAN.md'), '# Plan\n');
    fs.writeFileSync(path.join(phaseDir, '99-SUMMARY.md'), '# Summary\n');

    const result = runPhaseCompleteness(tempDir, '99-complete-phase');
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. Output: ${result.stdout}${result.stderr}`);
    assert.strictEqual(result.stdout.trim(), 'complete', 'Expected raw output "complete"');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('phase completeness fails when plan missing summary', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));

  try {
    const planningDir = path.join(tempDir, '.planning');
    fs.mkdirSync(planningDir);
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir);
    const phaseDir = path.join(phasesDir, '99-incomplete-phase');
    fs.mkdirSync(phaseDir);

    // Create PLAN only
    fs.writeFileSync(path.join(phaseDir, '99-PLAN.md'), '# Plan\n');

    const result = runPhaseCompleteness(tempDir, '99-incomplete-phase');
    // The command exits 0 always, but raw output indicates incomplete
    assert.strictEqual(result.status, 0, `Command should exit 0 (always) but got ${result.status}. Output: ${result.stdout}${result.stderr}`);
    assert.strictEqual(result.stdout.trim(), 'incomplete', 'Expected raw output "incomplete"');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('phase completeness passes with orphaned summary (warning)', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));

  try {
    const planningDir = path.join(tempDir, '.planning');
    fs.mkdirSync(planningDir);
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir);
    const phaseDir = path.join(phasesDir, '99-orphan-phase');
    fs.mkdirSync(phaseDir);

    // Create SUMMARY only (no PLAN)
    fs.writeFileSync(path.join(phaseDir, '99-SUMMARY.md'), '# Summary\n');

    const result = runPhaseCompleteness(tempDir, '99-orphan-phase');
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), 'complete', 'Expected raw output "complete" (orphans are warnings)');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('phase completeness handles multiple files correctly', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));

  try {
    const planningDir = path.join(tempDir, '.planning');
    fs.mkdirSync(planningDir);
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir);
    const phaseDir = path.join(phasesDir, '99-multi-phase');
    fs.mkdirSync(phaseDir);

    // Create two plans with summaries
    fs.writeFileSync(path.join(phaseDir, '99-PLAN.md'), '# Plan 99\n');
    fs.writeFileSync(path.join(phaseDir, '99-SUMMARY.md'), '# Summary 99\n');
    fs.writeFileSync(path.join(phaseDir, '100-PLAN.md'), '# Plan 100\n');
    fs.writeFileSync(path.join(phaseDir, '100-SUMMARY.md'), '# Summary 100\n');

    const result = runPhaseCompleteness(tempDir, '99-multi-phase');
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), 'complete');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
