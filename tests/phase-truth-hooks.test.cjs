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

function setupInvariantClosureProject(tmpDir) {
  writeFile(tmpDir, '.planning/ROADMAP.md', `## Milestones\n- [ ] **v0.7.0 Truth**\n\n## v0.7.0 Truth\n\n- [ ] **Phase 75: Degraded Mode Enforcement**\n\n### Phase 75: Degraded Mode Enforcement\n\n**Goal:** Enforce degraded mode truth for model-facing memory.\n**Requirements**: TRUTH-DEGRADE-01, TRUTH-MEMORY-01\n**Depends on:** Phase 74\n**Status**: [Planned]\n\nPlans:\n- [ ] 75-01-PLAN.md — degraded policy\n- [ ] 75-02-PLAN.md — fail-closed enforcement\n`);
  writeFile(tmpDir, '.planning/REQUIREMENTS.md', `TRUTH-DEGRADE-01: Degraded behavior must be explicit and fail closed. | source: test\nTRUTH-MEMORY-01: Model-facing memory must fail closed under canonical memory loss. | source: test\n`);
  writeFile(tmpDir, '.planning/STATE.md', `---\ncurrent_phase: 75\n---\n# State\n`);
  writeFile(tmpDir, '.planning/phases/75-degraded-mode-enforcement/75-01-PLAN.md', '# Plan\n');
  writeFile(tmpDir, '.planning/phases/75-degraded-mode-enforcement/75-02-PLAN.md', '# Plan\n');
  writeFile(tmpDir, '.planning/phases/75-degraded-mode-enforcement/75-01-SUMMARY.md', `---\nphase: 75\nplan: 01\nprovides:\n  - canonical degraded-policy evaluator and artifact\n---\n\n# Summary\n`);
  writeFile(tmpDir, '.planning/phases/75-degraded-mode-enforcement/75-02-SUMMARY.md', `---\nphase: 75\nplan: 02\nprovides:\n  - top-level CLI blocking for unsafe truth-bearing workflows\n---\n\n# Summary\n`);
  writeFile(tmpDir, '.planning/phases/75-degraded-mode-enforcement/75-VERIFICATION.md', `---\nphase: "75"\nverified: 2026-03-28T00:00:00Z\nstatus: VALID\nscore: 2/2 requirements verified\n---\n\n# Verification\n\n## Observable Truths\n\n| # | Truth | Status | Evidence |\n|---|---|---|---|\n| 1 | Model-facing memory fails closed under canonical memory loss. | VALID | \`tests/brain-mcp-degraded-mode.test.cjs\` |\n\n## Requirement Coverage\n\n| Requirement | Status | Evidence | Gap |\n|---|---|---|---|\n| TRUTH-DEGRADE-01 | VALID | \`tests/brain-health.test.cjs\` | - |\n| TRUTH-MEMORY-01 | VALID | \`tests/brain-mcp-degraded-mode.test.cjs\` | - |\n\n## Anti-Pattern Scan\n\n| File | Pattern | Classification | Impact |\n|---|---|---|---|\n| None | - | - | - |\n\n## Drift Analysis\n\n\`\`\`json\n[]\n\`\`\`\n\n## Final Status\n\n\`\`\`json\n{\"status\":\"VALID\",\"reason\":\"All same-area invariants are satisfied.\"}\n\`\`\`\n`);
  writeFile(tmpDir, '.planning/phases/75-degraded-mode-enforcement/75-INVARIANTS.yaml', JSON.stringify({
    phase: '75',
    enforcement_area: 'Model-Facing Memory Truth Closure',
    invariants: [
      { name: 'memory_blocking', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] },
      { name: 'planning_memory_blocking', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] },
      { name: 'degraded_state_signaling', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] },
      { name: 'drift_input_validity', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] },
      { name: 'verification_integrity', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] }
    ]
  }, null, 2));
  writeFile(tmpDir, '.planning/drift/latest-report.json', JSON.stringify({
    generated_at: '2026-03-28T00:00:00Z',
    path: '.planning/drift/latest-report.json',
    status: 'fresh',
    findings: [],
    surfaces: [],
    summary: { active: 0, critical: 0, major: 0, minor: 0 }
  }, null, 2));
  writeFile(tmpDir, '.planning/drift/latest-reconciliation.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    applied_changes: [],
    unchanged: [],
    reverification_required: [],
    summary: { critical: 0, major: 0, minor: 0 }
  }, null, 2));
  writeFile(tmpDir, '.planning/health/latest-degraded-state.json', JSON.stringify({
    aggregate_state: 'UNSAFE',
    subsystems: {
      model_facing_memory: { canonical_state: 'UNSAFE', reason: 'canonical_postgres_memory_unavailable' },
      drift_truth: { canonical_state: 'HEALTHY', reason: 'drift_truth_fresh' },
      reconciliation_truth: { canonical_state: 'HEALTHY', reason: 'reconciliation_truth_fresh' }
    },
    blocked_workflows: [
      { workflow: 'context:plan-phase', subsystem: 'model_facing_memory', reason: 'canonical_postgres_memory_unavailable' },
      { workflow: 'context:execute-plan', subsystem: 'model_facing_memory', reason: 'canonical_postgres_memory_unavailable' }
    ]
  }, null, 2));
}

