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

describe('workflow memory pack integration', () => {
  test('buildMemoryPack bounds and curates workflow memory entries', () => {
    assert.strictEqual(typeof context.buildMemoryPack, 'function');

    const entries = [
      { memory_kind: 'decision', title: 'Decision 1', body_markdown: 'D1', source_ref: '54-01-SUMMARY.md', created_at: '2026-03-26T00:00:00Z', importance: 5, phase: '54', plan: '01', schema_json: '{"leak":true}' },
      { memory_kind: 'decision', title: 'Decision 2', body_markdown: 'D2', source_ref: '54-01-SUMMARY.md', created_at: '2026-03-26T00:00:01Z', importance: 4, phase: '54', plan: '01', latency_ms: 2 },
      { memory_kind: 'decision', title: 'Decision 3', body_markdown: 'D3', source_ref: '54-01-SUMMARY.md', created_at: '2026-03-26T00:00:02Z', importance: 3, phase: '54', plan: '01' },
      { memory_kind: 'decision', title: 'Decision 4', body_markdown: 'D4', source_ref: '54-01-SUMMARY.md', created_at: '2026-03-26T00:00:03Z', importance: 2, phase: '54', plan: '01' },
      { memory_kind: 'summary', title: 'Summary 1', body_markdown: 'S1', source_ref: '53-01-SUMMARY.md', created_at: '2026-03-25T00:00:00Z', importance: 4, phase: '53', plan: '01' },
      { memory_kind: 'summary', title: 'Summary 2', body_markdown: 'S2', source_ref: '53-02-SUMMARY.md', created_at: '2026-03-24T00:00:00Z', importance: 3, phase: '53', plan: '02' },
      { memory_kind: 'summary', title: 'Summary 3', body_markdown: 'S3', source_ref: '53-03-SUMMARY.md', created_at: '2026-03-23T00:00:00Z', importance: 2, phase: '53', plan: '03' },
      { memory_kind: 'pitfall', title: 'Pitfall 1', body_markdown: 'P1', source_ref: '54-RESEARCH.md', created_at: '2026-03-20T00:00:00Z', importance: 4, phase: '54', plan: null },
      { memory_kind: 'pitfall', title: 'Pitfall 2', body_markdown: 'P2', source_ref: '54-RESEARCH.md', created_at: '2026-03-19T00:00:00Z', importance: 3, phase: '54', plan: null },
      { memory_kind: 'pitfall', title: 'Pitfall 3', body_markdown: 'P3', source_ref: '54-RESEARCH.md', created_at: '2026-03-18T00:00:00Z', importance: 2, phase: '54', plan: null },
      { memory_kind: 'checkpoint', title: 'Checkpoint 1', body_markdown: 'C1', source_ref: '54-01-SUMMARY.md', created_at: '2026-03-21T00:00:00Z', importance: 3, phase: '54', plan: '01' },
      { memory_kind: 'checkpoint', title: 'Checkpoint 2', body_markdown: 'C2', source_ref: '54-01-SUMMARY.md', created_at: '2026-03-20T00:00:00Z', importance: 2, phase: '54', plan: '01' },
      { memory_kind: 'resolution', title: 'Ignore me', body_markdown: 'R1', source_ref: '54-01-SUMMARY.md', created_at: '2026-03-22T00:00:00Z', importance: 1, phase: '54', plan: '01' },
    ];

    const pack = context.buildMemoryPack(entries);

    assert.deepStrictEqual(pack.available, true);
    assert.deepStrictEqual(pack.blocked, false);
    assert.strictEqual(pack.total_entries, 8);
    assert.strictEqual(pack.recent_decisions.length, 3);
    assert.strictEqual(pack.prior_summaries.length, 2);
    assert.strictEqual(pack.known_pitfalls.length, 2);
    assert.strictEqual(pack.unresolved_blockers.length, 1);
    assert.strictEqual(pack.unresolved_blockers[0].title, 'Checkpoint 1');
    assert.ok(pack.recent_decisions.every((entry) => !Object.prototype.hasOwnProperty.call(entry, 'schema_json')));
    assert.ok(pack.recent_decisions.every((entry) => !Object.prototype.hasOwnProperty.call(entry, 'latency_ms')));
  });

  test('loadWorkflowMemoryPack returns a structured pack for plan and execute workflows', async () => {
    assert.strictEqual(typeof context.loadWorkflowMemoryPack, 'function');

    const items = [
      { memory_kind: 'decision', title: 'Prefer bounded packs', body_markdown: 'Use curated internal memory only.', source_ref: '54-RESEARCH.md', created_at: '2026-03-26T00:00:00Z', importance: 5, phase: '54', plan: null },
      { memory_kind: 'summary', title: 'Phase 54 wave 1', body_markdown: 'Toolbox contract is in place.', source_ref: '54-01-SUMMARY.md', created_at: '2026-03-26T00:00:01Z', importance: 4, phase: '54', plan: '01' },
    ];

    const executePack = await context.loadWorkflowMemoryPack({
      workflow: 'execute-plan',
      pointer: { phase: 54, plan: 2 },
      memoryReader: async (filters) => {
        assert.strictEqual(filters.phase, '54');
        assert.strictEqual(filters.plan, '02');
        return { available: true, blocked: false, items };
      },
    });

    const planPack = await context.loadWorkflowMemoryPack({
      workflow: 'plan-phase',
      pointer: { phase: 54, plan: null },
      memoryReader: async (filters) => {
        assert.strictEqual(filters.phase, '54');
        assert.strictEqual(filters.plan, null);
        return { available: true, blocked: false, items };
      },
    });

    assert.strictEqual(executePack.memory_pack.available, true);
    assert.strictEqual(planPack.memory_pack.available, true);
    assert.strictEqual(executePack.memory_pack.recent_decisions[0].title, 'Prefer bounded packs');
    assert.strictEqual(planPack.memory_pack.prior_summaries[0].title, 'Phase 54 wave 1');
  });

  test('planner prompt treats memory_pack as workflow memory, not a Firecrawl replacement', () => {
    const prompt = fs.readFileSync(plannerPromptPath, 'utf8');

    assert.match(prompt, /memory_pack/);
    assert.match(prompt, /bounded workflow memory/i);
    assert.match(prompt, /Firecrawl/i);
    assert.doesNotMatch(prompt, /fetch arbitrary web/i);
  });
});
