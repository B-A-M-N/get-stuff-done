/**
 * GSD Tools Tests - Requirement Coverage Gate (BLOCK-02)
 *
 * Verifies that `verify requirement-coverage` enforces BLOCK-02:
 * requirement IDs scoped to a phase in the traceability table must
 * appear in at least one plan's `requirements:` frontmatter field.
 * A missing ID is a hard blocker, not a warning.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writeRequirements(tmpDir, content) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'), content);
}

function writePlan(phaseDir, name, requirements) {
  const reqYaml = requirements.length > 0
    ? `requirements:\n${requirements.map(r => `  - ${r}`).join('\n')}`
    : 'requirements: []';
  fs.writeFileSync(path.join(phaseDir, name), [
    '---',
    'phase: 01-test',
    'plan: 01',
    'type: execute',
    'wave: 1',
    'depends_on: []',
    'files_modified: [src/main.js]',
    'autonomous: true',
    reqYaml,
    '---',
    '# Plan',
  ].join('\n'));
}

describe('BLOCK-02: Requirement Coverage Gate', () => {
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

  test('passes when all phase-scoped requirements are covered by plans', () => {
    writeRequirements(tmpDir, [
      '# Requirements',
      '',
      '## Traceability',
      '',
      '| Requirement | Phase | Status |',
      '|-------------|-------|--------|',
      '| ENFORCE-01 | Phase 1 | Complete |',
      '| ENFORCE-02 | Phase 1 | Complete |',
    ].join('\n'));

    writePlan(phaseDir, '01-01-PLAN.md', ['ENFORCE-01', 'ENFORCE-02']);

    const result = runGsdTools(['verify', 'requirement-coverage', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.deepStrictEqual(output.uncovered, []);
  });

  test('fails (BLOCK-02) when a phase-scoped requirement has no plan coverage', () => {
    writeRequirements(tmpDir, [
      '# Requirements',
      '',
      '## Traceability',
      '',
      '| Requirement | Phase | Status |',
      '|-------------|-------|--------|',
      '| ENFORCE-01 | Phase 1 | Complete |',
      '| ENFORCE-02 | Phase 1 | Complete |',
      '| ENFORCE-03 | Phase 2 | Complete |',
    ].join('\n'));

    // Only covers ENFORCE-01, ENFORCE-02 is scoped to phase 1 but uncovered
    writePlan(phaseDir, '01-01-PLAN.md', ['ENFORCE-01']);

    const result = runGsdTools(['verify', 'requirement-coverage', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.uncovered.includes('ENFORCE-02'));
    assert.ok(output.errors.some(e => e.includes('BLOCK-02')));
    assert.ok(output.errors[0].includes('ENFORCE-02'));
    // ENFORCE-03 is phase 2 — must not appear in phase 1 report
    assert.ok(!output.uncovered.includes('ENFORCE-03'));
  });

  test('reports dangling reference when plan claims non-existent requirement ID', () => {
    writeRequirements(tmpDir, [
      '# Requirements',
      '',
      '## Traceability',
      '',
      '| Requirement | Phase | Status |',
      '|-------------|-------|--------|',
      '| ENFORCE-01 | Phase 1 | Complete |',
    ].join('\n'));

    // Claims TYPO-99 which doesn't exist in REQUIREMENTS.md
    writePlan(phaseDir, '01-01-PLAN.md', ['ENFORCE-01', 'TYPO-99']);

    const result = runGsdTools(['verify', 'requirement-coverage', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    // Valid because phase-scoped requirements are covered
    assert.strictEqual(output.valid, true);
    // But dangling reference is reported as warning
    assert.ok(output.dangling_references.includes('TYPO-99'));
    assert.ok(output.warnings.length > 0);
  });

  test('passes cleanly when no requirements are scoped to this phase', () => {
    writeRequirements(tmpDir, [
      '# Requirements',
      '',
      '## Traceability',
      '',
      '| Requirement | Phase | Status |',
      '|-------------|-------|--------|',
      '| ENFORCE-01 | Phase 2 | Complete |',
    ].join('\n'));

    writePlan(phaseDir, '01-01-PLAN.md', []);

    const result = runGsdTools(['verify', 'requirement-coverage', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.deepStrictEqual(output.phase_requirements, []);
    assert.deepStrictEqual(output.uncovered, []);
  });

  test('handles two-digit phase numbers in traceability table correctly', () => {
    writeRequirements(tmpDir, [
      '# Requirements',
      '',
      '## Traceability',
      '',
      '| Requirement | Phase | Status |',
      '|-------------|-------|--------|',
      '| SCHEMA-01 | Phase 15 | Complete |',
      '| SCHEMA-02 | Phase 15 | Complete |',
      '| ENFORCE-01 | Phase 17 | Complete |',
    ].join('\n'));

    // Phase 15: both SCHEMA-01 and SCHEMA-02 covered
    const phaseDir15 = path.join(tmpDir, '.planning', 'phases', '15-schema');
    fs.mkdirSync(phaseDir15, { recursive: true });
    writePlan(phaseDir15, '15-01-PLAN.md', ['SCHEMA-01', 'SCHEMA-02']);

    // ENFORCE-01 (Phase 17) must NOT appear in phase 15 results
    const result = runGsdTools(['verify', 'requirement-coverage', '15'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.deepStrictEqual(output.uncovered, []);
    assert.ok(!output.uncovered.includes('ENFORCE-01'), 'Phase 17 requirement must not bleed into phase 15');
  });

  test('fails with multiple uncovered requirements listed in single error', () => {
    writeRequirements(tmpDir, [
      '# Requirements',
      '',
      '## Traceability',
      '',
      '| Requirement | Phase | Status |',
      '|-------------|-------|--------|',
      '| SCHEMA-01 | Phase 1 | Complete |',
      '| SCHEMA-02 | Phase 1 | Complete |',
      '| SCHEMA-03 | Phase 1 | Complete |',
    ].join('\n'));

    // Plan covers none of them
    writePlan(phaseDir, '01-01-PLAN.md', []);

    const result = runGsdTools(['verify', 'requirement-coverage', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    assert.strictEqual(output.uncovered.length, 3);
    assert.ok(output.errors[0].includes('BLOCK-02'));
    assert.ok(output.errors[0].includes('SCHEMA-01'));
    assert.ok(output.errors[0].includes('SCHEMA-02'));
    assert.ok(output.errors[0].includes('SCHEMA-03'));
  });
});
