const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function withStubbedModules(stubs, load) {
  const contextPath = require.resolve('../get-stuff-done/bin/lib/context.cjs');
  const originals = new Map();

  for (const [request, exportsValue] of Object.entries(stubs)) {
    const resolved = require.resolve(request);
    originals.set(resolved, require.cache[resolved]);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: exportsValue,
    };
  }

  delete require.cache[contextPath];

  try {
    return load(require(contextPath));
  } finally {
    delete require.cache[contextPath];
    for (const [request] of Object.entries(stubs)) {
      const resolved = require.resolve(request);
      const original = originals.get(resolved);
      if (original) {
        require.cache[resolved] = original;
      } else {
        delete require.cache[resolved];
      }
    }
  }
}

test('external URL parity remains Firecrawl-only and separate from workflow memory loading', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-firecrawl-boundary-'));
  const phaseDir = path.join(tmpDir, '.planning', 'phases', '54-model-facing-second-brain-via-mcp');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(phaseDir, '54-RESEARCH.md'), 'Source: https://docs.example.com/spec\n');
  fs.writeFileSync(path.join(phaseDir, '54-2-PLAN.md'), 'Reference: https://example.com/plan\n');

  let firecrawlExtractCalls = 0;
  let memoryReadCalls = 0;
  const stored = [];

  const result = await withStubbedModules(
    {
      '../get-stuff-done/bin/lib/core.cjs': {
        output: () => {},
        error(message) { throw new Error(message); },
        safeReadFile(filePath) {
          try {
            return fs.readFileSync(filePath, 'utf8');
          } catch {
            return null;
          }
        },
        safeWriteFile: () => {},
        execGit: () => {},
        findPhaseInternal(cwd, phase) {
          return { directory: path.join('.planning', 'phases', '54-model-facing-second-brain-via-mcp') };
        },
        safeFs: fs,
        safeGit: { exec: () => ({ exitCode: 0, stdout: '' }) },
      },
      '../get-stuff-done/bin/lib/verify.cjs': {
        runVerifyIntegrity: () => ({ coherent: true, errors: [], warnings: [], checks: {} }),
      },
      '../get-stuff-done/bin/lib/context-store.cjs': {
        findBySource: () => [],
        put: (_cwd, artifact) => stored.push(artifact),
      },
      '../get-stuff-done/bin/lib/context-artifact.cjs': {},
      '../get-stuff-done/bin/lib/schema-registry.cjs': {
        lookup: async () => ({ schema: { title: 'Doc' }, domainPattern: 'example.com' }),
        markSchemaUsed: async () => {},
      },
      '../get-stuff-done/bin/lib/firecrawl-client.cjs': {
        extract: async (url) => {
          firecrawlExtractCalls += 1;
          return { success: true, url, markdown: `# ${url}` };
        },
      },
      '../get-stuff-done/bin/lib/firecrawl-normalizer.cjs': {
        normalizeFirecrawl(resultValue) {
          return { id: resultValue.url, source_uri: resultValue.url, content_markdown: resultValue.markdown };
        },
      },
      '../get-stuff-done/bin/lib/internal-normalizer.cjs': {
        normalizeInternal: async () => [],
      },
      '../get-stuff-done/bin/lib/second-brain.cjs': {
        readModelFacingMemory: async () => {
          memoryReadCalls += 1;
          return { available: true, blocked: false, items: [] };
        },
      },
    },
    async (context) => {
      process.chdir(tmpDir);
      await context.ensureExternalParity(tmpDir, 54, 2);
      return context.loadWorkflowMemoryPack({
        workflow: 'execute-plan',
        pointer: { phase: 54, plan: 2 },
      });
    }
  );

  assert.strictEqual(firecrawlExtractCalls, 2);
  assert.strictEqual(memoryReadCalls, 1);
  assert.strictEqual(stored.length, 2);
  assert.strictEqual(result.memory_pack.available, true);
});
