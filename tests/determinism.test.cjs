/**
 * Phase 12-03: Determinism Test
 *
 * Ensures that derivePhaseTruth produces byte-identical output to a frozen fixture.
 * This catches non-determinism in the derivation logic (timestamps, ordering, etc).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.join(__dirname, '..', '.planning', 'phases', '12-synthesis-retrieval-replay', 'fixtures', 'phase52-derived-truth.yaml');
// Use the same fixed timestamp that was used to generate the fixture
const FIXED_NOW = '2026-03-30T14:25:58.128Z';

describe('Determinism (Phase 12-03)', () => {
  test('derivePhaseTruth(52) output matches frozen fixture', async () => {
    const phaseTruth = require('../get-stuff-done/bin/lib/phase-truth.cjs');

    // Compute current derivation with fixed timestamp
    const derived = await phaseTruth.derivePhaseTruth(process.cwd(), 52, { now: FIXED_NOW });
    const replayed = phaseTruth.renderYaml(derived) + '\n';

    // Load frozen fixture (expected output)
    const fixtureContent = fs.readFileSync(FIXTURE_PATH, 'utf-8');

    // Normalize line endings and whitespace? We'll do strict equality on trimmed content
    assert.strictEqual(
      replayed.trim(),
      fixtureContent.trim(),
      'Derived truth must exactly match frozen fixture; any difference indicates non-determinism'
    );
  });
});
