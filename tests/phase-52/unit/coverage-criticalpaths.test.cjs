const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const { execSync } = require('child_process');
const { SafeLogger } = require('../../../packages/gsd-tools/src/logging/SafeLogger');
const authority = require('../../../get-stuff-done/bin/lib/authority.cjs');
const { createTempProject, createTempGitProject, cleanup, runGsdTools } = require('../../helpers.cjs');

function ensurePlanningDir(tmpDir) {
  fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
}

function writeConfig(tmpDir, value) {
  ensurePlanningDir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify(value, null, 2), 'utf8');
}

function writeProject(tmpDir, content = '# Project\n\nTest project.\n') {
  ensurePlanningDir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), content, 'utf8');
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

describe('coverage baseline commands', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = createTempProject();
  });
  afterEach(() => cleanup(tmpDir));

  test('state load reports config and state availability', () => {
    writeConfig(tmpDir, { commit_docs: true, branching_strategy: 'none' });
    writeRoadmap(tmpDir, '# Roadmap\n');

    const res = runGsdTools(['state', 'load'], tmpDir);
    assert.ok(res.success, res.error);
    const out = JSON.parse(res.output);
    assert.strictEqual(out.config_exists, true);
    assert.strictEqual(out.roadmap_exists, true);
    assert.strictEqual(out.state_exists, false);
  });

  test('state get reads signed values and sections', () => {
    writeSignedState(tmpDir, [
      '# State',
      '',
      '**Current Phase:** 52',
      'Status: Executing',
      '',
      '## Blockers',
      '- none',
    ].join('\n'));

    const field = runGsdTools(['state', 'get', 'Current Phase'], tmpDir);
    assert.ok(field.success, field.error);
    assert.strictEqual(JSON.parse(field.output)['Current Phase'], '52');

    const section = runGsdTools(['state', 'get', 'Blockers'], tmpDir);
    assert.ok(section.success, section.error);
    assert.ok(JSON.parse(section.output).Blockers.includes('none'));
  });

  test('verify plan-structure accepts a signed minimal valid plan', () => {
    writeSignedPlan(tmpDir, '52-test', '52-01-PLAN.md', `---
phase: 52
plan: 1
title: Coverage
slug: coverage
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - test
---

<task type="auto">
<name>Coverage Task</name>
<action>Do work</action>
<verify><automated>true</automated></verify>
<done>Done</done>
</task>
`);

    const res = runGsdTools(['verify', 'plan-structure', '.planning/phases/52-test/52-01-PLAN.md'], tmpDir);
    assert.ok(res.success, res.error);
  });
});

