const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { cmdVerifySummary } = require('../get-stuff-done/bin/lib/verify.cjs');

test('Brownfield Mega Audit: Legacy summaries ingestion', () => {
  const cwd = path.resolve(__dirname, '..');
  const phasesDir = path.join(cwd, '.planning', 'phases');
  
  const summaries = [];
  if (fs.existsSync(phasesDir)) {
    const dirs = fs.readdirSync(phasesDir);
    for (const dir of dirs) {
      const match = dir.match(/^(\d+)/);
      if (match) {
        const phaseNum = parseInt(match[1], 10);
        if (phaseNum >= 1 && phaseNum <= 14) {
          const dirPath = path.join(phasesDir, dir);
          if (fs.statSync(dirPath).isDirectory()) {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
              if (file.endsWith('-SUMMARY.md')) {
                summaries.push(path.join('.planning', 'phases', dir, file));
              }
            }
          }
        }
      }
    }
  }

  assert.ok(summaries.length > 0, `Should find legacy summaries (found ${summaries.length})`);

  // Mock stdout to capture output
  let outputData = '';
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    outputData += chunk;
  };

  try {
    for (const summaryPath of summaries) {
      outputData = '';
      assert.doesNotThrow(() => {
        cmdVerifySummary(cwd, summaryPath, 0, true);
      }, `cmdVerifySummary threw on ${summaryPath}`);

      const result = JSON.parse(outputData);
      assert.strictEqual(result.passed, true, `Legacy summary should pass even with schema warnings: ${summaryPath} - ${JSON.stringify(result.errors)}`);
      assert.strictEqual(result.legacy, true, `Should have legacy flag: ${summaryPath}`);
    }
  } finally {
    process.stdout.write = originalWrite;
  }
});
