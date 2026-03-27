const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const brainManager = require('../get-stuff-done/bin/lib/brain-manager.cjs');

describe('brain health drift integration', () => {
  const originalChecks = {
    _checkPostgres: brainManager._checkPostgres,
    _checkRabbitMq: brainManager._checkRabbitMq,
    _checkPlanningServerDetailed: brainManager._checkPlanningServerDetailed,
  };

  afterEach(() => {
    brainManager._checkPostgres = originalChecks._checkPostgres;
    brainManager._checkRabbitMq = originalChecks._checkRabbitMq;
    brainManager._checkPlanningServerDetailed = originalChecks._checkPlanningServerDetailed;
  });

  test('active drift in latest report appears in operator health', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-brain-health-'));
    const reportPath = path.join(tmpDir, '.planning/drift/latest-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      schema: 'gsd_drift_report',
      generated_at: '2026-03-27T12:00:00.000Z',
      summary: { active: 1 },
      findings: [
        { id: 'critical-fixture', severity: 'CRITICAL', activity_status: 'active' },
      ],
    }, null, 2), 'utf-8');

    brainManager._checkPostgres = async () => ({ status: 'ok', detail: null });
    brainManager._checkRabbitMq = async () => ({ status: 'ok', detail: null });
    brainManager._checkPlanningServerDetailed = async () => ({ status: 'ok', detail: null });

    try {
      const health = await brainManager.checkHealth({
        cwd: tmpDir,
        now: '2026-03-27T12:05:00.000Z',
      });
      assert.strictEqual(health.drift.status, 'degraded');
      assert.strictEqual(health.drift.highest_severity, 'CRITICAL');
      assert.strictEqual(health.drift.active_findings, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('missing report is surfaced explicitly instead of treated as healthy', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-brain-health-'));
    brainManager._checkPostgres = async () => ({ status: 'ok', detail: null });
    brainManager._checkRabbitMq = async () => ({ status: 'ok', detail: null });
    brainManager._checkPlanningServerDetailed = async () => ({ status: 'ok', detail: null });

    try {
      const health = await brainManager.checkHealth({ cwd: tmpDir });
      assert.strictEqual(health.drift.status, 'missing');
      assert.match(health.drift.detail, /No drift report has been generated/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
