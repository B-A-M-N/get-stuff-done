/**
 * GSD Tools Tests - Gate Enforcement (Phase 20)
 *
 * This test verifies that workflow entry gates (plan-phase, execute-phase)
 * correctly detect and report blocked projects.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('Workflow Gate Enforcement', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('init plan-phase reports blocked status', () => {
    // Setup: STATE.md with blocked status in frontmatter
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nclarification_status: blocked\n---\n# Project State\n\n**Clarification Status:** blocked\n**Current Phase:** 01\n'
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });

    // Action: run init plan-phase
    const result = runGsdTools(['init', 'plan-phase', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Assert: output contains clarification_status: blocked
    const output = JSON.parse(result.output);
    assert.strictEqual(output.clarification_status, 'blocked');
  });

  test('init execute-phase reports blocked status', () => {
    // Setup: STATE.md with blocked status in frontmatter
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nclarification_status: blocked\n---\n# Project State\n\n**Clarification Status:** blocked\n**Current Phase:** 01\n'
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });

    // Action: run init execute-phase
    const result = runGsdTools(['init', 'execute-phase', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Assert: output contains clarification_status: blocked
    const output = JSON.parse(result.output);
    assert.strictEqual(output.clarification_status, 'blocked');
  });

  test('init milestone-op reports blocked status', () => {
    // Setup: STATE.md with blocked status in frontmatter
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nclarification_status: blocked\n---\n# Project State\n\n**Clarification Status:** blocked\n**Current Phase:** 01\n'
    );

    // Action: run init milestone-op (used by autonomous)
    const result = runGsdTools(['init', 'milestone-op'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Assert: output contains clarification_status: blocked
    const output = JSON.parse(result.output);
    assert.strictEqual(output.clarification_status, 'blocked');
  });
});
