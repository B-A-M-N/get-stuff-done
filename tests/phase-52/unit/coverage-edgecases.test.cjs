const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const authority = require('../../../get-stuff-done/bin/lib/authority.cjs');
const { ProofHarness } = require('../../../packages/gsd-tools/src/validation/ProofHarness');
const { createTempProject, cleanup, runGsdTools } = require('../../helpers.cjs');

function ensurePlanningDir(tmpDir) {
  fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
}

function writeConfig(tmpDir, value) {
  ensurePlanningDir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify(value, null, 2), 'utf8');
}

function writeProject(tmpDir) {
  ensurePlanningDir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n\nTest project.\n', 'utf8');
}

function writeRoadmap(tmpDir, content) {
  ensurePlanningDir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), content, 'utf8');
}

function writeSignedState(tmpDir, content, sig = ['52', '01', '1']) {
  ensurePlanningDir(tmpDir);
  const filePath = path.join(tmpDir, '.planning', 'STATE.md');
  fs.writeFileSync(filePath, content, 'utf8');
  authority.signFile(filePath, ...sig);
}

function writeSignedPlan(tmpDir, phaseDirName, fileName, content, sig = ['52', '01', '1']) {
  const phaseDir = path.join(tmpDir, '.planning', 'phases', phaseDirName);
  fs.mkdirSync(phaseDir, { recursive: true });
  const filePath = path.join(phaseDir, fileName);
  fs.writeFileSync(filePath, content, 'utf8');
  authority.signFile(filePath, ...sig);
}

describe('init and progress branches', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = createTempProject();
  });
  afterEach(() => cleanup(tmpDir));

  test('init execute-phase returns requirement ids and incomplete plans', () => {
    writeConfig(tmpDir, { commit_docs: true, verifier: true });
    writeProject(tmpDir);
    writeRoadmap(tmpDir, [
      '## Phase 52: Truth Enforcement Hardening',
      '',
      '**Requirements**: [QUALITY-01, QUALITY-04]',
    ].join('\n'));
    writeSignedState(tmpDir, '# State\n\n**Clarification Status:** clear\n');

    const phaseDir = path.join(tmpDir, '.planning', 'phases', '52-truth-enforcement-hardening');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '52-01-PLAN.md'), 'plan 1\n');
    fs.writeFileSync(path.join(phaseDir, '52-01-SUMMARY.md'), 'summary 1\n');
    fs.writeFileSync(path.join(phaseDir, '52-02-PLAN.md'), 'plan 2\n');

    const res = runGsdTools(['init', 'execute-phase', '52'], tmpDir);
    assert.ok(res.success, res.error);
    const out = JSON.parse(res.output);
    assert.strictEqual(out.phase_found, true);
    assert.strictEqual(out.phase_req_ids, 'QUALITY-01, QUALITY-04');
    assert.deepStrictEqual(out.incomplete_plans, ['52-02-PLAN.md']);
  });

  test('progress and degraded health reflect mixed workspace state', () => {
    writeRoadmap(tmpDir, [
      '## Phase 51: Previous Work',
      '## Phase 52: Truth Enforcement Hardening',
    ].join('\n'));

    const phase51 = path.join(tmpDir, '.planning', 'phases', '51-prev');
    const phase52 = path.join(tmpDir, '.planning', 'phases', '52-truth-enforcement-hardening');
    fs.mkdirSync(phase51, { recursive: true });
    fs.mkdirSync(phase52, { recursive: true });
    fs.writeFileSync(path.join(phase51, '51-01-PLAN.md'), 'p\n');
    fs.writeFileSync(path.join(phase51, '51-01-SUMMARY.md'), 's\n');
    fs.writeFileSync(path.join(phase52, '52-01-PLAN.md'), 'p\n');

    const progress = runGsdTools(['progress', 'bar'], tmpDir);
    assert.ok(progress.success, progress.error);
    assert.ok(progress.output.includes('1/2 plans'));

    fs.mkdirSync(path.join(tmpDir, '.planning', 'gates'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), '{broken}', 'utf8');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'gates', 'gates_confirm_roadmap-pending.json'), '{}', 'utf8');

    const health = runGsdTools(['health', 'degraded-mode'], tmpDir);
    assert.ok(health.success, health.error);
    const healthOut = JSON.parse(health.output);
    assert.strictEqual(healthOut.degraded, true);
    assert.ok(healthOut.gate_pending_keys.includes('gates.confirm.roadmap'));
  });
});

describe('verify edge branches', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = createTempProject();
  });
  afterEach(() => cleanup(tmpDir));

  test('workflow-readiness plan-phase warns on missing UI spec, validation, and adversarial harness', () => {
    writeConfig(tmpDir, {
      ui_safety_gate: true,
      nyquist_validation: true,
      research: true,
      adversarial_test_harness: false,
    });
    writeProject(tmpDir);
    writeRoadmap(tmpDir, '## Phase 52: frontend dashboard interface\n');
    writeSignedState(tmpDir, '# State\n\n**Clarification Status:** clear\n');

    const phaseDir = path.join(tmpDir, '.planning', 'phases', '52-ui-hardening');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '52-CONTEXT.md'), '# Context\n');
    fs.writeFileSync(path.join(phaseDir, '52-RESEARCH.md'), '## Validation Architecture\n');

    const res = runGsdTools(['verify', 'workflow-readiness', 'plan-phase', '--phase', '52'], tmpDir);
    assert.ok(res.success, res.error);
    const out = JSON.parse(res.output);
    assert.strictEqual(out.status, 'degraded');
    assert.ok(out.gates.some((gate) => gate.code === 'R003'));
    assert.ok(out.gates.some((gate) => gate.code === 'R005'));
    assert.ok(out.gates.some((gate) => gate.code === 'R006'));
  });

  test('verify plan-structure accepts a signed edge-case plan', () => {
    writeSignedPlan(tmpDir, '52-test', '52-01-PLAN.md', `---
phase: 52
plan: 1
title: Edge Coverage
slug: edge-coverage
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - edge case
---

<task type="auto">
<name>Edge Coverage Task</name>
<action>Exercise edge cases</action>
<verify><automated>true</automated></verify>
<done>Done</done>
</task>
`);

    const res = runGsdTools(['verify', 'plan-structure', '.planning/phases/52-test/52-01-PLAN.md'], tmpDir);
    assert.ok(res.success, res.error);
  });
});

describe('property-based proof invariants', () => {
  test('ProofHarness generated proofs remain valid for zero-error cases', async () => {
    await fc.assert(fc.property(
      fc.record({
        total_cases: fc.integer({ min: 1, max: 50 }),
        passed_valid: fc.integer({ min: 0, max: 50 }),
        rejected_invalid: fc.integer({ min: 0, max: 50 }),
      }),
      (results) => {
        const total = Math.max(results.total_cases, results.passed_valid, results.rejected_invalid);
        const proof = ProofHarness.generateProof('json_validator', {
          total_cases: total,
          passed_valid: Math.min(results.passed_valid, total),
          rejected_invalid: Math.min(results.rejected_invalid, total),
          false_negatives: 0,
          false_positives: 0,
        });
        const verification = ProofHarness.verifyProof(proof);
        assert.strictEqual(verification.valid, true);
      }
    ), { numRuns: 8 });
  });
});
