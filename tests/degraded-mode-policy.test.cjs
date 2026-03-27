const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const degradedMode = require('../get-stuff-done/bin/lib/degraded-mode.cjs');

describe('degraded mode policy', () => {
  test('normalizes mixed raw states into canonical policy vocabulary', () => {
    assert.strictEqual(degradedMode.normalizePolicyState('ok'), 'HEALTHY');
    assert.strictEqual(degradedMode.normalizePolicyState('warning'), 'DEGRADED');
    assert.strictEqual(degradedMode.normalizePolicyState('UNHEALTHY'), 'UNSAFE');
    assert.strictEqual(degradedMode.normalizePolicyState('blocked'), 'UNSAFE');
  });

  test('stale truth posture blocks truth-bearing workflows but keeps diagnostics readable', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-degraded-policy-'));
    fs.mkdirSync(path.join(tmpDir, '.planning', 'drift'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-report.json'), JSON.stringify({
      generated_at: '2026-03-27T00:00:00.000Z',
      findings: [],
      summary: { active: 0 },
    }, null, 2));

    const snapshot = await degradedMode.buildDegradedState(tmpDir, {
      now: '2026-03-27T03:00:00.000Z',
      planningServer: { status: 'ok', detail: null },
      backendState: {
        active_backend: 'postgres',
        degraded: false,
      },
    });

    assert.strictEqual(snapshot.aggregate_state, 'UNSAFE');
    const enforcement = degradedMode.evaluateWorkflow(snapshot, 'verify:integrity');
    assert.strictEqual(enforcement.allowed, false);
    assert.strictEqual(enforcement.canonical_state, 'UNSAFE');
    assert.match(enforcement.reason, /drift_truth_(missing|stale)|reconciliation_truth_(missing|stale)/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('aggregate state follows worst truth-bearing subsystem state', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-degraded-policy-'));
    fs.mkdirSync(path.join(tmpDir, '.planning', 'drift'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-report.json'), JSON.stringify({
      generated_at: '2026-03-27T12:00:00.000Z',
      findings: [],
      summary: { active: 0 },
    }, null, 2));
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-reconciliation.json'), JSON.stringify({
      timestamp: '2026-03-27T12:00:00.000Z',
      applied_changes: [],
      unchanged: [],
      reverification_required: [],
      summary: { critical: 0, major: 0, minor: 0 },
    }, null, 2));

    const snapshot = await degradedMode.buildDegradedState(tmpDir, {
      now: '2026-03-27T12:05:00.000Z',
      planningServer: { status: 'error', detail: 'refused' },
      backendState: {
        active_backend: 'postgres',
        degraded: false,
      },
    });

    assert.strictEqual(snapshot.subsystems.planning_server.canonical_state, 'UNSAFE');
    assert.strictEqual(snapshot.aggregate_state, 'UNSAFE');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