function setupReconciliationInvariantClosureProject(tmpDir) {
  writeFile(tmpDir, '.planning/ROADMAP.md', `## Milestones\n- [ ] **v0.7.0 Truth**\n\n## v0.7.0 Truth\n\n- [ ] **Phase 74: State Reconciliation Layer**\n\n### Phase 74: State Reconciliation Layer\n\n**Goal:** Reconcile detected inconsistencies deterministically.\n**Requirements**: TRUTH-DRIFT-02\n**Depends on:** Phase 73\n**Status**: [Planned]\n\nPlans:\n- [ ] 74-01-PLAN.md — reconcile state\n`);
  writeFile(tmpDir, '.planning/REQUIREMENTS.md', `TRUTH-DRIFT-02: Reconciliation truth must be machine-readable and reproducible. | source: test\n`);
  writeFile(tmpDir, '.planning/STATE.md', `---\ncurrent_phase: 74\n---\n# State\n`);
  writeFile(tmpDir, '.planning/phases/74-state-reconciliation-layer/74-01-PLAN.md', '# Plan\n');
  writeFile(tmpDir, '.planning/phases/74-state-reconciliation-layer/74-01-SUMMARY.md', `---\nphase: 74\nplan: 01\nprovides:\n  - deterministic reconciliation surfaces\n---\n\n# Summary\n`);
  writeFile(tmpDir, '.planning/phases/74-state-reconciliation-layer/74-VERIFICATION.md', `---\nphase: "74"\nverified: 2026-03-28T00:00:00Z\nstatus: VALID\nscore: 1/1 requirements verified\n---\n\n# Verification\n\n## Observable Truths\n\n| # | Truth | Status | Evidence |\n|---|---|---|---|\n| 1 | Preview and reconcile surfaces are directly reproducible. | VALID | \`node get-stuff-done/bin/gsd-tools.cjs drift preview --raw\`, \`node get-stuff-done/bin/gsd-tools.cjs drift reconcile --raw\` |\n\n## Requirement Coverage\n\n| Requirement | Status | Evidence | Gap |\n|---|---|---|---|\n| TRUTH-DRIFT-02 | VALID | \`node get-stuff-done/bin/gsd-tools.cjs drift preview --raw\`, \`node get-stuff-done/bin/gsd-tools.cjs drift reconcile --raw\`, \`.planning/drift/latest-reconciliation.json\` | - |\n\n## Anti-Pattern Scan\n\n| File | Pattern | Classification | Impact |\n|---|---|---|---|\n| None | - | - | - |\n\n## Drift Analysis\n\n\`\`\`json\n[]\n\`\`\`\n\n## Final Status\n\n\`\`\`json\n{\"status\":\"VALID\",\"reason\":\"Reconciliation closure invariants are satisfied.\"}\n\`\`\`\n`);
  writeFile(tmpDir, '.planning/phases/74-state-reconciliation-layer/74-INVARIANTS.yaml', JSON.stringify({
    phase: '74',
    enforcement_area: 'Reconciliation Truth Closure',
    invariants: [
      { name: 'reconciliation_artifact_fresh', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] },
      { name: 'preview_entrypoint_runnable', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] },
      { name: 'reconcile_entrypoint_runnable', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] },
      { name: 'reconciliation_mutation_recorded', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] },
      { name: 'verification_integrity', affects_final_truth_synthesis: true, expected_evidence_surfaces: [] }
    ]
  }, null, 2));
  writeFile(tmpDir, '.planning/drift/latest-report.json', JSON.stringify({
    schema: 'gsd_drift_report',
    generated_at: '2026-03-28T00:00:00Z',
    findings: [],
    summary: { active: 0, critical: 0, major: 0, minor: 0 }
  }, null, 2));
  writeFile(tmpDir, '.planning/drift/latest-reconciliation.json', JSON.stringify({
    timestamp: '2026-03-28T00:00:01Z',
    applied_changes: [],
    unchanged: [],
    reverification_required: [],
    summary: { critical: 0, major: 0, minor: 0 }
  }, null, 2));
  writeFile(tmpDir, '.planning/health/latest-degraded-state.json', JSON.stringify({
    aggregate_state: 'UNSAFE',
    subsystems: {
      model_facing_memory: { canonical_state: 'UNSAFE', reason: 'canonical_postgres_memory_unavailable' }
    },
    blocked_workflows: [
      { workflow: 'context:plan-phase', subsystem: 'model_facing_memory', reason: 'canonical_postgres_memory_unavailable' },
      { workflow: 'context:execute-plan', subsystem: 'model_facing_memory', reason: 'canonical_postgres_memory_unavailable' }
    ]
  }, null, 2));
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

  test('phase truth uses invariant closure for expected fail-closed memory posture', () => {
    cleanup(tmpDir);
    tmpDir = createTempProject();
    setupInvariantClosureProject(tmpDir);

    const result = runGsdTools(['phase-truth', 'generate', '75', '--raw'], tmpDir);
    assert.ok(result.success, result.error);
    assert.match(result.output, /75-TRUTH\.yaml$/);

    const rawTruth = fs.readFileSync(path.join(tmpDir, '.planning/phases/75-degraded-mode-enforcement/75-TRUTH.yaml'), 'utf-8');
    assert.match(rawTruth, /final_status: "VALID"/);
    assert.doesNotMatch(rawTruth, /Current degraded truth posture is UNSAFE/);
    assert.doesNotMatch(rawTruth, /context:plan-phase blocked by model_facing_memory/);
  });

  test('phase truth uses generic invariant closure for reconciliation truth', () => {
    cleanup(tmpDir);
    tmpDir = createTempProject();
    setupReconciliationInvariantClosureProject(tmpDir);

    const result = runGsdTools(['phase-truth', 'generate', '74', '--raw'], tmpDir);
    assert.ok(result.success, result.error);
    assert.match(result.output, /74-TRUTH\.yaml$/);

    const rawTruth = fs.readFileSync(path.join(tmpDir, '.planning/phases/74-state-reconciliation-layer/74-TRUTH.yaml'), 'utf-8');
    assert.match(rawTruth, /final_status: "VALID"/);
    assert.doesNotMatch(rawTruth, /Current degraded truth posture is UNSAFE/);
    assert.doesNotMatch(rawTruth, /context:plan-phase blocked by model_facing_memory/);
  });
});