describe('command and verify coverage', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = createTempProject();
  });
  afterEach(() => cleanup(tmpDir));

  test('task-log read and reconstruct handle malformed lines deterministically', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '52-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '52-01-TASK-LOG.jsonl'), [
      JSON.stringify({ task: 1, hash: 'abc1234' }),
      '{bad json}',
      JSON.stringify({ task: 2, commit: 'def5678' }),
    ].join('\n'));

    const readRes = runGsdTools(['task-log', 'read', '--phase', '52', '--plan', '01'], tmpDir);
    assert.ok(readRes.success, readRes.error);
    const readOut = JSON.parse(readRes.output);
    assert.strictEqual(readOut.count, 2);
    assert.strictEqual(readOut.parse_errors.length, 1);

    const reconstructRes = runGsdTools(['task-log', 'reconstruct', '--phase', '52', '--plan', '01', '--raw'], tmpDir);
    assert.ok(reconstructRes.success, reconstructRes.error);
    assert.ok(reconstructRes.output.includes('Task 1: abc1234'));
    assert.ok(reconstructRes.output.includes('Task 2: def5678'));
  });

  test('summary-extract returns parsed decisions and filtered fields', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '52-test', '52-01-SUMMARY.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, `---
phase: 52
plan: 1
subsystem: coverage
one-liner: Critical coverage gate hardened
key-files:
  created:
    - tests/phase-52/unit/coverage-criticalpaths.test.cjs
key-decisions:
  - Scope critical modules narrowly: Keep the gate on orchestration paths only
requirements-completed:
  - QUALITY-01
---

# Summary
`, 'utf8');

    const allRes = runGsdTools(['summary-extract', '.planning/phases/52-test/52-01-SUMMARY.md'], tmpDir);
    assert.ok(allRes.success, allRes.error);
    const allOut = JSON.parse(allRes.output);
    assert.strictEqual(allOut.decisions[0].summary, 'Scope critical modules narrowly');

    const filteredRes = runGsdTools(['summary-extract', '.planning/phases/52-test/52-01-SUMMARY.md', '--fields', 'one_liner,requirements_completed'], tmpDir);
    assert.ok(filteredRes.success, filteredRes.error);
    const filteredOut = JSON.parse(filteredRes.output);
    assert.deepStrictEqual(filteredOut.requirements_completed, ['QUALITY-01']);
  });

  test('verify references, artifacts, and key-links report the right failures', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'existing.md'), '# ok\n');
    fs.writeFileSync(path.join(tmpDir, 'docs', 'target.md'), 'executor deterministic invariant\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'artifact.cjs'), 'function alpha() {}\nmodule.exports = { alpha };\n');
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), 'Read @docs/existing.md and @docs/missing.md plus `src/artifact.cjs`.\n');
    fs.writeFileSync(path.join(tmpDir, 'artifacts-plan.md'), `---
must_haves:
  artifacts:
    - path: src/artifact.cjs
      min_lines: 2
      contains: module.exports
      exports: alpha
    - path: src/missing.cjs
---
`);
    fs.writeFileSync(path.join(tmpDir, 'links-plan.md'), `---
must_haves:
  key_links:
    - from: docs/existing.md
      to: docs/target.md
      pattern: executor deterministic invariant
    - from: docs/existing.md
      to: docs/target.md
      pattern: "("
---
`);

    const references = runGsdTools(['verify', 'references', 'notes.md'], tmpDir);
    assert.ok(references.success, references.error);
    const referencesOut = JSON.parse(references.output);
    assert.strictEqual(referencesOut.valid, false);
    assert.ok(referencesOut.missing.some((item) => item.includes('docs/missing.md')));

    const artifacts = runGsdTools(['verify', 'artifacts', 'artifacts-plan.md'], tmpDir);
    assert.ok(artifacts.success, artifacts.error);
    const artifactsOut = JSON.parse(artifacts.output);
    assert.strictEqual(artifactsOut.all_passed, false);
    assert.strictEqual(artifactsOut.artifacts[0].passed, true);

    const links = runGsdTools(['verify', 'key-links', 'links-plan.md'], tmpDir);
    assert.ok(links.success, links.error);
    const linksOut = JSON.parse(links.output);
    assert.strictEqual(linksOut.all_verified, false);
    assert.strictEqual(linksOut.links[0].verified, true);
    assert.match(linksOut.links[1].detail, /Invalid regex pattern/);
  });
});

describe('git-backed verification branches', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = createTempGitProject();
  });
  afterEach(() => cleanup(tmpDir));

  test('verify task-commit and workflow-readiness use current repo state', () => {
    writeProject(tmpDir);
    writeRoadmap(tmpDir, '## Phase 52: Truth Enforcement Hardening\n');
    writeSignedState(tmpDir, '# State\n\n**Clarification Status:** clear\n');

    const phaseDir = path.join(tmpDir, '.planning', 'phases', '52-truth-enforcement-hardening');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '52-01-PLAN.md'), 'plan 1\n');
    fs.writeFileSync(path.join(phaseDir, '52-01-SUMMARY.md'), 'summary 1\n');
    fs.writeFileSync(path.join(phaseDir, '52-02-PLAN.md'), 'plan 2\n');

    fs.writeFileSync(path.join(tmpDir, 'tracked.txt'), 'content\n');
    execSync('git add tracked.txt', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "feat(52-01): add tracked file"', { cwd: tmpDir, stdio: 'pipe' });
    const headHash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf8' }).trim();

    const taskCommit = runGsdTools(['verify', 'task-commit', headHash, '--scope', '52-01'], tmpDir);
    assert.ok(taskCommit.success, taskCommit.error);
    assert.strictEqual(JSON.parse(taskCommit.output).valid, true);

    const readiness = runGsdTools(['verify', 'workflow-readiness', 'execute-phase', '--phase', '52'], tmpDir);
    assert.ok(readiness.success, readiness.error);
    const readinessOut = JSON.parse(readiness.output);
    assert.strictEqual(readinessOut.status, 'ready');
    assert.ok(readinessOut.gates.some((gate) => gate.code === 'R009'));
  });
});

describe('property-based invariants', () => {
  test('SafeLogger sanitize returns strings and redacts obvious secrets', async () => {
    await fc.assert(fc.property(fc.string(), (prefix) => {
      const input = `${prefix} token="sk-AbCdEfGh1234567890123456"`;
      const output = SafeLogger.sanitize(input);
      assert.strictEqual(typeof output, 'string');
      assert.ok(!output.includes('sk-AbCdEfGh1234567890123456'));
    }), { numRuns: 8 });
  });
});
