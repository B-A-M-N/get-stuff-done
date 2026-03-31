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

function setupCliProject(tmpDir) {
  writeFile(tmpDir, '.planning/ROADMAP.md', `## Milestones\n- [ ] **v0.7.0 Truth**\n\n## v0.7.0 Truth\n\n### Phase 78: Phase Truth Contracts\n\n**Goal:** Standardize phase truth.\n**Requirements**: TRUTH-PHASE-01, TRUTH-VERIFY-01\n**Depends on:** Phase 77\n**Status**: [Planned]\n\nPlans:\n- [ ] 78-01-PLAN.md — test plan\n`);
  writeFile(tmpDir, '.planning/REQUIREMENTS.md', `TRUTH-PHASE-01: Every phase must produce a structured truth artifact. | source: test\nTRUTH-VERIFY-01: VERIFICATION.md must be evidence-first and structured. | source: test\n`);
  writeFile(tmpDir, '.planning/STATE.md', '# State\n');
  writeFile(tmpDir, '.planning/phases/78-phase-truth-contracts/78-01-PLAN.md', '# Plan\n');
  writeFile(tmpDir, '.planning/phases/78-phase-truth-contracts/78-01-SUMMARY.md', `---\nphase: 78\nplan: 01\nprovides:\n  - generated phase truth output\n---\n\n# Summary\n\n## Task Commits\n\n1. abcdef1\n\n## Proof Index\n\n\`\`\`json\n[{\"task\":1,\"canonical_commit\":\"abcdef1\",\"files\":[\"get-stuff-done/bin/lib/phase-truth.cjs\"],\"verify\":\"node --test tests/phase-truth-cli.test.cjs\",\"evidence\":[\"tests/phase-truth-cli.test.cjs\"],\"runtime_required\":false,\"runtime_proof\":[]}]\n\`\`\`\n`);
  writeFile(tmpDir, '.planning/phases/78-phase-truth-contracts/78-VERIFICATION.md', `---\nphase: "78"\nname: "Phase Truth Contracts"\ncreated: 2026-03-27\nverified: 2026-03-27T00:00:00Z\nstatus: VALID\nscore: 1/1 requirements verified\n---\n\n# Verification\n\n## Observable Truths\n\n| # | Truth | Status | Evidence |\n|---|-------|--------|----------|\n| 1 | Phase truth exists | VALID | \`get-stuff-done/bin/lib/phase-truth.cjs\` |\n\n## Requirement Coverage\n\n| Requirement | Status | Evidence | Gap |\n|-------------|--------|----------|-----|\n| TRUTH-PHASE-01 | VALID | \`get-stuff-done/bin/lib/phase-truth.cjs\` | - |\n\n## Anti-Pattern Scan\n\n| File | Pattern | Classification | Impact |\n|------|---------|----------------|--------|\n| None | - | - | - |\n\n## Drift Analysis\n\n\`\`\`json\n[]\n\`\`\`\n\n## Final Status\n\n\`\`\`json\n{\"status\":\"VALID\",\"reason\":\"All evidence present.\"}\n\`\`\`\n`);
  writeFile(tmpDir, '.planning/drift/latest-report.json', JSON.stringify({ summary: { active: 0, critical: 0, major: 0, minor: 0 }, surfaces: [] }, null, 2));
  writeFile(tmpDir, '.planning/drift/latest-reconciliation.json', JSON.stringify({ timestamp: '2026-03-27T00:00:00Z', applied_changes: [], unchanged: [], reverification_required: [], summary: { critical: 0, major: 0, minor: 0 } }, null, 2));
  writeFile(tmpDir, '.planning/health/latest-degraded-state.json', JSON.stringify({ aggregate_state: 'HEALTHY', blocked_workflows: [] }, null, 2));
}

describe('phase-truth generate CLI', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    setupCliProject(tmpDir);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('writes YAML and markdown artifacts and reports final status', () => {
    const result = runGsdTools(['phase-truth', 'generate', '78'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.ok(['VALID', 'CONDITIONAL', 'INVALID'].includes(output.final_status));
    assert.ok(fs.existsSync(path.join(tmpDir, output.machine_artifact)));
    assert.ok(fs.existsSync(path.join(tmpDir, output.markdown_artifact)));
  });
});
