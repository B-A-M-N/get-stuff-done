const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writeExecutePlan(phaseDir, baseName) {
  fs.writeFileSync(path.join(phaseDir, `${baseName}-PLAN.md`), '# Plan\n');
}

function writeExecuteSummary(phaseDir, baseName) {
  fs.writeFileSync(path.join(phaseDir, `${baseName}-SUMMARY.md`), '# Summary\n');
}

function writeBaseProject(tmpDir) {  fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n\n## What This Is\n\nX\n\n## Core Value\n\nY\n\n## Requirements\n\nZ\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '### Phase 1: UI Dashboard\n\n**Requirements**: REQ-1\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# Session State\n\n## Decisions\n\nNone yet.\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({
    model_profile: 'balanced',
    workflow: {
      research: true,
      plan_check: true,
      verifier: true,
      nyquist_validation: true,
      adversarial_test_harness: true,
      ui_phase: true,
      ui_safety_gate: true
    },
    commit_docs: true
  }, null, 2));
  const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-ui-dashboard');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(phaseDir, '01-CONTEXT.md'), '# Context\n');
  return phaseDir;
}

describe('verify workflow-readiness', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('blocks when clarification is blocked', () => {
    writeBaseProject(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# Session State\n\nClarification Status: blocked\n');
    const result = runGsdTools(['verify', 'workflow-readiness', 'plan-phase', '--phase', '1'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'blocked');
    assert.ok(output.gates.some(g => g.code === 'R002'));
  });

  test('returns degraded when UI-SPEC is missing for frontend phase', () => {
    writeBaseProject(tmpDir);
    const result = runGsdTools(['verify', 'workflow-readiness', 'plan-phase', '--phase', '1'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'degraded');
    const gate = output.gates.find(g => g.code === 'R003');
    assert.ok(gate);
    assert.ok(gate.resolutions.some(r => r.record_decision && r.record_decision.summary === 'UI-SPEC bypass accepted'));
  });

  test('returns degraded for no-research Nyquist path with continue option', () => {
    writeBaseProject(tmpDir);
    const cfgPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    config.workflow.research = false;
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
    const result = runGsdTools(['verify', 'workflow-readiness', 'plan-phase', '--phase', '1', '--skip-research'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    const gate = output.gates.find(g => g.code === 'R004');
    assert.ok(gate);
    assert.ok(gate.resolutions.some(r => r.record_decision && r.record_decision.summary === 'Nyquist bypass accepted'));
  });

  test('reports acknowledged bypasses as ready when already recorded', () => {
    const phaseDir = writeBaseProject(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# Session State\n\n## Decisions\n\n- [Phase 1]: UI-SPEC bypass accepted — reason=continue-without-ui-spec\n- [Phase 1]: Nyquist bypass accepted — reason=no-research-path\n- [Phase 1]: Adversarial harness bypassed — scope=plan-phase-readiness\n');
    const cfgPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    config.workflow.research = false;
    config.workflow.adversarial_test_harness = false;
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
    fs.writeFileSync(path.join(phaseDir, '01-RESEARCH.md'), '# Research\n\n## Validation Architecture\n');
    const result = runGsdTools(['verify', 'workflow-readiness', 'plan-phase', '--phase', '1', '--skip-research'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'ready');
    assert.ok(output.gates.every(g => g.state === 'acknowledged'));
  });

  test('blocks execute-phase when no plans exist', () => {
    writeBaseProject(tmpDir);
    const result = runGsdTools(['verify', 'workflow-readiness', 'execute-phase', '--phase', '1'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'blocked');
    assert.ok(output.gates.some(g => g.code === 'R007'));
  });

  test('returns degraded for execute-phase when STATE.md is missing', () => {
    const phaseDir = writeBaseProject(tmpDir);
    writeExecutePlan(phaseDir, '01-01');
    fs.unlinkSync(path.join(tmpDir, '.planning', 'STATE.md'));
    const result = runGsdTools(['verify', 'workflow-readiness', 'execute-phase', '--phase', '1'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'degraded');
    const gate = output.gates.find(g => g.code === 'R008');
    assert.ok(gate);
    assert.ok(gate.resolutions.some(r => r.command === '/gsd:health --repair'));
  });

  test('treats partial execute-phase progress as ready-to-resume', () => {
    const phaseDir = writeBaseProject(tmpDir);
    writeExecutePlan(phaseDir, '01-01');
    writeExecuteSummary(phaseDir, '01-01');
    writeExecutePlan(phaseDir, '01-02');
    const result = runGsdTools(['verify', 'workflow-readiness', 'execute-phase', '--phase', '1'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'ready');
    const gate = output.gates.find(g => g.code === 'R009');
    assert.ok(gate);
    assert.strictEqual(gate.state, 'acknowledged');
  });
});
