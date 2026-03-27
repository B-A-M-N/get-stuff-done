const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  classifyEntry,
  classifyMemoryTrustBoundary,
  classifySeverity,
} = require('../get-stuff-done/bin/lib/drift-classifier.cjs');

describe('drift-classifier', () => {
  test('high impact plus high exploitability classifies as CRITICAL', () => {
    assert.strictEqual(classifySeverity({ impact: 'high', exploitability: 'high' }), 'CRITICAL');
  });

  test('historical drift is recorded but non-blocking', () => {
    const classified = classifyEntry({
      requirement_id: 'TRUTH-DRIFT-01',
      claim: 'Historical repair cluster remains visible.',
      surface_category: 'historical_structural',
      implementation: { paths: ['.planning/v0.6.0-MILESTONE-AUDIT.md'] },
      evidence: [{ type: 'file', ref: '.planning/v0.6.0-MILESTONE-AUDIT.md' }],
      observed_drift: true,
      historical: true,
      affects_current_truth: false,
      impact: 'high',
      exploitability: 'high',
      false_truth_perception: true,
    });

    assert.strictEqual(classified.activity_status, 'historical');
    assert.strictEqual(classified.blocking, false);
    assert.strictEqual(classified.severity, 'CRITICAL');
  });

  test('entries that do not affect current truth cannot be classified active', () => {
    const classified = classifyEntry({
      requirement_id: 'TRUTH-DRIFT-01',
      claim: 'Disconnected legacy issue should remain historical.',
      surface_category: 'historical_structural',
      implementation: { paths: ['legacy/file.md'] },
      evidence: [{ type: 'file', ref: 'legacy/file.md' }],
      observed_drift: true,
      affects_current_truth: false,
      impact: 'low',
      exploitability: 'high',
    });

    assert.notStrictEqual(classified.activity_status, 'active');
  });

  test('memory truth boundaries stay at trust-state level only', () => {
    const boundary = classifyMemoryTrustBoundary({
      memory_boundary_state: 'disabled',
      embedding_quality: 'bad',
      recall_tuning: 'ignored',
    });

    assert.strictEqual(boundary, 'disabled');
  });
});
