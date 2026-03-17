const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempProject, cleanup } = require('./helpers.cjs');
const {
  cmdVerifyPlanStructure,
  cmdVerifyCheckpointResponse,
} = require('../get-stuff-done/bin/lib/verify.cjs');

function captureJson(fn) {
  const writes = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString(encoding || 'utf-8'));
    if (typeof callback === 'function') callback();
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return JSON.parse(writes.join(''));
}

test('plan-structure rejects checkpoint tasks missing checkpoint-specific fields', () => {
  const tmpDir = createTempProject();
  try {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    const planPath = path.join(phaseDir, '01-01-PLAN.md');
    fs.writeFileSync(planPath, [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: [some/file.ts]',
      'autonomous: false',
      'must_haves:',
      '  truths:',
      '    - "something"',
      '---',
      '',
      '<tasks>',
      '<task type="checkpoint:decision" gate="blocking">',
      '  <name>Task 1: Choose approach</name>',
      '  <files>some/file.ts</files>',
      '  <action>Need a decision</action>',
      '  <verify><human>Pick one</human></verify>',
      '  <done>Decision captured</done>',
      '</task>',
      '</tasks>',
    ].join('\n'));

    const output = captureJson(() => cmdVerifyPlanStructure(tmpDir, planPath, false));
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(e => e.includes("missing <decision>")));
    assert.ok(output.errors.some(e => e.includes("missing <context>")));
    assert.ok(output.errors.some(e => e.includes("missing <options>")));
    assert.ok(output.errors.some(e => e.includes("missing <resume-signal>")));
    assert.strictEqual(output.tasks[0].type, 'checkpoint:decision');
  } finally {
    cleanup(tmpDir);
  }
});

test('checkpoint-response validator accepts complete structured checkpoint returns', () => {
  const tmpDir = createTempProject();
  try {
    const file = path.join(tmpDir, 'checkpoint.txt');
    fs.writeFileSync(file, [
      'status: checkpoint',
      'why_blocked: Mobile vs desktop acceptance criteria are still unresolved.',
      'what_is_uncertain: Whether the layout should optimize for mobile or desktop first.',
      'choices: [mobile-first, desktop-first, custom-rule]',
      'allow_freeform: true',
      'resume_condition: Resume when the user selects a priority or provides a custom acceptance rule.',
    ].join('\n'));

    const output = captureJson(() => cmdVerifyCheckpointResponse(tmpDir, file, false));
    assert.strictEqual(output.valid, true);
    assert.deepStrictEqual(output.errors, []);
  } finally {
    cleanup(tmpDir);
  }
});

test('checkpoint-response validator rejects vague or incomplete checkpoint returns', () => {
  const tmpDir = createTempProject();
  try {
    const file = path.join(tmpDir, 'checkpoint.txt');
    fs.writeFileSync(file, [
      'status: checkpoint',
      'why_blocked: Waiting for user input.',
      'what_is_uncertain: Needs clarification.',
      'allow_freeform: maybe',
      'resume_condition: ask user',
    ].join('\n'));

    const output = captureJson(() => cmdVerifyCheckpointResponse(tmpDir, file, false));
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(e => e.includes('Missing checkpoint field: choices')));
    assert.ok(output.errors.some(e => e.includes('why_blocked is too vague')));
    assert.ok(output.errors.some(e => e.includes('what_is_uncertain is too vague')));
    assert.ok(output.errors.some(e => e.includes('allow_freeform must be true or false')));
  } finally {
    cleanup(tmpDir);
  }
});

const { checkpointArtifactSchema } = require('../get-stuff-done/bin/lib/artifact-schema.cjs');

test('checkpointArtifactSchema validates well-formed CHECKPOINT.md frontmatter', () => {
  const result = checkpointArtifactSchema.safeParse({
    status: 'pending',
    type: 'decision',
    why_blocked: 'Layout choice unresolved',
    what_is_uncertain: 'Mobile vs desktop priority',
    choices: '[mobile-first, desktop-first]',
    allow_freeform: true,
    resume_condition: 'Resume when user selects layout priority',
  });
  assert.strictEqual(result.success, true);
});

test('checkpointArtifactSchema rejects CHECKPOINT.md missing required fields', () => {
  const result = checkpointArtifactSchema.safeParse({});
  assert.strictEqual(result.success, false);
  assert.ok(result.error.issues.length > 0);
  const paths = result.error.issues.map(e => e.path.join('.'));
  assert.ok(paths.includes('status'), 'status should be in error paths');
  assert.ok(paths.includes('type'), 'type should be in error paths');
});
