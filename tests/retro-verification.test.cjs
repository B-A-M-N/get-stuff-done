const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  buildRetroVerificationArtifact,
  renderRetroVerificationMarkdown,
} = require('../get-stuff-done/bin/lib/retro-verification.cjs');
const { evaluateVerificationArtifact } = require('../get-stuff-done/bin/lib/verify.cjs');
const { createTempProject, cleanup } = require('./helpers.cjs');

function writeArtifact(tmpDir, relativePath, markdown) {
  const absolutePath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, markdown, 'utf-8');
  return relativePath;
}

describe('retro verification helper', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('summary-only inputs cannot produce VALID', () => {
    const artifact = buildRetroVerificationArtifact({
      phase: '72-verification-hardening',
      phase_number: '72',
      title: 'Verification Hardening',
      verified_at: '2026-03-28T04:30:00Z',
      phase_goal: 'Backfill evidence-first verification.',
      requirement_rows: [
        {
          requirement: 'TRUTH-VERIFY-01',
          description: 'Evidence-first contract exists.',
          summary_refs: ['.planning/phases/72-verification-hardening/72-01-SUMMARY.md'],
          direct_evidence: [],
          gaps: ['Direct proof is missing in the current environment.'],
        },
      ],
      observable_truths: [
        {
          truth: 'Verification contract is present.',
          summary_refs: ['.planning/phases/72-verification-hardening/72-01-SUMMARY.md'],
          direct_evidence: [],
          gaps: ['Current proof is limited to summary claims.'],
        },
      ],
      anti_patterns: [],
      key_links: [],
      required_artifacts: [],
      truth_gaps: [
        {
          type: 'verification_gap',
          description: 'Summary-only evidence cannot stand in for direct proof.',
        },
      ],
    });

    assert.strictEqual(artifact.final_status.status, 'CONDITIONAL');
    assert.strictEqual(artifact.requirement_rows[0].status, 'CONDITIONAL');
    assert.match(artifact.requirement_rows[0].evidence, /no direct evidence probe succeeded/i);

    const markdown = renderRetroVerificationMarkdown(artifact);
    const relPath = writeArtifact(
      tmpDir,
      '.planning/phases/72-verification-hardening/72-VERIFICATION.md',
      markdown
    );
    const result = evaluateVerificationArtifact(tmpDir, relPath);
    assert.strictEqual(result.valid, true, JSON.stringify(result));
  });

  test('direct file and command evidence can produce VALID rows', () => {
    const artifact = buildRetroVerificationArtifact({
      phase: '73-drift-detection-engine',
      phase_number: '73',
      title: 'Drift Detection Engine',
      verified_at: '2026-03-28T04:31:00Z',
      phase_goal: 'Verify current drift engine surfaces with direct proof.',
      requirement_rows: [
        {
          requirement: 'TRUTH-DRIFT-02',
          description: 'CLI surfaces expose persisted drift truth.',
          summary_refs: ['.planning/phases/73-drift-detection-engine/73-02-SUMMARY.md'],
          direct_evidence: [
            '`get-stuff-done/bin/gsd-tools.cjs`',
            '`node get-stuff-done/bin/gsd-tools.cjs drift status`',
          ],
        },
      ],
      observable_truths: [
        {
          truth: 'Drift CLI remains present.',
          summary_refs: ['.planning/phases/73-drift-detection-engine/73-02-SUMMARY.md'],
          direct_evidence: [
            '`get-stuff-done/bin/gsd-tools.cjs`',
            '`node get-stuff-done/bin/gsd-tools.cjs drift status`',
          ],
        },
      ],
      anti_patterns: [],
      key_links: [],
      required_artifacts: [],
      truth_gaps: [],
    });

    assert.strictEqual(artifact.final_status.status, 'VALID');
    assert.strictEqual(artifact.requirement_rows[0].status, 'VALID');

    const markdown = renderRetroVerificationMarkdown(artifact);
    const relPath = writeArtifact(
      tmpDir,
      '.planning/phases/73-drift-detection-engine/73-VERIFICATION.md',
      markdown
    );
    const result = evaluateVerificationArtifact(tmpDir, relPath);
    assert.strictEqual(result.valid, true, JSON.stringify(result));
  });

  test('workflow blocks and explicit gaps keep the artifact CONDITIONAL', () => {
    const artifact = buildRetroVerificationArtifact({
      phase: '74-state-reconciliation-layer',
      phase_number: '74',
      title: 'State Reconciliation Layer',
      verified_at: '2026-03-28T04:32:00Z',
      phase_goal: 'Verify preview and reconcile surfaces without fabricating unavailable proof.',
      requirement_rows: [
        {
          requirement: 'TRUTH-CLAIM-01',
          description: 'Reconciliation writes a canonical machine artifact.',
          summary_refs: ['.planning/phases/74-state-reconciliation-layer/74-01-SUMMARY.md'],
          direct_evidence: ['`.planning/drift/latest-reconciliation.json`'],
          gaps: ['Workflow block: planning server was unavailable during prior truth generation.'],
        },
      ],
      observable_truths: [
        {
          truth: 'Reconciliation artifact exists.',
          direct_evidence: ['`.planning/drift/latest-reconciliation.json`'],
          gaps: ['Historical execution timing was not reproven.'],
        },
      ],
      anti_patterns: [],
      key_links: [],
      required_artifacts: [],
      truth_gaps: [
        {
          type: 'workflow_block',
          description: 'verify:workflow-readiness blocked by drift_truth: drift_truth_stale',
        },
      ],
    });

    assert.strictEqual(artifact.requirement_rows[0].status, 'CONDITIONAL');
    assert.strictEqual(artifact.final_status.status, 'CONDITIONAL');
    assert.ok(
      artifact.drift_analysis.some((entry) => entry.type === 'verification_drift'),
      JSON.stringify(artifact.drift_analysis)
    );
  });

  test('status normalization rejects values outside VALID, CONDITIONAL, or INVALID', () => {
    assert.throws(
      () =>
        buildRetroVerificationArtifact({
          phase: '72-verification-hardening',
          phase_number: '72',
          title: 'Verification Hardening',
          verified_at: '2026-03-28T04:33:00Z',
          phase_goal: 'Verify status restriction.',
          requirement_rows: [
            {
              requirement: 'TRUTH-VERIFY-01',
              description: 'Status contract stays narrow.',
              direct_evidence: ['`get-stuff-done/bin/lib/verify.cjs`'],
              status: 'PASSED',
            },
          ],
        }),
      /VALID, CONDITIONAL, or INVALID/
    );
  });
});

// GSD-AUTHORITY: 80-01-1:0947bd75688fef0a8090709264c12c6350ec55af175e9c5cfe7e563018b88dd9
