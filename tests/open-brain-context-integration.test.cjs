const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const context = require('../get-stuff-done/bin/lib/context.cjs');

const plannerPromptPath = path.join(
  __dirname,
  '..',
  'get-stuff-done',
  'templates',
  'planner-subagent-prompt.md'
);

describe('open brain workflow context integration', () => {
  test('buildOpenBrainRecallPack returns a bounded curated pack for workflow use', async () => {
    assert.strictEqual(typeof context.buildOpenBrainRecallPack, 'function');

    const result = await context.buildOpenBrainRecallPack({
      workflow: 'execute-plan',
      pointer: { phase: 55, plan: 3 },
      recallReader: async (options) => {
        assert.strictEqual(options.workflow, 'execute-plan');
        assert.strictEqual(options.phase, '55');
        assert.strictEqual(options.plan, '03');
        return {
          available: true,
          blocked: false,
          query: 'Phase 55 plan 03 open brain workflow context',
          total_candidates: 4,
          recall_event: { id: 'recall-1' },
          selected: [
            {
              id: 'memory-1',
              title: 'Prior planner lesson',
              body_markdown: 'Keep semantic recall bounded.',
              project_scope: 'project-alpha',
              ranking: { score: 0.9, similarity: 0.8 },
              source_uri: 'docs/OPEN-BRAIN-ARCHITECTURE.md',
              internal_row_id: 9,
            },
            {
              id: 'memory-2',
              title: 'Execution pitfall',
              body_markdown: 'Do not treat recall as execution truth.',
              project_scope: 'project-alpha',
              ranking: { score: 0.8, similarity: 0.7 },
              source_uri: '.planning/phases/54-model-facing-second-brain-via-mcp/54-02-SUMMARY.md',
            },
            {
              id: 'memory-3',
              title: 'Old note',
              body_markdown: 'Should be dropped by pack limit.',
              project_scope: 'project-alpha',
              ranking: { score: 0.3, similarity: 0.2 },
              source_uri: 'notes/old.md',
            },
          ],
        };
      },
    });

    assert.strictEqual(result.open_brain_recall.available, true);
    assert.strictEqual(result.open_brain_recall.blocked, false);
    assert.strictEqual(result.open_brain_recall.total_entries, 2);
    assert.strictEqual(result.open_brain_recall.total_candidates, 4);
    assert.strictEqual(result.open_brain_recall.recall_event.id, 'recall-1');
    assert.deepStrictEqual(
      result.open_brain_recall.entries.map((entry) => entry.id),
      ['memory-1', 'memory-2']
    );
    assert.ok(result.open_brain_recall.entries.every((entry) => !('internal_row_id' in entry)));
    assert.deepStrictEqual(Object.keys(result.open_brain_recall.entries[0]), [
      'id',
      'title',
      'body_markdown',
      'source_uri',
      'project_scope',
      'ranking',
    ]);
  });

  test('planner prompt distinguishes open brain recall from firecrawl and second brain truth', () => {
    const prompt = fs.readFileSync(plannerPromptPath, 'utf8');

    assert.match(prompt, /Open Brain/i);
    assert.match(prompt, /curated long-horizon memory/i);
    assert.match(prompt, /Firecrawl/i);
    assert.match(prompt, /Second Brain/i);
  });
});
