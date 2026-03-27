const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  REPORT_PATH,
  getLatestReportState,
  hasBlockingDrift,
  readLatestReport,
  scanDrift,
  writeLatestReport,
} = require('../get-stuff-done/bin/lib/drift-engine.cjs');

function makeCatalog(entries) {
  return {
    schema: 'gsd_drift_catalog',
    catalog_hash: 'catalog-hash',
    entries,
  };
}

function makeBaselineEntry(overrides = {}) {
  return {
    id: 'expected-surface',
    requirement_id: 'TRUTH-DRIFT-01',
    claim: 'Expected truth surface',
    surface_category: 'runtime_surface',
    implementation: { paths: ['get-stuff-done/bin/lib/example.cjs'] },
    evidence: [{ type: 'command', ref: 'node gsd-tools.cjs foo', observed: {} }],
    observed_drift: false,
    activity_status: 'healthy',
    severity: 'MAJOR',
    drift_type: 'execution_drift',
    ...overrides,
  };
}

describe('drift-engine', () => {
  test('catalog-defined surfaces scan as healthy when present', () => {
    const report = scanDrift(process.cwd(), {
      catalog: makeCatalog([makeBaselineEntry()]),
      runtimeEntries: [makeBaselineEntry()],
      now: '2026-03-27T12:00:00.000Z',
    });

    assert.strictEqual(report.schema, 'gsd_drift_report');
    assert.strictEqual(report.summary.healthy, 1);
    assert.strictEqual(report.summary.active, 0);
    assert.strictEqual(report.surfaces[0].surface_state, 'healthy');
    assert.match(report.generated_at, /2026-03-27T12:00:00/);
    assert.strictEqual(report.catalog_hash, 'catalog-hash');
  });

  test('missing catalog surfaces become missing_surface findings', () => {
    const report = scanDrift(process.cwd(), {
      catalog: makeCatalog([makeBaselineEntry()]),
      runtimeEntries: [],
      now: '2026-03-27T12:00:00.000Z',
    });

    assert.strictEqual(report.summary.missing_surface, 1);
    assert.strictEqual(report.summary.active, 1);
    assert.strictEqual(report.findings[0].surface_state, 'missing_surface');
    assert.strictEqual(report.findings[0].affected.verification, 'CONDITIONAL');
  });

  test('runtime-only surfaces become untracked_surface findings', () => {
    const report = scanDrift(process.cwd(), {
      catalog: makeCatalog([]),
      runtimeEntries: [makeBaselineEntry({ id: 'runtime-only', observed_drift: true, activity_status: 'active' })],
      now: '2026-03-27T12:00:00.000Z',
    });

    assert.strictEqual(report.summary.untracked_surface, 1);
    assert.strictEqual(report.findings[0].surface_state, 'untracked_surface');
  });

  test('strong contradiction becomes critical with predicted invalidation effects', () => {
    const report = scanDrift(process.cwd(), {
      catalog: makeCatalog([makeBaselineEntry()]),
      runtimeEntries: [makeBaselineEntry({
        observed_drift: true,
        activity_status: 'active',
        severity: 'CRITICAL',
        false_truth_perception: true,
      })],
      now: '2026-03-27T12:00:00.000Z',
    });

    assert.strictEqual(report.findings[0].severity, 'CRITICAL');
    assert.strictEqual(report.findings[0].predicted_effect.verification_status, 'INVALID');
    assert.strictEqual(hasBlockingDrift(report), true);
  });

  test('partial probe failure becomes insufficient evidence instead of a strong drift claim', () => {
    const report = scanDrift(process.cwd(), {
      catalog: makeCatalog([makeBaselineEntry()]),
      runtimeEntries: [makeBaselineEntry({
        observation_status: 'insufficient_evidence',
        observed_drift: false,
        activity_status: 'active',
      })],
      now: '2026-03-27T12:00:00.000Z',
    });

    assert.strictEqual(report.findings[0].surface_state, 'insufficient_evidence');
    assert.strictEqual(report.findings[0].severity, 'MINOR');
    assert.strictEqual(report.findings[0].confidence, 'low');
    assert.strictEqual(hasBlockingDrift(report), false);
  });

  test('historical findings remain visible but non-blocking in machine output', () => {
    const report = scanDrift(process.cwd(), {
      catalog: makeCatalog([makeBaselineEntry({ id: 'historical-surface' })]),
      runtimeEntries: [makeBaselineEntry({
        id: 'historical-surface',
        observed_drift: true,
        activity_status: 'historical',
        historical: true,
        affects_current_truth: false,
      })],
      now: '2026-03-27T12:00:00.000Z',
    });

    assert.strictEqual(report.summary.historical, 1);
    assert.strictEqual(report.findings[0].activity_status, 'historical');
    assert.strictEqual(hasBlockingDrift(report), false);
  });

  test('latest-report persistence is readable and staleness-aware', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-drift-engine-'));
    const report = scanDrift(tmpDir, {
      catalog: makeCatalog([makeBaselineEntry()]),
      runtimeEntries: [makeBaselineEntry()],
      now: '2026-03-27T12:00:00.000Z',
    });

    try {
      writeLatestReport(tmpDir, report);
      const readBack = readLatestReport(tmpDir);
      const state = getLatestReportState(tmpDir, {
        now: '2026-03-27T12:10:00.000Z',
        staleAfterMs: 15 * 60 * 1000,
      });

      assert.strictEqual(fs.existsSync(path.join(tmpDir, REPORT_PATH)), true);
      assert.strictEqual(readBack.generated_at, '2026-03-27T12:00:00.000Z');
      assert.strictEqual(state.status, 'ok');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
