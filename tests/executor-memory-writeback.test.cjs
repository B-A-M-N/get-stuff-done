const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const actualFrontmatter = require('../get-stuff-done/bin/lib/frontmatter.cjs');

function withStubbedCommands(stubs, load) {
  const commandsPath = require.resolve('../get-stuff-done/bin/lib/commands.cjs');
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

  delete require.cache[commandsPath];

  try {
    return load(require(commandsPath));
  } finally {
    delete require.cache[commandsPath];
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

test('checkpoint lifecycle writes curated checkpoint memory through sanctioned helper', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-checkpoint-memory-'));
  const phaseRelDir = path.join('.planning', 'phases', '54-model-facing-second-brain-via-mcp');
  const phaseDir = path.join(tmpDir, phaseRelDir);
  fs.mkdirSync(phaseDir, { recursive: true });

  const outputs = [];
  const memoryWrites = [];

  await withStubbedCommands(
    {
      '../get-stuff-done/bin/lib/core.cjs': {
        safeReadFile(filePath) {
          try {
            return fs.readFileSync(filePath, 'utf8');
          } catch {
            return null;
          }
        },
        loadConfig: () => ({ commit_docs: true }),
        isGitIgnored: () => false,
        execGit: (_cwd, args) => {
          if (args[0] === 'rev-parse') return { exitCode: 0, stdout: 'abc123\n', stderr: '' };
          return { exitCode: 0, stdout: '', stderr: '' };
        },
        normalizePhaseName: () => {},
        comparePhaseNum: () => 0,
        getArchivedPhaseDirs: () => [],
        generateSlugInternal: () => '',
        getMilestoneInfo: () => ({}),
        getMilestonePhaseFilter: () => null,
        resolveModelInternal: () => null,
        stripShippedMilestones: (value) => value,
        toPosixPath: (value) => value.replace(/\\/g, '/'),
        output: (result) => outputs.push(result),
        error: (message) => { throw new Error(message); },
        findPhaseInternal: () => ({ directory: phaseRelDir }),
      },
      '../get-stuff-done/bin/lib/frontmatter.cjs': {
        extractFrontmatter: () => ({}),
      },
      '../get-stuff-done/bin/lib/model-profiles.cjs': {
        MODEL_PROFILES: {},
      },
      '../get-stuff-done/bin/lib/authority.cjs': {
        signFile: () => {},
      },
      '../get-stuff-done/bin/lib/checkpoint-plane-sync.cjs': {
        notifyCheckpointWrite: async () => ({ synced: true }),
      },
      '../get-stuff-done/bin/lib/second-brain.cjs': {
        writeModelFacingMemoryCheckpoint: async (entry) => {
          memoryWrites.push(entry);
          return { available: true, blocked: false, item: entry };
        },
        writeModelFacingMemorySummary: async () => {
          throw new Error('summary helper should not be used for checkpoint writes');
        },
      },
    },
    async (commands) => {
      await commands.cmdCheckpointWrite(tmpDir, '54', {
        plan: '02',
        type: 'human-action',
        why_blocked: 'Need refreshed credentials',
        what_is_uncertain: 'Whether the operator wants the existing account reused',
        task: '2',
        task_name: 'Write executor memory',
        choices: 'reuse existing account | add new account',
        resume_condition: 'Operator confirms which account to use',
        allow_freeform: true,
      }, false);
    }
  );

  assert.strictEqual(memoryWrites.length, 1);
  assert.deepStrictEqual(
    {
      phase: memoryWrites[0].phase,
      plan: memoryWrites[0].plan,
      memory_kind: memoryWrites[0].memory_kind,
      source_ref: memoryWrites[0].source_ref,
      created_by: memoryWrites[0].created_by,
    },
    {
      phase: '54',
      plan: '02',
      memory_kind: 'checkpoint',
      source_ref: path.join(phaseRelDir, 'CHECKPOINT.md'),
      created_by: 'executor-checkpoint',
    }
  );
  assert.match(memoryWrites[0].title, /Write executor memory/);
  assert.match(memoryWrites[0].body_markdown, /Need refreshed credentials/);
  assert.match(memoryWrites[0].body_markdown, /Operator confirms which account to use/);
  assert.strictEqual(outputs[0].memory_writeback.available, true);
});

test('summary lifecycle writes curated summary memory through sanctioned helper', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-summary-memory-'));
  const phaseRelDir = path.join('.planning', 'phases', '54-model-facing-second-brain-via-mcp');
  const phaseDir = path.join(tmpDir, phaseRelDir);
  fs.mkdirSync(phaseDir, { recursive: true });

  const summaryRelPath = path.join(phaseRelDir, '54-02-SUMMARY.md');
  fs.writeFileSync(path.join(tmpDir, summaryRelPath), `---
phase: 54-model-facing-second-brain-via-mcp
plan: 02
subsystem: infra
tags: [mcp]
duration: 10min
completed: 2026-03-27
---

# Phase 54 Plan 02: Model-Facing Second Brain via MCP Summary

**Executor lifecycle writeback now records curated checkpoint and summary memory through the sanctioned contract.**

## Accomplishments

- Wired checkpoint and summary lifecycle hooks to sanctioned helpers.
`, 'utf8');

  const outputs = [];
  const summaryWrites = [];

  await withStubbedCommands(
    {
      '../get-stuff-done/bin/lib/core.cjs': {
        safeReadFile(filePath) {
          try {
            return fs.readFileSync(filePath, 'utf8');
          } catch {
            return null;
          }
        },
        loadConfig: () => ({ commit_docs: true }),
        isGitIgnored: () => false,
        execGit: (_cwd, args) => {
          if (args[0] === 'rev-parse') return { exitCode: 0, stdout: 'def456\n', stderr: '' };
          return { exitCode: 0, stdout: '', stderr: '' };
        },
        normalizePhaseName: () => {},
        comparePhaseNum: () => 0,
        getArchivedPhaseDirs: () => [],
        generateSlugInternal: () => '',
        getMilestoneInfo: () => ({}),
        getMilestonePhaseFilter: () => null,
        resolveModelInternal: () => null,
        stripShippedMilestones: (value) => value,
        toPosixPath: (value) => value.replace(/\\/g, '/'),
        output: (result) => outputs.push(result),
        error: (message) => { throw new Error(message); },
        findPhaseInternal: () => ({ directory: phaseRelDir }),
      },
      '../get-stuff-done/bin/lib/frontmatter.cjs': {
        extractFrontmatter: (content) => actualFrontmatter.extractFrontmatter(content),
      },
      '../get-stuff-done/bin/lib/model-profiles.cjs': {
        MODEL_PROFILES: {},
      },
      '../get-stuff-done/bin/lib/authority.cjs': {
        signFile: () => {},
      },
      '../get-stuff-done/bin/lib/checkpoint-plane-sync.cjs': {
        notifyCheckpointWrite: async () => ({ synced: true }),
      },
      '../get-stuff-done/bin/lib/second-brain.cjs': {
        writeModelFacingMemoryCheckpoint: async () => {
          throw new Error('checkpoint helper should not be used for summary writes');
        },
        writeModelFacingMemorySummary: async (entry) => {
          summaryWrites.push(entry);
          return { available: true, blocked: false, item: entry };
        },
      },
    },
    async (commands) => {
      await commands.cmdCommit(tmpDir, 'docs(54-02): complete plan', [summaryRelPath], false, false);
    }
  );

  assert.strictEqual(summaryWrites.length, 1);
  assert.deepStrictEqual(
    {
      phase: summaryWrites[0].phase,
      plan: summaryWrites[0].plan,
      source_ref: summaryWrites[0].source_ref,
      created_by: summaryWrites[0].created_by,
    },
    {
      phase: '54',
      plan: '02',
      source_ref: summaryRelPath,
      created_by: 'executor-summary',
    }
  );
  assert.match(summaryWrites[0].title, /Phase 54 Plan 02/);
  assert.match(summaryWrites[0].body_markdown, /Executor lifecycle writeback now records curated checkpoint and summary memory/);
  assert.strictEqual(outputs[0].memory_writebacks.length, 1);
  assert.strictEqual(outputs[0].memory_writebacks[0].available, true);
});
