/**
 * GSD Tools Tests - Orphaned Phase State (BLOCK-07)
 *
 * Verifies that `verify orphaned-state` detects interrupted execution:
 * some plans have SUMMARY.md (committed) while later plans in the same phase do not.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writePlan(phaseDir, planBase) {
  fs.writeFileSync(path.join(phaseDir, `${planBase}-PLAN.md`), [
    '---',
    'phase: 01-test',
    `plan: ${planBase.slice(-2)}`,
    'type: execute',
    'wave: 1',
    'depends_on: []',
    'autonomous: true',
    '---',
    '# Plan',
  ].join('\n'));
}

function writeSummary(phaseDir, planBase) {
  fs.writeFileSync(path.join(phaseDir, `${planBase}-SUMMARY.md`), [
    '---',
    'phase: 01-test',
    `plan: ${planBase.slice(-2)}`,
    '---',
    '# Summary',
  ].join('\n'));
}

describe('BLOCK-07: Orphaned Phase State', () => {
  let tmpDir;
  let phaseDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('clean when no plans exist', () => {
    const result = runGsdTools(['verify', 'orphaned-state', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.orphaned, false);
  });

  test('clean when all plans have summaries (phase complete)', () => {
    writePlan(phaseDir, '01-01');
    writePlan(phaseDir, '01-02');
    writeSummary(phaseDir, '01-01');
    writeSummary(phaseDir, '01-02');

    const result = runGsdTools(['verify', 'orphaned-state', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.orphaned, false);
    assert.strictEqual(output.plans_with_summary.length, 2);
    assert.strictEqual(output.plans_without_summary.length, 0);
  });

  test('clean when no plans have summaries (fresh start, not orphaned)', () => {
    writePlan(phaseDir, '01-01');
    writePlan(phaseDir, '01-02');
    writePlan(phaseDir, '01-03');

    const result = runGsdTools(['verify', 'orphaned-state', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.orphaned, false);
    assert.strictEqual(output.plans_with_summary.length, 0);
    assert.strictEqual(output.plans_without_summary.length, 3);
  });

  test('orphaned when some plans have summaries but later plans do not', () => {
    writePlan(phaseDir, '01-01');
    writePlan(phaseDir, '01-02');
    writePlan(phaseDir, '01-03');
    writeSummary(phaseDir, '01-01');
    // 01-02 and 01-03 have no summary — executor stopped mid-run

    const result = runGsdTools(['verify', 'orphaned-state', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.orphaned, true);
    assert.strictEqual(output.plans_with_summary.length, 1);
    assert.strictEqual(output.plans_without_summary.length, 2);
    assert.ok(output.message.includes('BLOCK-07'));
    assert.ok(output.message.includes('stopped mid-phase'));
  });

  test('orphaned with single missing summary at end', () => {
    writePlan(phaseDir, '01-01');
    writePlan(phaseDir, '01-02');
    writeSummary(phaseDir, '01-01');

    const result = runGsdTools(['verify', 'orphaned-state', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.orphaned, true);
    assert.ok(output.plans_without_summary.includes('01-02'));
  });

  test('returns phase number in output', () => {
    writePlan(phaseDir, '01-01');
    writeSummary(phaseDir, '01-01');

    const result = runGsdTools(['verify', 'orphaned-state', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(output.phase, 'phase field should be present');
  });

  test('handles phase not found gracefully', () => {
    const result = runGsdTools(['verify', 'orphaned-state', '99'], tmpDir);
    assert.ok(result.success, 'Command should exit 0 with clean JSON');
    const output = JSON.parse(result.output);
    assert.strictEqual(output.orphaned, false);
    assert.ok(output.message.includes('not found'));
  });
});
