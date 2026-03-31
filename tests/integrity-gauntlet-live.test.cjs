'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  writeVerificationArtifact,
  assessVerification,
} = require('../get-stuff-done/bin/lib/integrity-gauntlet.cjs');
const { createTempGitProject, cleanup, runGsdTools } = require('./helpers.cjs');

function setupPhase79(projectDir) {
  const phaseDir = path.join(projectDir, '.planning', 'phases', '79-end-to-end-integrity-gauntlet');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.planning', 'ROADMAP.md'), '# Roadmap\n\n## Milestone v0.7.0\n\n### Phase 79: End-to-End Integrity Gauntlet\n', 'utf8');
  fs.writeFileSync(path.join(projectDir, '.planning', 'STATE.md'), '# State\n', 'utf8');
  fs.writeFileSync(path.join(projectDir, '.planning', 'REQUIREMENTS.md'), '# Requirements\n', 'utf8');
  return phaseDir;
}

describe('integrity gauntlet live parity and verification', () => {
  test('live-mode statuses are explicit when integrations are unavailable', () => {
    const projectDir = createTempGitProject();
    try {
      const phaseDir = setupPhase79(projectDir);
      const result = writeVerificationArtifact(projectDir, {
        phaseDir,
        deterministicResult: {
          ok: true,
          scenario_count: 19,
          results: [{ id: 'fake-verification-forged-verdict', expected_outcome: 'INVALID', actual_outcome: 'INVALID', matched: true }],
        },
        liveStatuses: [
          { id: 'plane-configured-truth-path', mode: 'live', availability: 'unavailable', reason: 'Plane configuration not present in environment.' },
          { id: 'declared-firecrawl-degradation', mode: 'live', availability: 'unavailable', reason: 'Firecrawl live configuration not present in environment.' },
        ],
      });

      assert.strictEqual(result.assessment.status, 'VALID');
      const verification = fs.readFileSync(path.join(phaseDir, '79-VERIFICATION.md'), 'utf8');
      assert.match(verification, /plane-configured-truth-path: unavailable/);
      assert.match(verification, /declared-firecrawl-degradation: unavailable/);
    } finally {
      cleanup(projectDir);
    }
  });

  test('classification mismatch between deterministic and live parity invalidates verification', () => {
    const assessment = assessVerification({
      deterministicResult: {
        ok: true,
        scenario_count: 19,
        results: [{ id: 'fake-verification-forged-verdict', expected_outcome: 'INVALID', actual_outcome: 'INVALID', matched: true }],
      },
      liveStatuses: [{ id: 'plane-configured-truth-path', mode: 'live', availability: 'available', reason: 'Configured.' }],
      liveParityResults: [{ id: 'plane-configured-truth-path', expected_outcome: 'CONDITIONAL', actual_outcome: 'INVALID' }],
    });

    assert.strictEqual(assessment.status, 'INVALID');
    assert.ok(assessment.blockers.some((item) => /Live parity mismatch/.test(item)));
  });

  test('final verification blocks on unmatched or unclassified deterministic outcomes', () => {
    const assessment = assessVerification({
      deterministicResult: {
        ok: false,
        scenario_count: 2,
        results: [
          { id: 'bad-scenario', expected_outcome: 'INVALID', actual_outcome: 'VALID', matched: false },
          { id: 'unknown-scenario', expected_outcome: 'INVALID', actual_outcome: 'VALIDISH', matched: false },
        ],
      },
      liveStatuses: [],
    });

    assert.strictEqual(assessment.status, 'INVALID');
    assert.ok(assessment.blockers.some((item) => /did not match/.test(item)));
    assert.ok(assessment.blockers.some((item) => /unclassified outcome/.test(item)));
  });
});

describe('milestone closeout gating', () => {
  test('milestone completion fails closed when 79-VERIFICATION.md is missing', () => {
    const projectDir = createTempGitProject();
    try {
      setupPhase79(projectDir);
      const result = runGsdTools(['milestone', 'complete', 'v0.7.0', '--raw'], projectDir);
      assert.strictEqual(result.success, false, 'milestone completion should fail without verification');
      const payload = JSON.parse(result.output);
      assert.strictEqual(payload.reason, 'missing_phase_79_verification');
    } finally {
      cleanup(projectDir);
    }
  });

  test('milestone completion fails closed when 79-VERIFICATION.md is not VALID', () => {
    const projectDir = createTempGitProject();
    try {
      const phaseDir = setupPhase79(projectDir);
      fs.writeFileSync(path.join(phaseDir, '79-VERIFICATION.md'), '---\nstatus: INVALID\n---\n# Phase 79 Verification\n', 'utf8');
      const result = runGsdTools(['milestone', 'complete', 'v0.7.0', '--raw'], projectDir);
      assert.strictEqual(result.success, false, 'milestone completion should fail on invalid verification');
      const payload = JSON.parse(result.output);
      assert.strictEqual(payload.reason, 'phase_79_verification_not_valid');
    } finally {
      cleanup(projectDir);
    }
  });
});

// GSD-AUTHORITY: 79-01-3:ac1dc6cb06fb7c8a4b160507c2233af0ff5cbaa77554329b5f17a95627c38afa
