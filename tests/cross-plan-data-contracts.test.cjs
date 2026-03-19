/**
 * GSD Tools Tests - Cross-Plan Data Contracts (Dimension 9)
 *
 * Verifies that `verify cross-plan-data-contracts` detects:
 * - Race conditions: two plans modifying the same file in the same wave
 * - Data races: Plan A writes a file that Plan B reads in the same wave
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writePlan(phaseDir, name, { wave, filesModified, actionContent = '' }) {
  const filesYaml = filesModified.length > 0
    ? `files_modified:\n${filesModified.map(f => `  - ${f}`).join('\n')}`
    : 'files_modified: []';
  fs.writeFileSync(path.join(phaseDir, name), [
    '---',
    'phase: 01-test',
    `plan: ${name.replace(/-PLAN\.md$/, '').slice(-2)}`,
    'type: execute',
    `wave: ${wave}`,
    'depends_on: []',
    filesYaml,
    'autonomous: true',
    '---',
    '# Plan',
    '',
    actionContent,
  ].join('\n'));
}

describe('Dimension 9: Cross-Plan Data Contracts', () => {
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

  test('passes when single plan in phase', () => {
    writePlan(phaseDir, '01-01-PLAN.md', { wave: 1, filesModified: ['src/main.js'] });

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.issues.length, 0);
  });

  test('passes when parallel plans modify different files', () => {
    writePlan(phaseDir, '01-01-PLAN.md', { wave: 1, filesModified: ['src/lib/auth.js'] });
    writePlan(phaseDir, '01-02-PLAN.md', { wave: 1, filesModified: ['src/lib/api.js'] });

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.issues.length, 0);
  });

  test('passes when plans in different waves modify same file', () => {
    writePlan(phaseDir, '01-01-PLAN.md', { wave: 1, filesModified: ['src/lib/db.js'] });
    writePlan(phaseDir, '01-02-PLAN.md', { wave: 2, filesModified: ['src/lib/db.js'] });

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.issues.length, 0);
  });

  test('detects race condition when two plans in same wave modify same file', () => {
    writePlan(phaseDir, '01-01-PLAN.md', { wave: 1, filesModified: ['src/schema.js'] });
    writePlan(phaseDir, '01-02-PLAN.md', { wave: 1, filesModified: ['src/schema.js'] });

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.issues.length > 0);
    const issue = output.issues[0];
    assert.strictEqual(issue.type, 'race_condition');
    assert.strictEqual(issue.severity, 'blocker');
    assert.ok(issue.description.includes('src/schema.js'));
    assert.ok(issue.fix_hint.length > 0);
  });

  test('detects data race when Plan A writes file that Plan B reads in same wave', () => {
    writePlan(phaseDir, '01-01-PLAN.md', {
      wave: 1,
      filesModified: ['src/lib/generated.js'],
      actionContent: '<action>\nWrite to `src/lib/generated.js`\n</action>',
    });
    writePlan(phaseDir, '01-02-PLAN.md', {
      wave: 1,
      filesModified: ['src/consumer.js'],
      actionContent: '<action>\nRead from `src/lib/generated.js` and process\n</action>',
    });

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    const dataRaceIssue = output.issues.find(i => i.type === 'data_race');
    assert.ok(dataRaceIssue, 'Expected a data_race issue');
    assert.strictEqual(dataRaceIssue.severity, 'blocker');
    assert.ok(dataRaceIssue.description.includes('01-01'));
    assert.ok(dataRaceIssue.description.includes('01-02'));
  });

  test('reports plan count in output', () => {
    writePlan(phaseDir, '01-01-PLAN.md', { wave: 1, filesModified: ['src/a.js'] });
    writePlan(phaseDir, '01-02-PLAN.md', { wave: 1, filesModified: ['src/b.js'] });
    writePlan(phaseDir, '01-03-PLAN.md', { wave: 2, filesModified: ['src/c.js'] });

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.plan_count, 3);
  });

  test('errors if phase not found', () => {
    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '99'], tmpDir);
    assert.ok(result.success, 'Command should exit 0 with error JSON');
    const output = JSON.parse(result.output);
    assert.ok(output.error);
  });
});
