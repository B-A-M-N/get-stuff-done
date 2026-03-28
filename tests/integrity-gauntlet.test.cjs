'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  runDeterministicGauntlet,
  ensureDeterministicRuntime,
} = require('../get-stuff-done/bin/lib/integrity-gauntlet.cjs');
const { getScenarioCatalog } = require('../get-stuff-done/bin/lib/integrity-gauntlet-scenarios.cjs');
const { createTempGitProject, cleanup, runGsdTools } = require('./helpers.cjs');

describe('integrity gauntlet catalog', () => {
  test('catalog covers required hostile surfaces with at least 15 scenarios and 3 mixed failures', () => {
    const scenarios = getScenarioCatalog();
    assert.ok(Array.isArray(scenarios), 'catalog should be an array');
    assert.ok(scenarios.length >= 15, 'catalog should include at least 15 scenarios');

    const mixed = scenarios.filter((scenario) => scenario.failure_chain === 'mixed');
    assert.ok(mixed.length >= 3, 'catalog should include at least 3 mixed-failure scenarios');

    const ids = new Set(scenarios.map((scenario) => scenario.id));
    [
      'fake-verification-forged-verdict',
      'missing-commit-proof-chain',
      'declared-memory-degradation',
      'undeclared-memory-degradation',
      'firecrawl-context-governance-bypass',
      'memory-truth-contradiction',
      'retrieval-truth-posture-downgrade',
    ].forEach((id) => assert.ok(ids.has(id), `missing required scenario ${id}`));

    const outcomes = new Set(scenarios.map((scenario) => scenario.expected_outcome));
    ['INVALID', 'CONDITIONAL', 'RECONCILIATION_REQUIRED', 'BLOCK']
      .forEach((outcome) => assert.ok(outcomes.has(outcome), `catalog missing ${outcome}`));
  });
});

describe('integrity gauntlet runtime', () => {
  test('deterministic runtime fails fast without node:sqlite support', () => {
    assert.throws(
      () => ensureDeterministicRuntime({ hasNodeSqlite: false }),
      /node:sqlite/i
    );
  });
});

describe('integrity gauntlet deterministic execution', () => {
  test('fake verification and missing proof scenarios resolve to INVALID', async () => {
    const projectDir = createTempGitProject();
    try {
      const result = await runDeterministicGauntlet({
        cwd: projectDir,
        scenarioIds: ['fake-verification-forged-verdict', 'missing-commit-proof-chain'],
      });

      assert.strictEqual(result.ok, true);
      const byId = new Map(result.results.map((entry) => [entry.id, entry]));
      assert.strictEqual(byId.get('fake-verification-forged-verdict').actual_outcome, 'INVALID');
      assert.strictEqual(byId.get('missing-commit-proof-chain').actual_outcome, 'INVALID');
    } finally {
      cleanup(projectDir);
    }
  });

  test('declared degradation is CONDITIONAL while undeclared degradation is INVALID', async () => {
    const projectDir = createTempGitProject();
    try {
      const result = await runDeterministicGauntlet({
        cwd: projectDir,
        scenarioIds: ['declared-memory-degradation', 'undeclared-memory-degradation'],
      });

      const byId = new Map(result.results.map((entry) => [entry.id, entry]));
      assert.strictEqual(byId.get('declared-memory-degradation').actual_outcome, 'CONDITIONAL');
      assert.strictEqual(byId.get('undeclared-memory-degradation').actual_outcome, 'INVALID');
    } finally {
      cleanup(projectDir);
    }
  });

  test('context build and firecrawl posture scenario cannot silently bypass governance', async () => {
    const projectDir = createTempGitProject();
    try {
      const result = await runDeterministicGauntlet({
        cwd: projectDir,
        scenarioIds: ['firecrawl-context-governance-bypass'],
      });

      const scenario = result.results[0];
      assert.strictEqual(scenario.actual_outcome, 'INVALID');
      assert.ok(
        Array.isArray(scenario.surfaces) && scenario.surfaces.includes('context-build'),
        'scenario should target context-build surface'
      );
      assert.ok(
        Array.isArray(scenario.surfaces) && scenario.surfaces.includes('firecrawl'),
        'scenario should target firecrawl surface'
      );
    } finally {
      cleanup(projectDir);
    }
  });
});

describe('integrity gauntlet CLI wiring', () => {
  test('sanctioned CLI surface exposes gauntlet execution', () => {
    const projectDir = createTempGitProject();
    try {
      const result = runGsdTools(
        ['integrity-gauntlet', 'run', '--scenario', 'fake-verification-forged-verdict', '--raw'],
        projectDir
      );
      assert.strictEqual(result.success, true, `CLI should succeed: ${result.error}`);
      const payload = JSON.parse(result.output);
      assert.ok(Array.isArray(payload.results), 'CLI should return normalized results');
      assert.strictEqual(payload.results[0].actual_outcome, 'INVALID');
    } finally {
      cleanup(projectDir);
    }
  });
});

// GSD-AUTHORITY: 79-01-1:a5d000fb8b65517e5e7321c22493af9770cbfb57fe5aa227e091df71af1e4445
