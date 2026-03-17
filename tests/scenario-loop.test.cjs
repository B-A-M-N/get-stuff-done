/**
 * GSD Tools Tests - Scenario Loop (Phase 20)
 *
 * This test exercises the full pause-clarify-blocked-resume-resolve loop.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const { extractFrontmatter } = require('../get-stuff-done/bin/lib/frontmatter.cjs');

describe('Scenario Loop: Blocked -> Resolved', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('full lifecycle: detect block, check checkpoint, resolve state', () => {
    // 1. Start with a blocked project and a checkpoint artifact
    const checkpointPath = '.planning/phases/01-test/CHECKPOINT.md';
    fs.mkdirSync(path.join(tmpDir, '.planning/phases/01-test'), { recursive: true });
    
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `---
clarification_status: blocked
checkpoint_path: ${checkpointPath}
---
# Project State

**Clarification Status:** blocked
**Checkpoint Status:** awaiting-response
**Checkpoint Path:** ${checkpointPath}
**Last session:** 2024-01-01
**Stopped at:** init
**Resume file:** None
`
    );

    fs.writeFileSync(
      path.join(tmpDir, checkpointPath),
      `---
status: awaiting-response
type: clarification
why_blocked: "Missing API key for testing"
what_is_uncertain: "Which provider to use?"
choices: "[openai, anthropic]"
allow_freeform: true
resume_condition: "Provider selected"
---
# Checkpoint
`
    );

    // 2. Verify resume detects blocked state
    const resumeInit = runGsdTools(['init', 'resume'], tmpDir);
    assert.ok(resumeInit.success);
    const resumeData = JSON.parse(resumeInit.output);
    assert.strictEqual(resumeData.clarification_status, 'blocked');

    // 3. Simulate resolution via state record-session command
    const resolveResult = runGsdTools(['state', 'record-session', '--clarification-status', 'resolved'], tmpDir);
    assert.ok(resolveResult.success);

    // 4. Verify STATE.md is updated
    const finalInit = runGsdTools(['init', 'resume'], tmpDir);
    assert.ok(finalInit.success);
    const finalData = JSON.parse(finalInit.output);
    assert.strictEqual(finalData.clarification_status, 'resolved');

    // 5. Clear status entirely
    const clearResult = runGsdTools(['state', 'record-session', '--clarification-status', 'none'], tmpDir);
    assert.ok(clearResult.success);
    
    // Also clear execution checkpoint status
    const clearCheckpoint = runGsdTools(['state', 'checkpoint', '--status', '', '--checkpoint-path', ''], tmpDir);
    assert.ok(clearCheckpoint.success);

    const clearedInit = runGsdTools(['init', 'resume'], tmpDir);
    assert.ok(clearedInit.success);
    const clearedData = JSON.parse(clearedInit.output);
    assert.strictEqual(clearedData.clarification_status, 'none');
    
    const stateContentFinal = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    const fmFinal = extractFrontmatter(stateContentFinal);
    assert.strictEqual(fmFinal.checkpoint_status, undefined);
    assert.strictEqual(fmFinal.checkpoint_path, undefined);
  });
});
