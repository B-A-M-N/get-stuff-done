const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SQL_PATH = path.join(ROOT, 'scripts', 'init-open-brain.sql');
const LIB_PATH = path.join(ROOT, 'get-stuff-done', 'bin', 'lib', 'open-brain.cjs');

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('open brain schema bootstrap contract', () => {
  test('defines graph-ready relational tables in gsd_open_brain', () => {
    const sql = readFile(SQL_PATH);

    assert.match(sql, /create schema if not exists gsd_open_brain/i);
    assert.match(sql, /create extension if not exists vector/i);
    assert.match(sql, /gsd_open_brain\.memory_item/i);
    assert.match(sql, /gsd_open_brain\.memory_link/i);
    assert.match(sql, /gsd_open_brain\.recall_event/i);
    assert.match(sql, /gsd_open_brain\.consolidation_job/i);
  });

  test('does not repurpose second brain workflow-memory tables', () => {
    const sql = readFile(SQL_PATH);

    assert.doesNotMatch(sql, /gsd_local_brain\.workflow_memory/i);
    assert.doesNotMatch(sql, /create table .*workflow_memory/i);
  });

  test('exposes explicit initialization and bootstrap entry points', () => {
    const openBrain = require(LIB_PATH);

    assert.strictEqual(typeof openBrain.OPEN_BRAIN_SCHEMA, 'string');
    assert.strictEqual(typeof openBrain.getBootstrapSql, 'function');
    assert.strictEqual(typeof openBrain.getSchemaContract, 'function');
    assert.strictEqual(typeof openBrain.checkAvailability, 'function');
  });
});
