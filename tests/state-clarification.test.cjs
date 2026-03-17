const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempProject, cleanup } = require('./helpers.cjs');
const {
  parseStateSnapshot,
  buildStateFrontmatter,
  cmdStateRecordSession,
} = require('../get-stuff-done/bin/lib/state.cjs');

describe('state clarification continuity', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('state-snapshot exposes clarification continuity fields', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Phase:** 03

## Session Continuity

**Clarification Status:** blocked
**Clarification Rounds:** 3
**Last Clarification Reason:** Success criteria still conflict with scope expectations.
**Resume Requires User Input:** true
`
    );

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    const output = parseStateSnapshot(content);
    assert.strictEqual(output.clarification_status, 'blocked');
    assert.strictEqual(output.clarification_rounds, 3);
    assert.strictEqual(output.last_clarification_reason, 'Success criteria still conflict with scope expectations.');
    assert.strictEqual(output.resume_requires_user_input, true);
    assert.deepStrictEqual(output.clarification, {
      status: 'blocked',
      rounds: 3,
      last_reason: 'Success criteria still conflict with scope expectations.',
      resume_requires_user_input: true,
    });
  });

  test('state json builds clarification frontmatter from body fields', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Phase:** 05
**Status:** Paused

## Session Continuity

**Clarification Status:** pending
**Clarification Rounds:** 2
**Last Clarification Reason:** The intended first milestone is still unclear.
**Resume Requires User Input:** true
`
    );

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    const output = buildStateFrontmatter(content, tmpDir);
    assert.strictEqual(output.clarification_status, 'pending');
    assert.strictEqual(output.clarification_rounds, 2);
    assert.strictEqual(output.last_clarification_reason, 'The intended first milestone is still unclear.');
    assert.strictEqual(output.resume_requires_user_input, true);
  });

  test('state record-session updates clarification checkpoint fields', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

## Session Continuity

**Last session:** 2024-01-10
**Stopped at:** Phase 2, Plan 1
**Resume file:** None
**Clarification Status:** none
**Clarification Rounds:** 0
**Last Clarification Reason:** None
**Resume Requires User Input:** false
`
    );

    cmdStateRecordSession(tmpDir, {
      clarification_status: 'blocked',
      clarification_rounds: '4',
      last_clarification_reason: 'Scope and timeline are still in conflict.',
      resume_requires_user_input: 'true',
    }, false);

    const updated = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(updated.includes('**Clarification Status:** blocked'));
    assert.ok(updated.includes('**Clarification Rounds:** 4'));
    assert.ok(updated.includes('**Last Clarification Reason:** Scope and timeline are still in conflict.'));
    assert.ok(updated.includes('**Resume Requires User Input:** true'));
  });
});
