const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { runGsdTools, createTempProject, createTempGitProject, cleanup } = require('./helpers.cjs');

function writeTruthArtifacts(tmpDir, options = {}) {
  fs.mkdirSync(path.join(tmpDir, '.planning', 'drift'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');
  if (options.drift !== false) {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-report.json'), JSON.stringify({
      generated_at: options.driftGeneratedAt || '2026-03-27T00:00:00.000Z',
      findings: [],
      summary: { active: 0 },
    }, null, 2));
  } else {
    fs.rmSync(path.join(tmpDir, '.planning', 'drift', 'latest-report.json'), { force: true });
  }
  if (options.reconciliation !== false) {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-reconciliation.json'), JSON.stringify({
      timestamp: options.reconciledAt || '2026-03-27T00:00:00.000Z',
      applied_changes: [],
      unchanged: [],
      reverification_required: [],
      summary: { critical: 0, major: 0, minor: 0 },
    }, null, 2));
  } else {
    fs.rmSync(path.join(tmpDir, '.planning', 'drift', 'latest-reconciliation.json'), { force: true });
  }
}

describe('degraded mode enforcement', () => {
  test('context build blocks truth-bearing planning workflows under unsafe degraded policy', () => {
    const tmpDir = createTempProject();
    try {
      writeTruthArtifacts(tmpDir, { reconciliation: false });
      const result = runGsdTools(['context', 'build', '--workflow', 'plan-phase', '--raw'], tmpDir, {
        env: { GSD_MEMORY_MODE: 'sqlite' },
      });
      assert.strictEqual(result.success, false);
      const out = JSON.parse(result.output);
      assert.strictEqual(out.canonical_state, 'UNSAFE');
      assert.ok(['model_facing_memory', 'reconciliation_truth', 'drift_truth', 'planning_server'].includes(out.subsystem));
      assert.ok(Array.isArray(out.next_options));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('verify integrity blocks when current truth posture is unsafe', () => {
    const tmpDir = createTempProject();
    try {
      writeTruthArtifacts(tmpDir, { drift: false, reconciliation: false });
      const result = runGsdTools(['verify', 'integrity', '--raw'], tmpDir, {
        env: { GSD_MEMORY_MODE: 'sqlite' },
      });
      assert.strictEqual(result.success, false);
      const out = JSON.parse(result.output);
      assert.strictEqual(out.canonical_state, 'UNSAFE');
      assert.ok(['drift_truth', 'reconciliation_truth'].includes(out.subsystem));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('diagnostic surfaces remain runnable while unsafe truth-bearing workflows are blocked', () => {
    const tmpDir = createTempProject();
    try {
      writeTruthArtifacts(tmpDir, { drift: false, reconciliation: false });
      const result = runGsdTools(['health', 'degraded-mode'], tmpDir, {
        env: { GSD_MEMORY_MODE: 'sqlite' },
      });
      assert.strictEqual(result.success, true);
      const out = JSON.parse(result.output);
      assert.strictEqual(out.degraded, true);
      assert.ok(Array.isArray(out.blocked_workflows));
      assert.ok(out.blocked_workflows.length > 0);
    } finally {
      cleanup(tmpDir);
    }
  });
});
