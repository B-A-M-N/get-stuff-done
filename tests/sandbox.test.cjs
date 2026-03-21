const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { checkPath } = require('../get-stuff-done/bin/lib/sandbox.cjs');

const cwd = process.cwd();

console.log('--- Sandbox Test Suite ---');

// Test 1: Direct checkPath logic
console.log('\n[Test 1] Direct checkPath logic');

const cases = [
  { path: '.planning/STATE.md', expected: false },
  { path: 'README.md', expected: true },
  { path: 'get-stuff-done/bin/gsd-shell.js', expected: true },
  { path: '.env', expected: false },
  { path: 'node_modules/fs-extra', expected: false },
  { path: './.planning/STATE.md', expected: false },
  { path: '../get-stuff-done/.planning/STATE.md', expected: false },
];

for (const tc of cases) {
  const check = checkPath(cwd, tc.path);
  assert.strictEqual(check.allowed, tc.expected, `Path "${tc.path}" should be ${tc.expected ? 'allowed' : 'denied'}`);
  console.log(`✓ Path "${tc.path}" ${check.allowed ? 'allowed' : 'denied'} as expected.`);
}

// Test 2: gsd-shell.js interceptor
console.log('\n[Test 2] gsd-shell.js interceptor');

function runGsdShell(args) {
  return spawnSync('node', [path.join(cwd, 'get-stuff-done/bin/gsd-shell.js'), ...args]);
}

// Allowed command
const res1 = runGsdShell(['ls', 'README.md']);
assert.strictEqual(res1.status, 0, 'ls README.md should be allowed (exit code 0)');
console.log('✓ "ls README.md" allowed (exit 0)');

// Denied command
const res2 = runGsdShell(['cat', '.planning/STATE.md']);
assert.strictEqual(res2.status, 13, 'cat .planning/STATE.md should be blocked (exit code 13)');
console.log('✓ "cat .planning/STATE.md" blocked (exit 13)');

// Relative path bypass attempt
const res3 = runGsdShell(['cat', './.planning/STATE.md']);
assert.strictEqual(res3.status, 13, 'cat ./.planning/STATE.md should be blocked (exit code 13)');
console.log('✓ "cat ./.planning/STATE.md" blocked (exit 13)');

// Double dot bypass attempt
const res4 = runGsdShell(['cat', 'tests/../.planning/STATE.md']);
assert.strictEqual(res4.status, 13, 'cat tests/../.planning/STATE.md should be blocked (exit code 13)');
console.log('✓ "cat tests/../.planning/STATE.md" blocked (exit 13)');

// Test 3: Multiple arguments
console.log('\n[Test 3] Multiple arguments');
const res5 = runGsdShell(['ls', 'README.md', '.planning/STATE.md']);
assert.strictEqual(res5.status, 13, 'ls with mixed allowed/denied paths should be blocked (exit code 13)');
console.log('✓ Mixed "ls README.md .planning/STATE.md" blocked (exit 13)');

console.log('\n--- Sandbox Test Suite: PASSED ---');
