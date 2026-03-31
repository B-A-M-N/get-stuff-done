#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { SafeLogger } = require('../packages/gsd-tools/src/logging/SafeLogger');

const ROOT = process.cwd();
const TARGET_DIRS = [
  path.join(ROOT, 'get-stuff-done', 'bin', 'lib'),
  path.join(ROOT, 'packages', 'gsd-tools', 'src'),
  path.join(ROOT, 'scripts'),
  path.join(ROOT, 'logs'),
];
const EXCLUDED_PATTERNS = [
  /tests\//,
  /packages\/gsd-tools\/src\/logging\/SafeLogger\.js$/,
  /scripts\/validate-secret-scan\.js$/,
  /\.planning\/phases\/52-truth-enforcement-hardening\/proofs\/inputs\//,
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...walk(fullPath));
      continue;
    }
    output.push(fullPath);
  }
  return output;
}

function shouldSkip(relativePath) {
  return EXCLUDED_PATTERNS.some(pattern => pattern.test(relativePath));
}

const findings = [];
for (const dir of TARGET_DIRS) {
  for (const file of walk(dir)) {
    const relativePath = path.relative(ROOT, file).replace(/\\/g, '/');
    if (shouldSkip(relativePath)) continue;
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const { name, regex } of SafeLogger.patterns()) {
      regex.lastIndex = 0;
      if (regex.test(content)) {
        findings.push({ file: relativePath, pattern: name });
      }
    }
  }
}

const outputPath = path.join(ROOT, '.planning', 'phases', '52-truth-enforcement-hardening', 'secret-scan-clean.txt');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

if (findings.length > 0) {
  const lines = findings.map(item => `${item.file}: ${item.pattern}`);
  fs.writeFileSync(outputPath, `FAIL ${new Date().toISOString()}\n${lines.join('\n')}\n`, 'utf8');
  console.error(lines.join('\n'));
  process.exit(1);
}

fs.writeFileSync(outputPath, `PASS ${new Date().toISOString()}\n`, 'utf8');
console.log('PASS');
