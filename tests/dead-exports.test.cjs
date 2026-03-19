/**
 * GSD Tools Tests - Export-Level Dead Store Check
 *
 * Verifies that `verify dead-exports` detects symbols defined in producer
 * files that are never consumed by the declared consumer file (key_link.to).
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writePlan(phaseDir, name, keyLinks) {
  // parseMustHavesBlock requires exactly 4 spaces before block name
  const linksYaml = keyLinks.length === 0
    ? '    key_links: []'
    : `    key_links:\n${keyLinks.map(l => [
        `      - from: ${l.from}`,
        `        to: ${l.to}`,
        l.via ? `        via: ${l.via}` : null,
      ].filter(Boolean).join('\n')).join('\n')}`;

  fs.writeFileSync(path.join(phaseDir, name), [
    '---',
    'phase: 01-test',
    'plan: 01',
    'type: execute',
    'wave: 1',
    'depends_on: []',
    'files_modified: []',
    'autonomous: true',
    'must_haves:',
    '    truths: []',
    '    artifacts: []',
    linksYaml,
    '---',
    '# Plan',
  ].join('\n'));
}

function writeFile(tmpDir, filePath, content) {
  const fullPath = path.join(tmpDir, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe('Export-Level Dead Store Check', () => {
  let tmpDir;
  let phaseDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('passes when no key_links with via field', () => {
    writePlan(phaseDir, '01-01-PLAN.md', []);

    const result = runGsdTools(['verify', 'dead-exports', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.links_checked, 0);
    assert.strictEqual(output.dead_stores.length, 0);
  });

  test('passes when symbol is both defined in from and used in to', () => {
    writeFile(tmpDir, 'src/lib/auth.js', 'export function signIn(user) { return user; }');
    writeFile(tmpDir, 'src/pages/login.js', "import { signIn } from '../lib/auth'; signIn(user);");

    writePlan(phaseDir, '01-01-PLAN.md', [
      { from: 'src/lib/auth.js', to: 'src/pages/login.js', via: 'signIn' },
    ]);

    const result = runGsdTools(['verify', 'dead-exports', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.verified, 1);
    assert.strictEqual(output.dead_stores.length, 0);
  });

  test('detects dead store when symbol defined in from but absent from to', () => {
    writeFile(tmpDir, 'src/lib/db.js', 'export function query(sql) { return []; }');
    writeFile(tmpDir, 'src/api/users.js', "// users API\nexport function listUsers() { return []; }");

    writePlan(phaseDir, '01-01-PLAN.md', [
      { from: 'src/lib/db.js', to: 'src/api/users.js', via: 'query' },
    ]);

    const result = runGsdTools(['verify', 'dead-exports', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    assert.strictEqual(output.dead_stores.length, 1);
    const ds = output.dead_stores[0];
    assert.strictEqual(ds.via, 'query');
    assert.strictEqual(ds.from, 'src/lib/db.js');
    assert.strictEqual(ds.to, 'src/api/users.js');
    assert.ok(ds.description.includes('query'));
    assert.ok(ds.fix_hint.length > 0);
  });

  test('skips link when from file does not exist', () => {
    writeFile(tmpDir, 'src/pages/login.js', 'import { signIn } from "../lib/auth";');

    writePlan(phaseDir, '01-01-PLAN.md', [
      { from: 'src/lib/missing.js', to: 'src/pages/login.js', via: 'signIn' },
    ]);

    const result = runGsdTools(['verify', 'dead-exports', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    // Missing file → skipped, not a dead store
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.dead_stores.length, 0);
    assert.ok(output.skipped.length > 0);
    assert.ok(output.skipped[0].reason.includes('from file not found'));
  });

  test('skips link when to file does not exist', () => {
    writeFile(tmpDir, 'src/lib/auth.js', 'export function signIn() {}');

    writePlan(phaseDir, '01-01-PLAN.md', [
      { from: 'src/lib/auth.js', to: 'src/pages/missing.js', via: 'signIn' },
    ]);

    const result = runGsdTools(['verify', 'dead-exports', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.dead_stores.length, 0);
    assert.ok(output.skipped.length > 0);
    assert.ok(output.skipped[0].reason.includes('to file not found'));
  });

  test('skips link where via is absent from producer (missing export, not dead store)', () => {
    writeFile(tmpDir, 'src/lib/auth.js', 'export function login() {}');
    writeFile(tmpDir, 'src/pages/login.js', 'import { signIn } from "../lib/auth";');

    // via: signIn but auth.js exports login, not signIn
    writePlan(phaseDir, '01-01-PLAN.md', [
      { from: 'src/lib/auth.js', to: 'src/pages/login.js', via: 'signIn' },
    ]);

    const result = runGsdTools(['verify', 'dead-exports', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    // Missing export in from → skipped (not a dead store)
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.dead_stores.length, 0);
    assert.ok(output.skipped.some(s => s.reason.includes('missing export')));
  });

  test('handles key_link without via — skipped cleanly', () => {
    writeFile(tmpDir, 'src/lib/auth.js', 'export function signIn() {}');
    writeFile(tmpDir, 'src/pages/login.js', 'import { signIn } from "../lib/auth";');

    writePlan(phaseDir, '01-01-PLAN.md', [
      { from: 'src/lib/auth.js', to: 'src/pages/login.js' }, // no via
    ]);

    const result = runGsdTools(['verify', 'dead-exports', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.links_checked, 0);
  });

  test('detects multiple dead stores across plans', () => {
    writeFile(tmpDir, 'src/lib/db.js', 'export function query() {} export function connect() {}');
    writeFile(tmpDir, 'src/api/a.js', '// no db usage');
    writeFile(tmpDir, 'src/api/b.js', '// no db usage either');

    writePlan(phaseDir, '01-01-PLAN.md', [
      { from: 'src/lib/db.js', to: 'src/api/a.js', via: 'query' },
      { from: 'src/lib/db.js', to: 'src/api/b.js', via: 'connect' },
    ]);

    const result = runGsdTools(['verify', 'dead-exports', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    assert.strictEqual(output.dead_stores.length, 2);
    assert.strictEqual(output.links_checked, 2);
  });

  test('errors if phase not found', () => {
    const result = runGsdTools(['verify', 'dead-exports', '99'], tmpDir);
    assert.ok(result.success, 'Command should exit 0 with error JSON');
    const output = JSON.parse(result.output);
    assert.ok(output.error);
  });
});
