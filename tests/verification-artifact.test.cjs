/**
 * Focused verification artifact tests for Phase 72.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writeVerificationArtifact(tmpDir, bodyLines) {
  const phaseDir = path.join(tmpDir, '.planning', 'phases', '72-verification');
  fs.mkdirSync(phaseDir, { recursive: true });
  const filePath = path.join(phaseDir, '72-VERIFICATION.md');
  fs.writeFileSync(filePath, bodyLines.join('\n'));
  return '.planning/phases/72-verification/72-VERIFICATION.md';
}

describe('verification-artifact validator', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('accepts valid direct-evidence artifact', () => {
    const relPath = writeVerificationArtifact(tmpDir, [
      '---',
      'phase: 72-verification',
      'verified: 2026-03-27T20:00:00Z',
      'status: VALID',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification contract is hardened | VALID | `get-stuff-done/templates/verification-report.md`, `node --test tests/verification-artifact.test.cjs` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | VALID | `get-stuff-done/bin/lib/verify.cjs`, `node --check get-stuff-done/bin/lib/verify.cjs` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| None | - | - | - |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"VALID","reason":"All requirements are backed by direct evidence."}',
      '```',
    ]);

    const result = runGsdTools(['verify', 'verification-artifact', relPath], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, JSON.stringify(output));
  });

  test('rejects summary-only evidence', () => {
    const relPath = writeVerificationArtifact(tmpDir, [
      '---',
      'phase: 72-verification',
      'verified: 2026-03-27T20:00:00Z',
      'status: INVALID',
      'score: 0/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification contract is hardened | INVALID | `72-01-SUMMARY.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | INVALID | `72-01-SUMMARY.md` | direct proof missing |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| None | - | - | - |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Summary-only evidence was used"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"INVALID","reason":"Summary-only evidence is not proof."}',
      '```',
    ]);

    const output = JSON.parse(runGsdTools(['verify', 'verification-artifact', relPath], tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('summary-only evidence')));
  });

  test('requires drift tagging for conditional artifacts', () => {
    const relPath = writeVerificationArtifact(tmpDir, [
      '---',
      'phase: 72-verification',
      'verified: 2026-03-27T20:00:00Z',
      'status: CONDITIONAL',
      'score: 0/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification contract is hardened | CONDITIONAL | `get-stuff-done/templates/verification-report.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-02 | CONDITIONAL | `get-stuff-done/templates/verification-report.md` | missing_evidence: runtime capture |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| None | - | - | - |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"CONDITIONAL","reason":"Gap remains open."}',
      '```',
    ]);

    const output = JSON.parse(runGsdTools(['verify', 'verification-artifact', relPath], tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('Drift Analysis must classify inconsistencies')));
  });

  test('treats blocker anti-patterns as INVALID and degraders as CONDITIONAL', () => {
    const blockerPath = writeVerificationArtifact(tmpDir, [
      '---',
      'phase: 72-verification',
      'verified: 2026-03-27T20:00:00Z',
      'status: CONDITIONAL',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification contract is hardened | VALID | `get-stuff-done/bin/lib/verify.cjs` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | VALID | `get-stuff-done/bin/lib/verify.cjs`, `node --check get-stuff-done/bin/lib/verify.cjs` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| src/live.js | `mockResponse` | blocker | Mocked logic presented as real |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Blocker anti-pattern remains active"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"CONDITIONAL","reason":"Incorrect downgrade."}',
      '```',
    ]);

    const blockerOutput = JSON.parse(runGsdTools(['verify', 'verification-artifact', blockerPath], tmpDir).output);
    assert.strictEqual(blockerOutput.valid, false);
    assert.ok(blockerOutput.errors.some(err => err.includes('Final Status must be INVALID')));

    const degraderPath = writeVerificationArtifact(tmpDir, [
      '---',
      'phase: 72-verification',
      'verified: 2026-03-27T20:00:00Z',
      'status: CONDITIONAL',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification contract is hardened | VALID | `get-stuff-done/bin/lib/verify.cjs` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-02 | VALID | `get-stuff-done/bin/lib/verify.cjs`, `node --check get-stuff-done/bin/lib/verify.cjs` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| src/live.js | `// TODO: tighten this` | degrader | Incomplete but non-blocking |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Degrader anti-pattern remains visible"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"CONDITIONAL","reason":"Non-blocking degrader remains."}',
      '```',
    ]);

    const degraderOutput = JSON.parse(runGsdTools(['verify', 'verification-artifact', degraderPath], tmpDir).output);
    assert.strictEqual(degraderOutput.valid, true, JSON.stringify(degraderOutput));
    assert.strictEqual(degraderOutput.anti_pattern_summary.degraders, true);
  });

  test('accepts historical drift as non-blocking when current scope is fully evidenced', () => {
    const relPath = writeVerificationArtifact(tmpDir, [
      '---',
      'phase: 72-verification',
      'verified: 2026-03-27T20:00:00Z',
      'status: VALID',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification contract is hardened | VALID | `get-stuff-done/bin/lib/verify.cjs`, `node --test tests/verification-artifact.test.cjs` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | VALID | `get-stuff-done/bin/lib/verify.cjs`, `node --check get-stuff-done/bin/lib/verify.cjs` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| legacy/old.js | `// TODO: remove` | historical_drift | Historical out-of-scope issue |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Historical out-of-scope drift remains visible only"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"VALID","reason":"Only historical drift remains."}',
      '```',
    ]);

    const output = JSON.parse(runGsdTools(['verify', 'verification-artifact', relPath], tmpDir).output);
    assert.strictEqual(output.valid, true, JSON.stringify(output));
    assert.strictEqual(output.anti_pattern_summary.historical_only, true);
  });
});

// GSD-AUTHORITY: 72-02-1:aec49e2e6df565678192a8cee4712026fc4ff7a76828371a4da426a2f55cebf6
