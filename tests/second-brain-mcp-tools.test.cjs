const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');

const TOOLBOX_CONFIG_PATH = path.join(
  __dirname,
  '..',
  '.planning',
  'phases',
  '54-model-facing-second-brain-via-mcp',
  'toolbox',
  'tools.yaml'
);

describe('Phase 54 MCP toolbox contract', () => {
  beforeEach(async () => {
    await secondBrain.resetForTests();
  });

  afterEach(async () => {
    await secondBrain.resetForTests();
  });

  after(async () => {
    await secondBrain.close();
  });

  test('second-brain exposes curated workflow memory helpers and hides raw audit rows', async () => {
    assert.strictEqual(typeof secondBrain.upsertWorkflowMemory, 'function');
    assert.strictEqual(typeof secondBrain.listWorkflowMemory, 'function');
    assert.strictEqual(typeof secondBrain.requirePostgres, 'function');

    secondBrain.fallbackToSqlite();
    const entry = await secondBrain.upsertWorkflowMemory({
      project_id: secondBrain.projectId,
      phase: '54',
      plan: '01',
      memory_kind: 'decision',
      title: 'Toolbox contract',
      body_markdown: 'Planner memory must stay read-only.',
      source_ref: '54-01-PLAN.md',
      created_by: 'test',
      importance: 4,
    });

    const rows = await secondBrain.listWorkflowMemory({
      project_id: secondBrain.projectId,
      phase: '54',
      plan: '01',
      memory_kind: 'decision',
    });

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, entry.id);
    assert.strictEqual(rows[0].phase, '54');
    assert.strictEqual(rows[0].plan, '01');
    assert.strictEqual(rows[0].memory_kind, 'decision');
    assert.strictEqual(rows[0].title, 'Toolbox contract');
    assert.strictEqual(rows[0].body_markdown, 'Planner memory must stay read-only.');
    assert.strictEqual(rows[0].source_ref, '54-01-PLAN.md');
    assert.strictEqual(rows[0].created_by, 'test');
    assert.strictEqual(rows[0].importance, 4);
    assert.ok(!Object.prototype.hasOwnProperty.call(rows[0], 'schema_json'));
    assert.ok(!Object.prototype.hasOwnProperty.call(rows[0], 'latency_ms'));
  });

  test('checked-in toolbox config declares Postgres source and separate planner/executor toolsets', () => {
    assert.ok(fs.existsSync(TOOLBOX_CONFIG_PATH), `Missing toolbox config: ${TOOLBOX_CONFIG_PATH}`);
    const yaml = fs.readFileSync(TOOLBOX_CONFIG_PATH, 'utf8');

    assert.match(yaml, /planner_memory_readonly/);
    assert.match(yaml, /executor_memory_rw/);
    assert.match(yaml, /memory_search/);
    assert.match(yaml, /memory_write_checkpoint/);
    assert.match(yaml, /postgres/i);
  });

  test('planner toolset stays read-only while executor toolset gets bounded writeback', () => {
    const yaml = fs.readFileSync(TOOLBOX_CONFIG_PATH, 'utf8');

    const plannerSection = yaml.match(/planner_memory_readonly:[\s\S]*?(?=\n\S|\n[A-Za-z0-9_-]+:|$)/);
    const executorSection = yaml.match(/executor_memory_rw:[\s\S]*?(?=\n\S|\n[A-Za-z0-9_-]+:|$)/);

    assert.ok(plannerSection, 'planner_memory_readonly toolset missing');
    assert.ok(executorSection, 'executor_memory_rw toolset missing');
    assert.match(plannerSection[0], /memory_search/);
    assert.doesNotMatch(plannerSection[0], /memory_write_checkpoint/);
    assert.doesNotMatch(plannerSection[0], /execute_sql/);
    assert.match(executorSection[0], /memory_search/);
    assert.match(executorSection[0], /memory_write_checkpoint/);
  });
});
