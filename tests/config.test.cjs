/**
 * GSD Tools Tests - config.cjs
 *
 * CLI integration tests for config-ensure-section, config-set, and config-get
 * commands exercised through gsd-tools.cjs via execSync.
 *
 * Requirements: TEST-13
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// ─── helpers ──────────────────────────────────────────────────────────────────

function readConfig(tmpDir) {
  const configPath = path.join(tmpDir, '.planning', 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function writeConfig(tmpDir, obj) {
  const configPath = path.join(tmpDir, '.planning', 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(obj, null, 2), 'utf-8');
}

function createFakeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-home-'));
}

// ─── config-ensure-section ───────────────────────────────────────────────────

describe('config-ensure-section command', () => {
  let tmpDir;
  let fakeHome;
  let toolEnv;

  const runConfigTools = (args) => runGsdTools(args, tmpDir, { env: toolEnv });

  beforeEach(() => {
    tmpDir = createTempProject();
    fakeHome = createFakeHome();
    toolEnv = { HOME: fakeHome, GSD_HOME: fakeHome };
  });

  afterEach(() => {
    cleanup(tmpDir);
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  test('creates config.json with expected structure and types', () => {
    const result = runConfigTools('config-ensure-section');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const config = readConfig(tmpDir);
    assert.strictEqual(typeof config.model_profile, 'string');
    assert.strictEqual(typeof config.commit_docs, 'boolean');
    assert.strictEqual(typeof config.parallelization, 'boolean');
    assert.strictEqual(typeof config.branching_strategy, 'string');
    assert.ok(config.workflow && typeof config.workflow === 'object', 'workflow should be an object');
    assert.strictEqual(typeof config.workflow.research, 'boolean');
    assert.strictEqual(typeof config.workflow.plan_check, 'boolean');
    assert.strictEqual(typeof config.workflow.verifier, 'boolean');
    assert.strictEqual(typeof config.workflow.nyquist_validation, 'boolean');
    assert.strictEqual(typeof config.workflow.adversarial_test_harness, 'boolean');
    assert.strictEqual(typeof config.workflow.auto_advance, 'boolean');
    assert.strictEqual(typeof config.workflow.node_repair, 'boolean');
    assert.strictEqual(typeof config.workflow.node_repair_budget, 'number');
    assert.ok(config.gates && typeof config.gates === 'object', 'gates should be an object');
    assert.strictEqual(typeof config.gates.confirm_plan, 'boolean');
    assert.strictEqual(typeof config.gates.execute_next_plan, 'boolean');
    assert.ok(config.safety && typeof config.safety === 'object', 'safety should be an object');
    assert.strictEqual(typeof config.safety.always_confirm_destructive, 'boolean');
    assert.strictEqual(typeof config.safety.always_confirm_external_services, 'boolean');
    assert.ok('model_profile' in config, 'model_profile should exist');
    assert.ok('brave_search' in config, 'brave_search should exist');
    assert.ok('search_gitignored' in config, 'search_gitignored should exist');
  });

  test('is idempotent — returns already_exists on second call', () => {
    const first = runConfigTools('config-ensure-section');
    assert.ok(first.success, `First call failed: ${first.error}`);
    const firstOutput = JSON.parse(first.output);
    assert.strictEqual(firstOutput.created, true);

    const second = runConfigTools('config-ensure-section');
    assert.ok(second.success, `Second call failed: ${second.error}`);
    const secondOutput = JSON.parse(second.output);
    assert.strictEqual(secondOutput.created, false);
    assert.strictEqual(secondOutput.reason, 'already_exists');
  });

  test('detects Brave Search from file-based key', () => {
    const gsdDir = path.join(fakeHome, '.gsd');
    const braveKeyFile = path.join(gsdDir, 'brave_api_key');

    fs.mkdirSync(gsdDir, { recursive: true });
    fs.writeFileSync(braveKeyFile, 'test-key', 'utf-8');

    const result = runConfigTools('config-ensure-section');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.brave_search, true);
  });

  test('merges user defaults from defaults.json', () => {
    const gsdDir = path.join(fakeHome, '.gsd');
    const defaultsFile = path.join(gsdDir, 'defaults.json');

    fs.mkdirSync(gsdDir, { recursive: true });
    fs.writeFileSync(defaultsFile, JSON.stringify({
      model_profile: 'quality',
      commit_docs: false,
    }), 'utf-8');

    const result = runConfigTools('config-ensure-section');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'quality', 'model_profile should be overridden');
    assert.strictEqual(config.commit_docs, false, 'commit_docs should be overridden');
    assert.strictEqual(typeof config.branching_strategy, 'string', 'branching_strategy should be a string');
  });

  test('merges nested workflow keys from defaults.json preserving unset keys', () => {
    const gsdDir = path.join(fakeHome, '.gsd');
    const defaultsFile = path.join(gsdDir, 'defaults.json');

    fs.mkdirSync(gsdDir, { recursive: true });
    fs.writeFileSync(defaultsFile, JSON.stringify({
      workflow: { research: false },
    }), 'utf-8');

    const result = runConfigTools('config-ensure-section');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.workflow.research, false, 'research should be overridden');
    assert.strictEqual(typeof config.workflow.plan_check, 'boolean', 'plan_check should be a boolean');
    assert.strictEqual(typeof config.workflow.verifier, 'boolean', 'verifier should be a boolean');
  });
});

// ─── config-set ──────────────────────────────────────────────────────────────

describe('config-set command', () => {
  let tmpDir;
  let fakeHome;
  let toolEnv;

  const runConfigTools = (args) => runGsdTools(args, tmpDir, { env: toolEnv });

  beforeEach(() => {
    tmpDir = createTempProject();
    fakeHome = createFakeHome();
    toolEnv = { HOME: fakeHome, GSD_HOME: fakeHome };
    runConfigTools('config-ensure-section');
  });

  afterEach(() => {
    cleanup(tmpDir);
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  test('sets a top-level string value', () => {
    const result = runConfigTools('config-set model_profile quality');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true);
    assert.strictEqual(output.key, 'model_profile');
    assert.strictEqual(output.value, 'quality');

    const config = readConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'quality');
  });

  test('coerces true to boolean', () => {
    const result = runConfigTools('config-set commit_docs true');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.commit_docs, true);
    assert.strictEqual(typeof config.commit_docs, 'boolean');
  });

  test('coerces false to boolean', () => {
    const result = runConfigTools('config-set commit_docs false');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.commit_docs, false);
    assert.strictEqual(typeof config.commit_docs, 'boolean');
  });

  test('coerces numeric strings to numbers', () => {
    const result = runConfigTools('config-set granularity 42');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.granularity, 42);
    assert.strictEqual(typeof config.granularity, 'number');
  });

  test('preserves plain strings', () => {
    const result = runConfigTools('config-set model_profile hello');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.model_profile, 'hello');
    assert.strictEqual(typeof config.model_profile, 'string');
  });

  test('sets nested values via dot-notation', () => {
    const result = runConfigTools('config-set workflow.research false');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.workflow.research, false);
  });

  test('sets documented workflow, gate, and safety keys', () => {
    assert.ok(runConfigTools('config-set workflow.auto_advance true').success);
    assert.ok(runConfigTools('config-set workflow.node_repair false').success);
    assert.ok(runConfigTools('config-set workflow.node_repair_budget 5').success);
    assert.ok(runConfigTools('config-set gates.confirm_plan false').success);
    assert.ok(runConfigTools('config-set safety.always_confirm_destructive false').success);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.workflow.auto_advance, true);
    assert.strictEqual(config.workflow.node_repair, false);
    assert.strictEqual(config.workflow.node_repair_budget, 5);
    assert.strictEqual(config.gates.confirm_plan, false);
    assert.strictEqual(config.safety.always_confirm_destructive, false);
  });

  test('auto-creates nested objects for dot-notation', () => {
    writeConfig(tmpDir, {});

    const result = runConfigTools('config-set workflow.research false');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.workflow.research, false);
    assert.strictEqual(typeof config.workflow, 'object');
  });

  test('rejects unknown config keys', () => {
    const result = runConfigTools('config-set workflow.nyquist_validation_enabled false');
    assert.strictEqual(result.success, false);
    assert.ok(
      result.error.includes('Unknown config key'),
      `Expected "Unknown config key" in error: ${result.error}`
    );
  });

  test('errors when no key path provided', () => {
    const result = runConfigTools('config-set');
    assert.strictEqual(result.success, false);
  });

  test('rejects known invalid nyquist alias keys with a suggestion', () => {
    const result = runConfigTools('config-set workflow.nyquist_validation_enabled false');
    assert.strictEqual(result.success, false);
    assert.match(result.error, /Unknown config key: workflow\.nyquist_validation_enabled/);
    assert.match(result.error, /workflow\.nyquist_validation/);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.workflow.nyquist_validation_enabled, undefined);
    assert.strictEqual(config.workflow.nyquist_validation, true);
  });
});

// ─── config-get ──────────────────────────────────────────────────────────────

describe('config-get command', () => {
  let tmpDir;
  let fakeHome;
  let toolEnv;

  const runConfigTools = (args, cwd = tmpDir) => runGsdTools(args, cwd, { env: toolEnv });

  beforeEach(() => {
    tmpDir = createTempProject();
    fakeHome = createFakeHome();
    toolEnv = { HOME: fakeHome, GSD_HOME: fakeHome };
    runConfigTools('config-ensure-section');
  });

  afterEach(() => {
    cleanup(tmpDir);
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  test('gets a top-level value', () => {
    const result = runConfigTools('config-get model_profile');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output, 'balanced');
  });

  test('gets a nested value via dot-notation', () => {
    const result = runConfigTools('config-get workflow.research');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output, true);
  });

  test('returns documented defaults for absent workflow, gate, and safety keys', () => {
    writeConfig(tmpDir, { workflow: {} });

    assert.strictEqual(JSON.parse(runConfigTools('config-get workflow.auto_advance').output), false);
    assert.strictEqual(JSON.parse(runConfigTools('config-get workflow.node_repair').output), true);
    assert.strictEqual(JSON.parse(runConfigTools('config-get workflow.node_repair_budget').output), 2);
    assert.strictEqual(JSON.parse(runConfigTools('config-get gates.confirm_plan').output), true);
    assert.strictEqual(JSON.parse(runConfigTools('config-get safety.always_confirm_external_services').output), true);
  });

  test('errors for nonexistent key', () => {
    const result = runConfigTools('config-get nonexistent_key');
    assert.strictEqual(result.success, false);
    assert.ok(
      result.error.includes('Key not found'),
      `Expected "Key not found" in error: ${result.error}`
    );
  });

  test('errors for deeply nested nonexistent key', () => {
    const result = runConfigTools('config-get workflow.nonexistent');
    assert.strictEqual(result.success, false);
    assert.ok(
      result.error.includes('Key not found'),
      `Expected "Key not found" in error: ${result.error}`
    );
  });

  test('errors when config.json does not exist', () => {
    const emptyTmpDir = createTempProject();
    try {
      const result = runConfigTools('config-get model_profile', emptyTmpDir);
      assert.strictEqual(result.success, false);
      assert.ok(
        result.error.includes('No config.json'),
        `Expected "No config.json" in error: ${result.error}`
      );
    } finally {
      cleanup(emptyTmpDir);
    }
  });

  test('errors when no key path provided', () => {
    const result = runConfigTools('config-get');
    assert.strictEqual(result.success, false);
  });
});

describe('adversarial_test_harness config', () => {
  let tmpDir;
  let fakeHome;
  let toolEnv;

  const runConfigTools = (args) => runGsdTools(args, tmpDir, { env: toolEnv });

  beforeEach(() => {
    tmpDir = createTempProject();
    fakeHome = createFakeHome();
    toolEnv = { HOME: fakeHome, GSD_HOME: fakeHome };
    runConfigTools('config-ensure-section');
  });

  afterEach(() => {
    cleanup(tmpDir);
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  test('config-set stores workflow.adversarial_test_harness', () => {
    const result = runConfigTools('config-set workflow.adversarial_test_harness false');
    assert.ok(result.success, `Command failed: ${result.error}`);

    const config = readConfig(tmpDir);
    assert.strictEqual(config.workflow.adversarial_test_harness, false);
  });

  test('config-get reads workflow.adversarial_test_harness', () => {
    runConfigTools('config-set workflow.adversarial_test_harness false');
    const result = runConfigTools('config-get workflow.adversarial_test_harness');
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.strictEqual(JSON.parse(result.output), false);
  });
});
