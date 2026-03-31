const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const commandGovernance = require('../get-stuff-done/bin/lib/command-governance.cjs');
const { createTempProject, cleanup } = require('./helpers.cjs');

describe('command governance policy', () => {
  test('buildRouteFromArgs captures command, subcommand, and workflow mode', () => {
    const route = commandGovernance.buildRouteFromArgs(['context', 'build', '--workflow', 'plan-phase']);
    assert.deepStrictEqual(route, {
      command: 'context',
      subcommand: 'build',
      mode: 'plan-phase',
    });
  });

  test('policy resolves hard-gated planning workflows and recovery paths', () => {
    const tmpDir = createTempProject();
    try {
      const policyDir = path.join(tmpDir, '.planning', 'policy');
      fs.mkdirSync(policyDir, { recursive: true });
      fs.copyFileSync(
        path.join(__dirname, '..', '.planning', 'policy', 'command-governance.yaml'),
        path.join(policyDir, 'command-governance.yaml'),
      );

      const planRoute = commandGovernance.resolveCommandGovernance(tmpDir, {
        command: 'context',
        subcommand: 'build',
        mode: 'plan-phase',
      });
      assert.strictEqual(planRoute.classification, 'hard_gated_state_transition');
      assert.strictEqual(planRoute.workflow, 'context:plan-phase');

      const recoveryRoute = commandGovernance.resolveCommandGovernance(tmpDir, {
        command: 'drift',
        subcommand: 'status',
      });
      assert.strictEqual(recoveryRoute.classification, 'recovery_only');

      const reconcileRoute = commandGovernance.resolveCommandGovernance(tmpDir, {
        command: 'drift',
        subcommand: 'reconcile',
      });
      assert.strictEqual(reconcileRoute.classification, 'recovery_only');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('unknown routes default to warn_only', () => {
    const tmpDir = createTempProject();
    try {
      const policyDir = path.join(tmpDir, '.planning', 'policy');
      fs.mkdirSync(policyDir, { recursive: true });
      fs.copyFileSync(
        path.join(__dirname, '..', '.planning', 'policy', 'command-governance.yaml'),
        path.join(policyDir, 'command-governance.yaml'),
      );

      const unknownRoute = commandGovernance.resolveCommandGovernance(tmpDir, {
        command: 'totally-new',
        subcommand: 'route',
      });
      assert.strictEqual(unknownRoute.classification, 'warn_only');
      assert.strictEqual(unknownRoute.workflow, null);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('explicit scratch context remains ungated_execution', () => {
    const tmpDir = createTempProject();
    try {
      const policyDir = path.join(tmpDir, '.planning', 'policy');
      fs.mkdirSync(policyDir, { recursive: true });
      fs.copyFileSync(
        path.join(__dirname, '..', '.planning', 'policy', 'command-governance.yaml'),
        path.join(policyDir, 'command-governance.yaml'),
      );

      const route = commandGovernance.resolveCommandGovernance(tmpDir, {
        command: 'context',
        subcommand: 'build',
        mode: 'scratch',
      });
      assert.strictEqual(route.classification, 'ungated_execution');
    } finally {
      cleanup(tmpDir);
    }
  });
});
