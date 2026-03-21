const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { normalizeInternal } = require('../get-stuff-done/bin/lib/internal-normalizer.cjs');
const { normalizeFirecrawl } = require('../get-stuff-done/bin/lib/firecrawl-normalizer.cjs');

describe('AST Normalization', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-ast-normalization-'));
    // Setup minimal structure
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('internal normalizer extracts symbols from a mock .js file', () => {
    const jsFilePath = path.join(tmpDir, '.planning', 'test-script.js');
    const code = `
      function calculateSum(a, b) {
        return a + b;
      }
      
      const multiplier = (x) => x * 2;
      
      class Calculator {
        constructor() {}
      }
      
      const fs = require('fs');
      import { something } from './local-module';
    `;
    fs.writeFileSync(jsFilePath, code, 'utf8');

    const internalArtifacts = normalizeInternal(tmpDir);
    const artifact = internalArtifacts.find(a => a.source_uri.includes('test-script.js'));

    assert.ok(artifact, 'Artifact should exist for test-script.js');
    assert.ok(artifact.analysis, 'Artifact should have an analysis field');
    
    const { symbols, dependencies } = artifact.analysis;

    // Check symbols
    const calculateSum = symbols.find(s => s.name === 'calculateSum' && s.kind === 'function');
    const multiplier = symbols.find(s => s.name === 'multiplier' && s.kind === 'function');
    const Calculator = symbols.find(s => s.name === 'Calculator' && s.kind === 'class');

    assert.ok(calculateSum, 'Should find calculateSum function');
    assert.ok(multiplier, 'Should find multiplier function');
    assert.ok(Calculator, 'Should find Calculator class');

    // Check line numbers (1-based)
    // calculateSum is on line 2
    assert.strictEqual(calculateSum.line, 2);
    // multiplier is on line 6
    assert.strictEqual(multiplier.line, 6);
    // Calculator is on line 8
    assert.strictEqual(Calculator.line, 8);

    // Check dependencies
    assert.ok(dependencies.includes('fs'), 'Should include "fs" dependency');
    assert.ok(dependencies.includes('./local-module'), 'Should include local module dependency');
  });

  test('firecrawl normalizer extracts symbols from markdown code blocks', () => {
    const firecrawlResult = {
      success: true,
      data: {
        metadata: { sourceURL: 'https://docs.example.com/api', title: 'API Docs' },
        markdown: `
# API Reference

Here is an example function:

\`\`\`javascript
function fetchData(url) {
  return fetch(url);
}
\`\`\`

And a class:

\`\`\`js
class APIClient {
  constructor() {}
}
\`\`\`

And some imports:

\`\`\`ts
import { Axios } from 'axios';
const path = require('path');
\`\`\`
        `
      }
    };

    const artifact = normalizeFirecrawl(firecrawlResult);

    assert.ok(artifact.analysis, 'Artifact should have an analysis field');
    const { symbols, dependencies } = artifact.analysis;

    // Check symbols
    const fetchData = symbols.find(s => s.name === 'fetchData' && s.kind === 'function');
    const APIClient = symbols.find(s => s.name === 'APIClient' && s.kind === 'class');

    assert.ok(fetchData, 'Should find fetchData function from markdown');
    assert.ok(APIClient, 'Should find APIClient class from markdown');

    // Check dependencies
    assert.ok(dependencies.includes('axios'), 'Should find axios dependency from TS block');
    assert.ok(dependencies.includes('path'), 'Should find path dependency from TS block');
  });

  test('symbols found in code blocks include correct line relative to block start', () => {
    const firecrawlResult = {
      success: true,
      data: {
        metadata: { sourceURL: 'https://docs.example.com/api', title: 'API Docs' },
        markdown: "```javascript\nfunction test(){}\n```"
      }
    };

    const artifact = normalizeFirecrawl(firecrawlResult);
    const testFunc = artifact.analysis.symbols.find(s => s.name === 'test');
    
    // Line 1 is "function test(){}"
    assert.strictEqual(testFunc.line, 1);
  });

  test('parity check between internal and external extraction quality', () => {
    const code = 'function commonFunc() {}';
    
    // Internal
    const jsFilePath = path.join(tmpDir, '.planning', 'common.js');
    fs.writeFileSync(jsFilePath, code, 'utf8');
    const internalArtifacts = normalizeInternal(tmpDir);
    const internal = internalArtifacts.find(a => a.source_uri.includes('common.js'));

    // External
    const firecrawlResult = {
      success: true,
      data: {
        metadata: { sourceURL: 'https://docs.example.com/common', title: 'Common' },
        markdown: `\`\`\`javascript\n${code}\n\`\`\``
      }
    };
    const external = normalizeFirecrawl(firecrawlResult);

    assert.deepStrictEqual(internal.analysis.symbols, external.analysis.symbols, 'Symbols should be identical for same code');
    assert.deepStrictEqual(internal.analysis.dependencies, external.analysis.dependencies, 'Dependencies should be identical for same code');
  });
});
