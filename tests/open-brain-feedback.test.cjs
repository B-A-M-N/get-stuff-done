const { describe, test } = require('node:test');
const assert = require('node:assert');

const openBrain = require('../get-stuff-done/bin/lib/open-brain.cjs');
const openBrainRanker = require('../get-stuff-done/bin/lib/open-brain-ranker.cjs');

describe('open brain ranking feedback loop', () => {
  test('ranking incorporates similarity, recency, reuse, importance, feedback, and project scope match', () => {
    assert.strictEqual(typeof openBrainRanker.rankOpenBrainCandidates, 'function');

    const ranked = openBrainRanker.rankOpenBrainCandidates(
      [
        {
          id: 'recent-helpful',
          project_scope: 'project-alpha',
          importance_score: 0.8,
          reuse_count: 3,
          helpful_count: 4,
          harmful_count: 0,
          updated_at: '2026-03-27T00:00:00.000Z',
          embedding: [1, 0],
        },
        {
          id: 'harmful',
          project_scope: 'project-alpha',
          importance_score: 1,
          reuse_count: 5,
          helpful_count: 0,
          harmful_count: 4,
          updated_at: '2026-03-27T00:00:00.000Z',
          embedding: [1, 0],
        },
        {
          id: 'cross-project',
          project_scope: 'project-beta',
          importance_score: 0.8,
          reuse_count: 3,
          helpful_count: 4,
          harmful_count: 0,
          updated_at: '2026-03-27T00:00:00.000Z',
          embedding: [1, 0],
        },
      ],
      {
        queryEmbedding: [1, 0],
        projectScope: 'project-alpha',
        limit: 3,
        now: '2026-03-27T01:00:00.000Z',
      }
    );

    assert.deepStrictEqual(
      ranked.map((item) => item.id),
      ['recent-helpful', 'cross-project', 'harmful']
    );
    assert.ok(ranked[0].ranking.score > ranked[1].ranking.score);
    assert.ok(ranked[1].ranking.score > ranked[2].ranking.score);
  });

  test('recording helpful and harmful outcomes changes later retrieval ordering', async () => {
    const memories = [
      {
        id: 'memory-a',
        title: 'A',
        body_markdown: 'A',
        project_scope: 'project-alpha',
        status: 'promoted',
        importance_score: 0.6,
        reuse_count: 1,
        helpful_count: 0,
        harmful_count: 0,
        updated_at: '2026-03-27T00:00:00.000Z',
        embedding: [1, 0],
      },
      {
        id: 'memory-b',
        title: 'B',
        body_markdown: 'B',
        project_scope: 'project-alpha',
        status: 'promoted',
        importance_score: 0.7,
        reuse_count: 1,
        helpful_count: 0,
        harmful_count: 0,
        updated_at: '2026-03-27T00:00:00.000Z',
        embedding: [1, 0],
      },
    ];
    const recallEvents = [];

    const storage = {
      async searchMemories() {
        return memories;
      },
      async writeRecallEvent(event) {
        const stored = { id: `recall-${recallEvents.length + 1}`, ...event };
        recallEvents.push(stored);
        return stored;
      },
      async updateRecallOutcome({ recallEventId, outcome, selected_ids }) {
        const event = recallEvents.find((entry) => entry.id === recallEventId);
        if (!event) throw new Error('missing recall event');

        event.outcome = outcome;
        const targetIds = Array.isArray(selected_ids) && selected_ids.length > 0 ? selected_ids : event.selected_ids;
        for (const memoryId of targetIds) {
          const memory = memories.find((entry) => entry.id === memoryId);
          if (!memory) continue;
          if (outcome === 'helpful') memory.helpful_count += 1;
          if (outcome === 'harmful') memory.harmful_count += 1;
        }

        return event;
      },
    };

    const embeddingProvider = {
      async embedText() {
        return { available: true, vector: [1, 0], dimensions: 2, provider: 'test' };
      },
    };

    const before = await openBrain.recallForWorkflow({
      workflow: 'execute-plan',
      phase: '55',
      plan: '02',
      query: 'ranking feedback',
      project_scope: 'project-alpha',
      limit: 2,
      storage,
      embeddingProvider,
    });

    assert.deepStrictEqual(before.selected.map((item) => item.id), ['memory-b', 'memory-a']);

    await openBrain.recordRecallOutcome({
      recallEventId: before.recall_event.id,
      outcome: 'helpful',
      selected_ids: ['memory-a'],
      storage,
    });

    await openBrain.recordRecallOutcome({
      recallEventId: before.recall_event.id,
      outcome: 'harmful',
      selected_ids: ['memory-b'],
      storage,
    });

    const after = await openBrain.recallForWorkflow({
      workflow: 'execute-plan',
      phase: '55',
      plan: '02',
      query: 'ranking feedback',
      project_scope: 'project-alpha',
      limit: 2,
      storage,
      embeddingProvider,
    });

    assert.deepStrictEqual(after.selected.map((item) => item.id), ['memory-a', 'memory-b']);
    assert.strictEqual(after.recall_event.selected_ids[0], 'memory-a');
  });
});
