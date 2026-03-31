const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempProject, cleanup } = require('./helpers.cjs');
const phaseTruth = require('../get-stuff-done/bin/lib/phase-truth.cjs');

function writeFile(root, relPath, content) {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function setupPhaseProject(tmpDir, options = {}) {
  const phase = options.phase || '78';
  const slug = options.slug || 'phase-truth-contracts';
  const phaseDir = `.planning/phases/${phase}-${slug}`;
  writeFile(tmpDir, '.planning/ROADMAP.md', `## Milestones\n- [ ] **v0.7.0 Truth**\n\n## v0.7.0 Truth\n\n### Phase ${phase}: ${slug.replace(/-/g, ' ')}\n\n**Goal:** Standardize phase truth.\n**Requirements**: TRUTH-PHASE-01, TRUTH-VERIFY-01\n**Depends on:** Phase 77\n**Status**: [Planned]\n\nPlans:\n- [ ] ${phase}-01-PLAN.md — test plan\n`);
  writeFile(tmpDir, '.planning/REQUIREMENTS.md', `TRUTH-PHASE-01: Every phase must produce a structured truth artifact. | source: test\nTRUTH-VERIFY-01: VERIFICATION.md must be evidence-first and structured. | source: test\n`);
  writeFile(tmpDir, '.planning/STATE.md', '# State\n');
  writeFile(tmpDir, `${phaseDir}/${phase}-01-PLAN.md`, '# Plan\n');
  if (options.includeSummary !== false) {
    writeFile(tmpDir, `${phaseDir}/${phase}-01-SUMMARY.md`, `---\nphase: ${phase}\nplan: 01\nprovides:\n  - generated phase truth output\n---\n\n# Summary\n\n## Task Commits\n\n1. abcdef1\n\n## Proof Index\n\n\`\`\`json\n[{\"task\":1,\"canonical_commit\":\"abcdef1\",\"files\":[\"get-stuff-done/bin/lib/phase-truth.cjs\"],\"verify\":\"node --test tests/phase-truth.test.cjs\",\"evidence\":[\"tests/phase-truth.test.cjs\"],\"runtime_required\":false,\"runtime_proof\":[]}]\n\`\`\`\n`);
  }
  if (options.includeVerification !== false) {
    writeFile(tmpDir, `${phaseDir}/${phase}-VERIFICATION.md`, options.verificationContent || `---\nphase: "${phase}"\nname: "${slug}"\ncreated: 2026-03-27\nverified: 2026-03-27T00:00:00Z\nstatus: VALID\nscore: 1/1 requirements verified\n---\n\n# Verification\n\n## Observable Truths\n\n| # | Truth | Status | Evidence |\n|---|-------|--------|----------|\n| 1 | Phase truth exists | VALID | \`get-stuff-done/bin/lib/phase-truth.cjs\` |\n\n## Requirement Coverage\n\n| Requirement | Status | Evidence | Gap |\n|-------------|--------|----------|-----|\n| TRUTH-PHASE-01 | VALID | \`get-stuff-done/bin/lib/phase-truth.cjs\` | - |\n\n## Anti-Pattern Scan\n\n| File | Pattern | Classification | Impact |\n|------|---------|----------------|--------|\n| None | - | - | - |\n\n## Drift Analysis\n\n\`\`\`json\n[]\n\`\`\`\n\n## Final Status\n\n\`\`\`json\n{\"status\":\"VALID\",\"reason\":\"All evidence present.\"}\n\`\`\`\n`);
  }
  writeFile(tmpDir, '.planning/drift/latest-report.json', JSON.stringify(options.driftReport || {
    summary: { active: 0, critical: 0, major: 0, minor: 0 },
    surfaces: [],
  }, null, 2));
  writeFile(tmpDir, '.planning/drift/latest-reconciliation.json', JSON.stringify(options.reconciliation || {
    timestamp: '2026-03-27T00:00:00Z',
    applied_changes: [],
    unchanged: [],
    reverification_required: [],
    summary: { critical: 0, major: 0, minor: 0 },
  }, null, 2));
  writeFile(tmpDir, '.planning/health/latest-degraded-state.json', JSON.stringify(options.degradedState || {
    aggregate_state: 'HEALTHY',
    blocked_workflows: [],
  }, null, 2));
}

describe('phase truth derivation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reconciliation invalidation overrides locally valid verification', () => {
    setupPhaseProject(tmpDir, {
      reconciliation: {
        timestamp: '2026-03-27T00:00:00Z',
        applied_changes: [
          { surface: 'phase_status', target: 'phase_78', to: 'INVALID', reason: 'execution_drift', severity: 'CRITICAL', evidence: [] },
        ],
        unchanged: [],
        reverification_required: [],
        summary: { critical: 1, major: 0, minor: 0 },
      },
    });

    const truth = phaseTruth.derivePhaseTruth(tmpDir, '78', { now: '2026-03-27T12:00:00Z' });
    assert.strictEqual(truth.final_status, 'INVALID');
    assert.ok(truth.status_reason.some((reason) => reason.includes('reconciliation')));
  });

  test('major drift and degraded posture yield conditional when no invalid condition exists', () => {
    setupPhaseProject(tmpDir, {
      phase: '77',
      slug: 'execution-surface-governance',
      driftReport: {
        summary: { active: 1, critical: 0, major: 1, minor: 0 },
        surfaces: [
          {
            id: 'phase77-drift',
            drift_type: 'verification_drift',
            severity: 'MAJOR',
            observed_drift: true,
            implementation: { paths: ['.planning/phases/77-execution-surface-governance/77-01-SUMMARY.md'] },
          },
        ],
      },
      degradedState: {
        aggregate_state: 'DEGRADED',
        blocked_workflows: [],
      },
    });

    const truth = phaseTruth.derivePhaseTruth(tmpDir, '77', { now: '2026-03-27T12:00:00Z' });
    assert.strictEqual(truth.final_status, 'CONDITIONAL');
    assert.ok(truth.gaps.some((gap) => gap.type === 'degraded_state_caveat'));
  });

  test('missing summary coverage forces invalid status', () => {
    setupPhaseProject(tmpDir, { includeSummary: false });
    const truth = phaseTruth.derivePhaseTruth(tmpDir, '78', { now: '2026-03-27T12:00:00Z' });
    assert.strictEqual(truth.final_status, 'INVALID');
    assert.ok(truth.gaps.some((gap) => gap.type === 'missing_required_evidence'));
  });

  test('invalid verification artifact becomes an explicit gap and cannot support valid status', () => {
    setupPhaseProject(tmpDir, {
      verificationContent: `---\nphase: "78"\nstatus: VALID\n---\n\n# Broken Verification\n\n## Final Status\n\n\`\`\`json\n{"status":"VALID","reason":"narrative only"}\n\`\`\`\n`,
    });
    const truth = phaseTruth.derivePhaseTruth(tmpDir, '78', { now: '2026-03-27T12:00:00Z' });
    assert.strictEqual(truth.final_status, 'INVALID');
    assert.ok(truth.gaps.some((gap) => gap.type === 'verification_gap'));
  });
});
