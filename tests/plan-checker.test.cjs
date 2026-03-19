/**
 * GSD Tools Tests - Plan Checker (Dimension 9)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('Cross-Plan Data Contracts (Dimension 9)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reports race condition when multiple plans modify same file in same wave', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Plan 01
    fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), [
      '---',
      'wave: 1',
      'files_modified: [src/main.js]',
      '---',
      '# Plan 01',
    ].join('\n'));

    // Plan 02 - same wave, same file
    fs.writeFileSync(path.join(phaseDir, '02-PLAN.md'), [
      '---',
      'wave: 1',
      'files_modified: [src/main.js]',
      '---',
      '# Plan 02',
    ].join('\n'));

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success);
    
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.issues.some(i => i.type === 'race_condition'));
    assert.ok(output.issues[0].description.includes('src/main.js'));
  });

  test('reports data race when Plan B reads what Plan A writes in same wave', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Plan 01
    fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), [
      '---',
      'wave: 1',
      'files_modified: [src/lib/api.js]',
      '---',
      '# Plan 01',
    ].join('\n'));

    // Plan 02 - same wave, reads api.js
    fs.writeFileSync(path.join(phaseDir, '02-PLAN.md'), [
      '---',
      'wave: 1',
      'files_modified: [src/main.js]',
      '---',
      '# Plan 02',
      '<action>',
      'Read `src/lib/api.js` and use its export.',
      '</action>',
    ].join('\n'));

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success);
    
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.issues.some(i => i.type === 'data_race'));
    assert.ok(output.issues[0].files.includes('src/lib/api.js'));
  });

  test('passes when plans are in different waves', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Plan 01 - Wave 1
    fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), [
      '---',
      'wave: 1',
      'files_modified: [src/lib/api.js]',
      '---',
      '# Plan 01',
    ].join('\n'));

    // Plan 02 - Wave 2, reads api.js
    fs.writeFileSync(path.join(phaseDir, '02-PLAN.md'), [
      '---',
      'wave: 2',
      'files_modified: [src/main.js]',
      '---',
      '# Plan 02',
      '<action>',
      'Read `src/lib/api.js` and use its export.',
      '</action>',
    ].join('\n'));

    const result = runGsdTools(['verify', 'cross-plan-data-contracts', '01'], tmpDir);
    assert.ok(result.success);
    
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.issues.length, 0);
  });
});
