/**
 * GSD Tools Tests - Checkpoint Lifecycle (Phase 16)
 *
 * This test file establishes the verification baseline for CHECKPOINT-01/02/03.
 * Tests are written BEFORE implementation (Nyquist compliance) and will
 * fail until plans 16-03 and 16-04 are completed.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// Import the schema for validation tests (exists from Phase 15)
const { checkpointArtifactSchema } = require('../get-stuff-done/bin/lib/artifact-schema.cjs');
const { extractFrontmatter } = require('../get-stuff-done/bin/lib/frontmatter.cjs');
const { buildStateFrontmatter } = require('../get-stuff-done/bin/lib/state.cjs');

describe('cmdStateCheckpoint', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Checkpoint Status:** \n**Checkpoint Path:** \n'
    );
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('writes Checkpoint Status and Checkpoint Path atomically', () => {
    const status = 'pending';
    const checkpointPath = '.planning/phases/16-checkpoint-artifact-lifecycle/CHECKPOINT.md';

    // Action: call state checkpoint via CLI to avoid process.exit(0) in-process
    const result = runGsdTools(['state', 'checkpoint', '--status', status, '--checkpoint-path', checkpointPath], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Assert: STATE.md contains expected fields in body
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.match(content, /\*\*Checkpoint Status:\*\* pending/);
    assert.match(content, /\*\*Checkpoint Path:\*\* \.planning\/phases\/16-checkpoint-artifact-lifecycle\/CHECKPOINT\.md/);

    // Assert: frontmatter (extractFrontmatter) has checkpoint_status: 'pending' and checkpoint_path set
    const fm = extractFrontmatter(content);
    assert.strictEqual(fm.checkpoint_status, 'pending');
    assert.strictEqual(fm.checkpoint_path, checkpointPath);
  });

  test('clears checkpoint fields when status is empty string', () => {
    // Setup: STATE.md with existing values
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Checkpoint Status:** pending\n**Checkpoint Path:** X\n'
    );

    // Action: clear them
    const result = runGsdTools(['state', 'checkpoint', '--status', '', '--checkpointPath', ''], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Assert: STATE.md body has "Checkpoint Status: " (empty value)
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.match(content, /\*\*Checkpoint Status:\*\* $/m);

    // Assert: frontmatter does NOT include checkpoint_status or checkpoint_path (falsy guard)
    const fm = extractFrontmatter(content);
    assert.strictEqual(fm.checkpoint_status, undefined);
    assert.strictEqual(fm.checkpoint_path, undefined);
  });
});

describe('buildStateFrontmatter checkpoint fields', () => {
  test('includes checkpoint_status when body has non-empty Checkpoint Status field', () => {
    const bodyContent = '# Project State\n\n**Checkpoint Status:** awaiting-response\n';
    const result = buildStateFrontmatter(bodyContent, null);
    assert.strictEqual(result.checkpoint_status, 'awaiting-response');
  });

  test('excludes checkpoint_status from frontmatter when field is empty', () => {
    const bodyContent = '# Project State\n\n**Checkpoint Status:** \n';
    const result = buildStateFrontmatter(bodyContent, null);
    assert.strictEqual(result.checkpoint_status, undefined);
  });
});

describe('checkpointArtifactSchema', () => {
  test('accepts a fully valid CHECKPOINT.md frontmatter object', () => {
    const valid = {
      status: 'pending',
      type: 'human-verify',
      why_blocked: 'Layout needs visual confirmation',
      what_is_uncertain: 'Whether mobile layout matches design',
      choices: '[approve, reject]',
      allow_freeform: true,
      resume_condition: 'User types approved or describes issues',
    };
    const result = checkpointArtifactSchema.safeParse(valid);
    assert.strictEqual(result.success, true);
  });

  test('rejects object missing required field why_blocked', () => {
    const invalid = { status: 'pending', type: 'human-verify', what_is_uncertain: 'x', choices: '[a]', allow_freeform: true, resume_condition: 'y' };
    const result = checkpointArtifactSchema.safeParse(invalid);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.path.includes('why_blocked')));
  });

  test('rejects invalid status value', () => {
    const invalid = { status: 'unknown', type: 'human-verify', why_blocked: 'x', what_is_uncertain: 'x', choices: '[a]', allow_freeform: true, resume_condition: 'y' };
    const result = checkpointArtifactSchema.safeParse(invalid);
    assert.strictEqual(result.success, false);
  });
});

describe('resume-project checkpoint routing', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('no routing needed when checkpoint_status is absent from STATE.md frontmatter', () => {
    // Setup: STATE.md with no checkpoint fields
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Current Plan:** 01\n'
    );

    // Action: run state json
    const result = runGsdTools(['state', 'json'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Assert: checkpoint_status is missing/undefined in JSON
    const output = JSON.parse(result.output);
    assert.strictEqual(output.checkpoint_status, undefined);
  });

  test('no routing needed when checkpoint_status is "resolved"', () => {
    // Setup: STATE.md with resolved checkpoint
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Checkpoint Status:** resolved\n**Checkpoint Path:** X\n'
    );

    // Action: run state json
    const result = runGsdTools(['state', 'json'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Assert: checkpoint_status is "resolved"
    const output = JSON.parse(result.output);
    assert.strictEqual(output.checkpoint_status, 'resolved');
  });

  test('fallback behavior when checkpoint_status is awaiting-response but file is missing', () => {
    // Setup: STATE.md with active checkpoint but no file exists
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Checkpoint Status:** awaiting-response\n**Checkpoint Path:** /nonexistent/CHECKPOINT.md\n'
    );

    // Action: run state json
    const result = runGsdTools(['state', 'json'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Assert: status and path extracted correctly
    const output = JSON.parse(result.output);
    assert.strictEqual(output.checkpoint_status, 'awaiting-response');
    assert.strictEqual(output.checkpoint_path, '/nonexistent/CHECKPOINT.md');

    // Workflow-level recovery check (simulated): file does not exist
    assert.strictEqual(fs.existsSync(output.checkpoint_path), false);
  });

  test('valid CHECKPOINT.md parses correctly with checkpointArtifactSchema', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-resume-'));
    try {
      const checkpointPath = path.join(tmpDir, 'CHECKPOINT.md');
      fs.writeFileSync(checkpointPath, `---
status: awaiting-response
type: human-verify
why_blocked: testing
what_is_uncertain: nothing
choices: "[ok]"
allow_freeform: true
resume_condition: "just wait"
---

# Checkpoint
`);

      const content = fs.readFileSync(checkpointPath, 'utf-8');
      const fm = extractFrontmatter(content);
      const result = checkpointArtifactSchema.safeParse(fm);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.status, 'awaiting-response');
    } finally {
      cleanup(tmpDir);
    }
  });
});
