const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { createTempProject, cleanup, runGsdTools } = require('./helpers.cjs');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

function makeFixture() {
  return {
    catalog: {
      schema: 'gsd_drift_catalog',
      catalog_hash: 'fixture-catalog',
      entries: [
        {
          id: 'fixture-surface',
          requirement_id: 'TRUTH-DRIFT-01',
          claim: 'Fixture surface',
          surface_category: 'runtime_surface',
          implementation: { paths: ['get-stuff-done/bin/lib/example.cjs'] },
          evidence: [{ type: 'command', ref: 'fixture', observed: {} }],
          observed_drift: false,
          activity_status: 'healthy',
          severity: 'MAJOR',
          drift_type: 'execution_drift',
        },
      ],
    },
    runtimeEntries: [
      {
        id: 'fixture-surface',
        requirement_id: 'TRUTH-DRIFT-01',
        claim: 'Fixture surface',
        surface_category: 'runtime_surface',
        implementation: { paths: ['get-stuff-done/bin/lib/example.cjs'] },
        evidence: [{ type: 'command', ref: 'fixture', observed: {} }],
        observed_drift: true,
        activity_status: 'active',
        severity: 'CRITICAL',
        drift_type: 'execution_drift',
        false_truth_perception: true,
      },
      {
        id: 'historical-fixture',
        requirement_id: 'TRUTH-DRIFT-01',
        claim: 'Historical fixture',
        surface_category: 'historical_structural',
        implementation: { paths: ['.planning/old.md'] },
        evidence: [{ type: 'file', ref: '.planning/old.md' }],
        observed_drift: true,
        activity_status: 'historical',
        severity: 'MAJOR',
        drift_type: 'verification_drift',
      },
    ],
    now: '2026-03-27T12:00:00.000Z',
  };
}

describe('drift CLI', () => {
  test('drift scan writes the latest report deterministically', () => {
    const tmpDir = createTempProject();
    const fixturePath = path.join(tmpDir, 'drift-fixture.json');
    writeJson(fixturePath, makeFixture());

    try {
      const result = runGsdTools(['drift', 'scan', '--raw'], tmpDir, {
        env: { GSD_DRIFT_TEST_FIXTURE: fixturePath },
      });
      assert.strictEqual(result.success, false);
      const payload = JSON.parse(result.output);
      assert.strictEqual(payload.path, '.planning/drift/latest-report.json');
      assert.strictEqual(fs.existsSync(path.join(tmpDir, '.planning/drift/latest-report.json')), true);
      assert.strictEqual(payload.summary.critical, 1);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('drift report returns machine-readable data from the latest report', () => {
    const tmpDir = createTempProject();
    const reportPath = path.join(tmpDir, '.planning/drift/latest-report.json');
    writeJson(reportPath, {
      schema: 'gsd_drift_report',
      generated_at: new Date().toISOString(),
      summary: { active: 0 },
      findings: [],
    });

    try {
      const result = runGsdTools(['drift', 'report', '--raw'], tmpDir);
      assert.strictEqual(result.success, true, result.error);
      const payload = JSON.parse(result.output);
      assert.strictEqual(payload.status, 'ok');
      assert.strictEqual(payload.report.schema, 'gsd_drift_report');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('drift status suppresses historical findings by default and reveals them with --full', () => {
    const tmpDir = createTempProject();
    const reportPath = path.join(tmpDir, '.planning/drift/latest-report.json');
    writeJson(reportPath, {
      schema: 'gsd_drift_report',
      generated_at: new Date().toISOString(),
      summary: { active: 1, historical: 1 },
      findings: [
        { id: 'active-fixture', severity: 'MAJOR', surface_state: 'active_drift', drift_type: 'execution_drift', activity_status: 'active' },
        { id: 'historical-fixture', severity: 'MINOR', surface_state: 'historical', drift_type: 'verification_drift', activity_status: 'historical' },
      ],
    });

    try {
      const compact = runGsdTools(['drift', 'status'], tmpDir);
      const full = runGsdTools(['drift', 'status', '--full'], tmpDir);
      assert.strictEqual(compact.success, true, compact.error);
      assert.strictEqual(full.success, true, full.error);
      assert.match(compact.output, /Historical findings suppressed: 1/);
      assert.match(full.output, /Historical findings:/);
      assert.match(full.output, /historical-fixture/);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('drift status and report surface missing report state explicitly', () => {
    const tmpDir = createTempProject();
    try {
      const status = runGsdTools(['drift', 'status'], tmpDir);
      const report = runGsdTools(['drift', 'report', '--raw'], tmpDir);
      assert.strictEqual(status.success, true, status.error);
      assert.strictEqual(report.success, true, report.error);
      assert.match(status.output, /Drift status: missing/);
      assert.strictEqual(JSON.parse(report.output).status, 'missing');
    } finally {
      cleanup(tmpDir);
    }
  });
});
