const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { TOOLS_PATH, createTempProject, cleanup } = require('./helpers.cjs');
const { signFile } = require('../get-stuff-done/bin/lib/authority.cjs');

function writeUnsafeTruthArtifacts(tmpDir, options = {}) {
  fs.mkdirSync(path.join(tmpDir, '.planning', 'drift'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'policy'), { recursive: true });

  fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');
  fs.copyFileSync(
    path.join(__dirname, '..', '.planning', 'policy', 'command-governance.yaml'),
    path.join(tmpDir, '.planning', 'policy', 'command-governance.yaml'),
  );
  signFile(path.join(tmpDir, '.planning', 'policy', 'command-governance.yaml'), '77', '01', '1');

  if (options.drift !== false) {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-report.json'), JSON.stringify({
      schema: 'gsd_drift_report',
      generated_at: options.driftGeneratedAt || '2026-03-27T00:00:00.000Z',
      findings: [],
      summary: { active: 0 },
    }, null, 2));
  }
  if (options.reconciliation !== false) {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-reconciliation.json'), JSON.stringify({
      timestamp: options.reconciledAt || '2026-03-27T00:00:00.000Z',
      applied_changes: [],
      unchanged: [],
      reverification_required: [],
      summary: { critical: 0, major: 0, minor: 0 },
    }, null, 2));
  }
}

function runTool(args, cwd) {
  return spawnSync(process.execPath, [TOOLS_PATH, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, GSD_MEMORY_MODE: 'sqlite', NODE_NO_WARNINGS: '1' },
  });
}

describe('command governance enforcement', () => {
  test('recovery-only commands stay runnable under unsafe posture', () => {
    const tmpDir = createTempProject();
    try {
      writeUnsafeTruthArtifacts(tmpDir, { drift: false, reconciliation: false });
      const result = runTool(['health', 'degraded-mode', '--raw'], tmpDir);
      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(result.stdout.trim(), 'degraded');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('warn-only commands stay runnable and emit structured warnings', () => {
    const tmpDir = createTempProject();
    try {
      writeUnsafeTruthArtifacts(tmpDir, { drift: false, reconciliation: false });
      const result = runTool(['state', 'json', '--raw'], tmpDir);
      assert.strictEqual(result.status, 0, result.stderr);
      const warning = JSON.parse(result.stderr.trim());
      assert.strictEqual(warning.warning.classification, 'warn_only');
      assert.strictEqual(warning.warning.state, 'UNSAFE');
      assert.ok(warning.warning.subsystem);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('hard-gated truth transitions still block under unsafe posture', () => {
    const tmpDir = createTempProject();
    try {
      writeUnsafeTruthArtifacts(tmpDir, { drift: false, reconciliation: false });
      const result = runTool(['context', 'build', '--workflow', 'plan-phase', '--raw'], tmpDir);
      assert.strictEqual(result.status, 1, result.stderr);
      const out = JSON.parse(result.stdout.trim());
      assert.strictEqual(out.classification, 'hard_gated_state_transition');
      assert.strictEqual(out.canonical_state, 'UNSAFE');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('drift reconcile stays runnable as a recovery path under unsafe posture', () => {
    const tmpDir = createTempProject();
    try {
      writeUnsafeTruthArtifacts(tmpDir, {
        driftGeneratedAt: '2026-03-27T00:00:00.000Z',
        reconciledAt: '2026-03-27T00:00:00.000Z',
      });
      const result = runTool(['drift', 'reconcile', '--raw'], tmpDir);
      assert.strictEqual(result.status, 0, result.stderr);
      const out = JSON.parse(result.stdout.trim());
      assert.ok(Array.isArray(out.decision?.applied_changes));
      assert.ok(fs.existsSync(path.join(tmpDir, '.planning', 'drift', 'latest-reconciliation.json')));
    } finally {
      cleanup(tmpDir);
    }
  });
});
