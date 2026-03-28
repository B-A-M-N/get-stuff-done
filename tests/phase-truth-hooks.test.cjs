const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempProject, cleanup, runGsdTools } = require('./helpers.cjs');

function writeFile(root, relPath, content) {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function verificationArtifact(phase) {
  return `---\nphase: "${phase}"\nname: "Phase ${phase}"\ncreated: 2026-03-27\nverified: 2026-03-27T00:00:00Z\nstatus: VALID\nscore: 1/1 requirements verified\n---\n\n# Verification\n\n## Observable Truths\n\n| # | Truth | Status | Evidence |\n|---|-------|--------|----------|\n| 1 | Phase truth exists | VALID | \`get-stuff-done/bin/lib/phase-truth.cjs\` |\n\n## Requirement Coverage\n\n| Requirement | Status | Evidence | Gap |\n|-------------|--------|----------|-----|\n| TRUTH-PHASE-01 | VALID | \`get-stuff-done/bin/lib/phase-truth.cjs\` | - |\n\n## Anti-Pattern Scan\n\n| File | Pattern | Classification | Impact |\n|------|---------|----------------|--------|\n| None | - | - | - |\n\n## Drift Analysis\n\n\`\`\`json\n[]\n\`\`\`\n\n## Final Status\n\n\`\`\`json\n{\"status\":\"VALID\",\"reason\":\"All evidence present.\"}\n\`\`\`\n`;
}

function setupHookProject(tmpDir) {
  writeFile(tmpDir, '.planning/ROADMAP.md', `## Milestones\n- [ ] **v0.7.0 Truth**\n\n## v0.7.0 Truth\n\n- [ ] **Phase 70: Drift Surface Mapping**\n- [ ] **Phase 78: Phase Truth Contracts**\n\n### Phase 70: Drift Surface Mapping\n\n**Goal:** Map drift surfaces.\n**Requirements**: TRUTH-DRIFT-01\n**Depends on:** None\n**Status**: [Planned]\n\nPlans:\n- [ ] 70-01-PLAN.md — drift\n\n### Phase 78: Phase Truth Contracts\n\n**Goal:** Standardize phase truth.\n**Requirements**: TRUTH-PHASE-01, TRUTH-VERIFY-01\n**Depends on:** Phase 77\n**Status**: [Planned]\n\nPlans:\n- [ ] 78-01-PLAN.md — test plan\n`);
  writeFile(tmpDir, '.planning/REQUIREMENTS.md', `TRUTH-PHASE-01: Every phase must produce a structured truth artifact. | source: test\nTRUTH-VERIFY-01: VERIFICATION.md must be evidence-first and structured. | source: test\nTRUTH-DRIFT-01: Drift is tracked. | source: test\n\n## Traceability\n\n| Requirement | Final Phase | Status |\n|-------------|-------------|--------|\n| TRUTH-PHASE-01 | Phase 78 | Planned |\n| TRUTH-VERIFY-01 | Phase 72 | Planned |\n| TRUTH-DRIFT-01 | Phase 70 | Planned |\n`);
  writeFile(tmpDir, '.planning/STATE.md', `---\ncurrent_phase: 78\n---\n# State\n`);
  writeFile(tmpDir, '.planning/phases/78-phase-truth-contracts/78-01-PLAN.md', '# Plan\n');
  writeFile(tmpDir, '.planning/phases/78-phase-truth-contracts/78-01-SUMMARY.md', `---\nphase: 78\nplan: 01\nprovides:\n  - generated phase truth output\n---\n\n# Summary\n\n## Task Commits\n\n1. abcdef1\n\n## Proof Index\n\n\`\`\`json\n[{\"task\":1,\"canonical_commit\":\"abcdef1\",\"files\":[\"get-stuff-done/bin/lib/phase-truth.cjs\"],\"verify\":\"node --test tests/phase-truth-hooks.test.cjs\",\"evidence\":[\"tests/phase-truth-hooks.test.cjs\"],\"runtime_required\":false,\"runtime_proof\":[]}]\n\`\`\`\n`);
  writeFile(tmpDir, '.planning/phases/78-phase-truth-contracts/78-VERIFICATION.md', verificationArtifact('78'));
  writeFile(tmpDir, '.planning/phases/70-drift-surface-mapping/70-01-PLAN.md', '# Plan\n');
  writeFile(tmpDir, '.planning/phases/70-drift-surface-mapping/70-01-SUMMARY.md', `---\nphase: 70\nplan: 01\nprovides:\n  - drift surface mapping\n---\n\n# Summary\n\n## Task Commits\n\n1. abcdef1\n\n## Proof Index\n\n\`\`\`json\n[{\"task\":1,\"canonical_commit\":\"abcdef1\",\"files\":[\".planning/phases/70-drift-surface-mapping/70-01-SUMMARY.md\"],\"verify\":\"node --test tests/phase-truth-hooks.test.cjs\",\"evidence\":[\"tests/phase-truth-hooks.test.cjs\"],\"runtime_required\":false,\"runtime_proof\":[]}]\n\`\`\`\n`);
  writeFile(tmpDir, '.planning/phases/70-drift-surface-mapping/70-VERIFICATION.md', verificationArtifact('70'));
  writeFile(tmpDir, '.planning/drift/latest-report.json', JSON.stringify({
    generated_at: '2026-03-27T00:00:00Z',
    summary: { active: 1, critical: 1, major: 0, minor: 0 },
    surfaces: [
      {
        id: 'phase70-drift',
        target_phase: '70',
        drift_type: 'execution_drift',
        severity: 'CRITICAL',
        observed_drift: true,
        implementation: { paths: ['.planning/phases/70-drift-surface-mapping/70-01-SUMMARY.md'] },
      },
    ],
  }, null, 2));
  writeFile(tmpDir, '.planning/drift/latest-reconciliation.json', JSON.stringify({
    timestamp: '2026-03-27T00:00:00Z',
    applied_changes: [],
    unchanged: [],
    reverification_required: [],
    summary: { critical: 0, major: 0, minor: 0 },
  }, null, 2));
  writeFile(tmpDir, '.planning/health/latest-degraded-state.json', JSON.stringify({ aggregate_state: 'HEALTHY', blocked_workflows: [] }, null, 2));
}

describe('phase truth regeneration hooks', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    setupHookProject(tmpDir);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('verification artifact verification regenerates truth for the phase', () => {
    const result = runGsdTools(['verify', 'verification-artifact', '.planning/phases/78-phase-truth-contracts/78-VERIFICATION.md'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_truth.generated, true);
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning/phases/78-phase-truth-contracts/78-TRUTH.yaml')));
  });

  test('drift reconcile regenerates truth for affected phases', () => {
    writeFile(tmpDir, '.planning/drift/latest-report.json', JSON.stringify({
      schema: 'gsd_drift_report',
      generated_at: '2026-03-27T00:00:00Z',
      findings: [
        {
          id: 'phase70-drift',
          severity: 'CRITICAL',
          drift_type: 'execution_drift',
          activity_status: 'active',
          historical: false,
          evidence: ['tests/phase-truth-hooks.test.cjs'],
        },
      ],
      summary: { active: 1, critical: 1, major: 0, minor: 0 },
    }, null, 2));
    const result = runGsdTools(['drift', 'reconcile', '--raw'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.ok(Array.isArray(output.phase_truth));
    assert.ok(output.phase_truth.some((entry) => entry.phase === '70' && entry.generated));
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning/phases/70-drift-surface-mapping/70-TRUTH.yaml')));
  });

  test('phase complete regenerates truth for the completed phase', () => {
    const result = runGsdTools(['phase', 'complete', '78', '--raw'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_truth.generated, true);
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning/phases/78-phase-truth-contracts/78-TRUTH.md')));
  });
});
