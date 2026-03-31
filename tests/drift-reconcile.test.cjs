const { test, describe } = require('node:test');
const assert = require('node:assert');

const { adaptDriftReport } = require('../get-stuff-done/bin/lib/drift-reconcile-adapter.cjs');
const { evaluateReconciliation, MATRIX } = require('../get-stuff-done/bin/lib/drift-reconcile.cjs');

function makeReport(findings, summary = { critical: 0, major: 0, minor: 0 }) {
  return {
    schema: 'gsd_drift_report',
    generated_at: '2026-03-27T20:00:00.000Z',
    summary,
    findings,
  };
}

describe('drift-reconcile', () => {
  test('adapter normalizes Phase 73 findings into reconciliation-ready inputs', () => {
    const adapted = adaptDriftReport(makeReport([
      {
        id: 'phase72-proof-drift',
        severity: 'CRITICAL',
        drift_type: 'execution_drift',
        activity_status: 'active',
        affected: { verification: 'INVALID' },
        predicted_effect: { verification_status: 'INVALID' },
        evidence: [{ ref: 'commit:abc123' }],
      },
    ], { critical: 1, major: 0, minor: 0 }));

    assert.strictEqual(adapted.normalized_drift.length, 1);
    assert.strictEqual(adapted.normalized_drift[0].target_phase, '72');
    assert.deepStrictEqual(adapted.normalized_drift[0].evidence, ['commit:abc123']);
  });

  test('critical drift maps to the fixed downgrade matrix', () => {
    const adapted = adaptDriftReport(makeReport([
      {
        id: 'phase72-proof-drift',
        severity: 'CRITICAL',
        drift_type: 'execution_drift',
        activity_status: 'active',
        affected: {},
        predicted_effect: {},
        evidence: [{ ref: 'commit:abc123' }],
      },
    ], { critical: 1, major: 0, minor: 0 }));
    const decision = evaluateReconciliation(adapted, { current_phase: '72' });

    const bySurface = Object.fromEntries(decision.applied_changes.map((item) => [item.surface, item.to]));
    assert.deepStrictEqual(bySurface, MATRIX.CRITICAL);
    assert.strictEqual(decision.reverification_required.length, 1);
  });

  test('historical drift remains visible but produces no current downgrade', () => {
    const adapted = adaptDriftReport(makeReport([
      {
        id: 'phase55-history',
        severity: 'CRITICAL',
        drift_type: 'verification_drift',
        activity_status: 'historical',
        historical: true,
        affected: {},
        predicted_effect: {},
        evidence: [{ ref: 'file:history.md' }],
      },
    ], { critical: 1, major: 0, minor: 0 }));
    const decision = evaluateReconciliation(adapted, { current_phase: '74' });

    assert.strictEqual(decision.applied_changes.length, 0);
    assert.strictEqual(decision.unchanged.length, 1);
    assert.strictEqual(decision.reverification_required.length, 0);
  });

  test('worst severity wins per surface', () => {
    const adapted = adaptDriftReport(makeReport([
      {
        id: 'phase72-major-drift',
        severity: 'MAJOR',
        drift_type: 'verification_drift',
        activity_status: 'active',
        affected: {},
        predicted_effect: {},
        evidence: [{ ref: 'commit:def456' }],
      },
      {
        id: 'phase72-critical-drift',
        severity: 'CRITICAL',
        drift_type: 'execution_drift',
        activity_status: 'active',
        affected: {},
        predicted_effect: {},
        evidence: [{ ref: 'commit:abc123' }],
      },
    ], { critical: 1, major: 1, minor: 0 }));
    const decision = evaluateReconciliation(adapted, { current_phase: '72' });

    const verification = decision.applied_changes.find((item) => item.surface === 'verification_status');
    assert.strictEqual(verification.to, 'INVALID');
  });
});
