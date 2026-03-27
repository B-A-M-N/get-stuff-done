const { describe, test } = require('node:test');
const assert = require('node:assert');

const openBrain = require('../get-stuff-done/bin/lib/open-brain.cjs');

describe('open brain retrieval', () => {
  test('returns a bounded curated selection instead of unbounded raw rows', async () => {
    assert.strictEqual(typeof openBrain.searchOpenBrain, 'function');
    assert.strictEqual(typeof openBrain.recallForWorkflow, 'function');

    const items = [
      {
        id: 'memory-1',
        title: 'Promoted architecture note',
        body_markdown: 'bounded recall',
        project_scope: 'project-alpha',
        source_uri: 'docs/OPEN-BRAIN-ARCHITECTURE.md',
        source_kind: 'internal',
        status: 'promoted',
        importance_score: 0.8,
        reuse_count: 2,
        helpful_count: 1,
        harmful_count: 0,
        updated_at: '2026-03-27T00:00:00.000Z',
        embedding: [1, 0, 0],
        internal_row_id: 10,
      },
      {
        id: 'memory-2',
        title: 'Superseded note',
        body_markdown: 'old note',
        project_scope: 'project-alpha',
        status: 'promoted',
        superseded_by: 'memory-9',
        importance_score: 0.9,
        reuse_count: 10,
        helpful_count: 10,
        harmful_count: 0,
        updated_at: '2026-03-27T00:00:00.000Z',
        embedding: [1, 0, 0],
      },
      {
        id: 'memory-3',
        title: 'Archived note',
        body_markdown: 'archived',
        project_scope: 'project-alpha',
        status: 'archived',
        importance_score: 1,
        reuse_count: 1,
        helpful_count: 1,
        harmful_count: 0,
        updated_at: '2026-03-27T00:00:00.000Z',
        embedding: [1, 0, 0],
      },
      {
        id: 'memory-4',
        title: 'Cross-project but relevant',
        body_markdown: 'semantic ranking',
        project_scope: 'project-beta',
        status: 'promoted',
        importance_score: 0.6,
        reuse_count: 1,
        helpful_count: 0,
        harmful_count: 0,
        updated_at: '2026-03-26T00:00:00.000Z',
        embedding: [0.8, 0.2, 0],
      },
    ];

    const result = await openBrain.searchOpenBrain({
      query: 'bounded recall ranking',
      project_scope: 'project-alpha',
      limit: 2,
      embeddingProvider: {
        async embedText() {
          return { available: true, vector: [1, 0, 0], dimensions: 3, provider: 'test' };
        },
      },
      storage: {
        async searchMemories() {
          return items;
        },
      },
    });

    assert.strictEqual(result.limit, 2);
    assert.strictEqual(result.selected.length, 2);
    assert.deepStrictEqual(
      result.selected.map((item) => item.id),
      ['memory-1', 'memory-4']
    );
    assert.ok(result.selected.every((item) => !('embedding' in item)));
    assert.ok(result.selected.every((item) => !('internal_row_id' in item)));
  });
});
