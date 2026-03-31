#!/usr/bin/env node
// Cross-platform test runner — resolves test file globs via Node
// instead of relying on shell expansion (which fails on Windows PowerShell/cmd).
// Propagates NODE_V8_COVERAGE so c8 collects coverage from the child process.
'use strict';

const { readdirSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const testDir = join(__dirname, '..', 'tests');
const files = [];

function collectTests(dir, relativePrefix = 'tests') {
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = join(relativePrefix, entry.name);
    if (entry.isDirectory()) {
      collectTests(fullPath, relativePath);
      continue;
    }
    if (entry.name.endsWith('.test.cjs')) {
      files.push(relativePath);
    }
  }
}

collectTests(testDir);

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

try {
  execFileSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
} catch (err) {
  process.exit(err.status || 1);
}
