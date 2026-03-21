const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writeConfig(tmpDir, obj) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify(obj, null, 2), 'utf8');
}

describe('policy should-prompt command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('interactive mode always prompts for gates even when disabled in config', () => {
    writeConfig(tmpDir, { mode: 'interactive', gates: { execute_next_plan: false } });
    const result = runGsdTools(['policy', 'should-prompt', 'gates.execute_next_plan'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.should_prompt, true);
    assert.strictEqual(output.reason, 'interactive_mode');
  });

  test('yolo mode suppresses workflow gates', () => {
    writeConfig(tmpDir, { mode: 'yolo', gates: { execute_next_plan: true } });
    const result = runGsdTools(['policy', 'should-prompt', 'gates.execute_next_plan'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.should_prompt, false);
    assert.strictEqual(output.reason, 'yolo_mode');
  });

  test('custom mode defers to configured gate value', () => {
    writeConfig(tmpDir, { mode: 'custom', gates: { execute_next_plan: false } });
    const result = runGsdTools(['policy', 'should-prompt', 'gates.execute_next_plan'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.should_prompt, false);
    assert.strictEqual(output.reason, 'gate_disabled');
  });

  test('safety prompt remains active even in yolo mode', () => {
    writeConfig(tmpDir, { mode: 'yolo', safety: { always_confirm_destructive: true } });
    const result = runGsdTools(['policy', 'should-prompt', 'safety.always_confirm_destructive'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.should_prompt, true);
    assert.strictEqual(output.reason, 'safety_enabled');
  });

  test('errors on unknown policy keys', () => {
    const result = runGsdTools(['policy', 'should-prompt', 'workflow.auto_advance'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Unknown prompt policy key'));
  });

  // Verify every gate key that was wired to workflows is a valid policy key
  const allGateKeys = [
    'gates.confirm_project',
    'gates.confirm_phases',
    'gates.confirm_roadmap',
    'gates.confirm_breakdown',
    'gates.confirm_plan',
    'gates.issues_review',
    'gates.confirm_transition',
    'gates.confirm_milestone_scope',
    'gates.execute_next_plan',
  ];

  for (const key of allGateKeys) {
    test(`${key} is a valid policy key and resolves in yolo mode`, () => {
      writeConfig(tmpDir, { mode: 'yolo' });
      const result = runGsdTools(['policy', 'should-prompt', key], tmpDir);
      assert.ok(result.success, `${key} should be valid: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.should_prompt, false, `${key} should not prompt in yolo mode`);
      assert.strictEqual(output.reason, 'yolo_mode');
    });

    test(`${key} is a valid policy key and resolves in interactive mode`, () => {
      writeConfig(tmpDir, { mode: 'interactive' });
      const result = runGsdTools(['policy', 'should-prompt', key], tmpDir);
      assert.ok(result.success, `${key} should be valid: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.should_prompt, true, `${key} should prompt in interactive mode`);
    });
  }
});
