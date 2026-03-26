const { test, describe } = require('node:test');
const assert = require('node:assert');
const { shouldAutoAdvanceCheckpoint } = require('../get-stuff-done/bin/lib/core.cjs');

describe('Auto-chain Scope Restriction', () => {
  test('human-action checkpoint never auto-advanced regardless of flags', () => {
    assert.strictEqual(shouldAutoAdvanceCheckpoint('human-action', true, false), false);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('human-action', false, true), false);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('human-action', true, true), false);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('human-action', false, false), false);
  });

  test('human-verify auto-advanced if any auto flag true', () => {
    assert.strictEqual(shouldAutoAdvanceCheckpoint('human-verify', true, false), true);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('human-verify', false, true), true);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('human-verify', true, true), true);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('human-verify', false, false), false);
  });

  test('decision auto-advanced if any auto flag true', () => {
    assert.strictEqual(shouldAutoAdvanceCheckpoint('decision', true, false), true);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('decision', false, true), true);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('decision', true, true), true);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('decision', false, false), false);
  });

  test('unknown types default to false (conservative)', () => {
    assert.strictEqual(shouldAutoAdvanceCheckpoint('unknown', true, false), false);
    assert.strictEqual(shouldAutoAdvanceCheckpoint('progress', true, false), false);
  });
});
