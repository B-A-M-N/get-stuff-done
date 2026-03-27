const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildCatalog,
  renderCatalogYaml,
  renderSummary,
  writeCatalog,
} = require('../get-stuff-done/bin/lib/drift-catalog.cjs');
const { verifySignature } = require('../get-stuff-done/bin/lib/authority.cjs');

function makeProbeFixture() {
  return {
    head: 'abc123',
    installedCli: '/home/test/.codex/get-shit-done/bin/gsd-tools.cjs',
    validateConsistency: { ok: true, exit_code: 0, stdout: 'passed' },
    stateVerify: { ok: true, exit_code: 0, stdout: 'passed' },
    degradedMode: { ok: true, exit_code: 0, stdout: 'ok' },
    repoMilestone: {
      ok: true,
      exit_code: 0,
      parsed: { milestone_version: 'v0.7.0', phase_count: 1 },
    },
    installedMilestone: {
      ok: true,
      exit_code: 0,
      parsed: { milestone_version: 'v0.7.0', phase_count: 1 },
    },
    repoBrainStatus: {
      ok: true,
      exit_code: 0,
      parsed: {
        model_facing_memory: { status: 'blocked' },
      },
    },
    repoOpenStatus: {
      ok: true,
      exit_code: 0,
      parsed: {
        status: 'degraded',
        reason: 'postgres_unavailable',
        backend_state: { configured_backend: 'sqlite', active_backend: 'sqlite' },
      },
    },
    installedOpenStatus: {
      ok: true,
      exit_code: 0,
      parsed: {
        status: 'degraded',
        reason: 'embedding_unavailable',
        backend_state: { configured_backend: 'postgres', active_backend: 'postgres' },
      },
    },
    staticIntegrityClaimCount: 4,
    historicalEvidencePaths: [
      '.planning/v0.6.0-MILESTONE-AUDIT.md',
      '.planning/phases/55-open-brain-v1-foundations/55-VERIFICATION.md',
    ],
  };
}

describe('drift-catalog', () => {
  test('catalog generation covers full truth-surface categories instead of planning-only entries', () => {
    const catalog = buildCatalog(process.cwd(), { probes: makeProbeFixture() });
    const categories = new Set(catalog.entries.map((entry) => entry.surface_category));

    assert.ok(categories.has('planning_artifact'));
    assert.ok(categories.has('runtime_surface'));
    assert.ok(categories.has('degraded_mode'));
    assert.ok(categories.has('memory_boundary'));
    assert.ok(categories.has('historical_structural'));
  });

  test('recent still-live structural history is included in the catalog', () => {
    const catalog = buildCatalog(process.cwd(), { probes: makeProbeFixture() });
    const historyEntry = catalog.entries.find((entry) => entry.id === 'phase70-recent-structural-history-50-55');

    assert.ok(historyEntry);
    assert.strictEqual(historyEntry.activity_status, 'historical');
    assert.ok(historyEntry.evidence.some((item) => item.ref.includes('55-VERIFICATION.md')));
  });

  test('catalog entries require requirement, implementation, and evidence bindings', () => {
    const catalog = buildCatalog(process.cwd(), { probes: makeProbeFixture() });
    for (const entry of catalog.entries) {
      assert.ok(entry.requirement_id);
      assert.ok(entry.claim);
      assert.ok(Array.isArray(entry.implementation.paths));
      assert.ok(entry.implementation.paths.length > 0);
      assert.ok(Array.isArray(entry.evidence));
      assert.ok(entry.evidence.length > 0);
      assert.ok(entry.drift_type);
      assert.ok(entry.severity);
    }
  });

  test('rendered yaml is machine-first and includes current and historical truth surfaces', () => {
    const catalog = buildCatalog(process.cwd(), { probes: makeProbeFixture() });
    const yaml = renderCatalogYaml(catalog);

    assert.match(yaml, /schema: gsd_drift_catalog/);
    assert.match(yaml, /surface_category: runtime_surface/);
    assert.match(yaml, /surface_category: historical_structural/);
  });

  test('summary is derived from machine-classified entries without replacing the catalog', () => {
    const catalog = buildCatalog(process.cwd(), { probes: makeProbeFixture() });
    const summary = renderSummary(catalog);

    assert.match(summary, /# Phase 70 Drift Summary/);
    assert.match(summary, /Active Hotspots/);
    assert.match(summary, /Historical Non-Blocking Drift/);
    assert.match(summary, /Memory Truth Boundaries/);
  });

  test('writeCatalog writes a signed yaml artifact', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-drift-catalog-'));
    const targetDir = path.join(tmpDir, '.planning/phases/70-drift-surface-mapping');
    fs.mkdirSync(targetDir, { recursive: true });

    try {
      const result = writeCatalog(tmpDir, {
        probes: makeProbeFixture(),
        phase: '70',
        plan: '01',
        wave: '1',
      });

      const written = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');
      const verification = verifySignature(written);
      assert.strictEqual(verification.valid, true);
      assert.match(written, /# GSD-AUTHORITY:/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
