const { describe, test } = require('node:test');
const assert = require('node:assert');

const openBrain = require('../get-stuff-done/bin/lib/open-brain.cjs');
const internalNormalizer = require('../get-stuff-done/bin/lib/internal-normalizer.cjs');

describe('open brain ingestion helpers', () => {
  test('promotes a normalized artifact into an open brain memory item with project scope and source metadata', async () => {
    assert.strictEqual(typeof openBrain.ingestNormalizedArtifact, 'function');
    assert.strictEqual(typeof openBrain.promoteMemoryCandidate, 'function');
    assert.strictEqual(typeof internalNormalizer.isPromotableOpenBrainArtifact, 'function');

    const writes = [];
    const links = [];
    const artifact = {
      id: 'artifact-123',
      type: 'internal',
      title: 'Open Brain Architecture',
      source_uri: 'docs/OPEN-BRAIN-ARCHITECTURE.md',
      content_markdown: 'Bounded semantic recall for promoted knowledge.',
      content_hash: 'abc123',
      normalized_at: '2026-03-27T00:00:00.000Z',
      provenance: {
        producer: 'internal-normalizer',
        producer_version: '1.1.0',
        parameters_hash: null,
      },
    };

    const result = await openBrain.ingestNormalizedArtifact(artifact, {
      project_scope: 'project-alpha',
      memory_type: 'artifact_summary',
      importance_score: 0.92,
      links: [{ to_id: 'memory-2', relation_type: 'supports', score: 0.7 }],
      embeddingProvider: {
        async embedText(input) {
          assert.match(input, /Bounded semantic recall/);
          return { available: true, vector: [0.1, 0.2, 0.3], dimensions: 3, provider: 'test' };
        },
      },
      storage: {
        async writeMemory(memoryItem) {
          writes.push(memoryItem);
          return { id: 'memory-1', ...memoryItem };
        },
        async writeMemoryLink(link) {
          links.push(link);
          return link;
        },
      },
    });

    assert.strictEqual(writes.length, 1);
    assert.strictEqual(links.length, 1);
    assert.strictEqual(result.memory.id, 'memory-1');
    assert.strictEqual(result.memory.project_scope, 'project-alpha');
    assert.strictEqual(result.memory.memory_type, 'artifact_summary');
    assert.strictEqual(result.memory.source_uri, artifact.source_uri);
    assert.strictEqual(result.memory.source_kind, 'internal');
    assert.strictEqual(result.memory.status, 'promoted');
    assert.deepStrictEqual(result.memory.embedding, [0.1, 0.2, 0.3]);
    assert.strictEqual(result.links[0].from_id, 'memory-1');
  });

  test('rejects empty or malformed normalized artifacts cleanly', async () => {
    await assert.rejects(
      () =>
        openBrain.ingestNormalizedArtifact(
          {
            id: 'artifact-blank',
            type: 'internal',
            source_uri: 'docs/empty.md',
            content_markdown: '   ',
            content_hash: 'blank',
            normalized_at: '2026-03-27T00:00:00.000Z',
            provenance: {
              producer: 'internal-normalizer',
              producer_version: '1.1.0',
              parameters_hash: null,
            },
          },
          { project_scope: 'project-alpha' }
        ),
      /normalized artifact/i
    );

    assert.strictEqual(internalNormalizer.isPromotableOpenBrainArtifact({ type: 'internal' }), false);
  });

  test('allows promotion without links and only attaches them when supplied', async () => {
    const writes = [];
    const artifact = {
      id: 'artifact-456',
      type: 'internal',
      title: 'Validated lesson',
      source_uri: '.planning/phases/55-open-brain-v1-foundations/55-RESEARCH.md',
      content_markdown: 'Prefer curated/promoted artifacts over raw logs.',
      content_hash: 'def456',
      normalized_at: '2026-03-27T00:00:00.000Z',
      provenance: {
        producer: 'internal-normalizer',
        producer_version: '1.1.0',
        parameters_hash: null,
      },
    };

    const result = await openBrain.promoteMemoryCandidate(artifact, {
      project_scope: 'project-alpha',
      memory_type: 'workflow_lesson',
      embeddingProvider: {
        async embedText() {
          return { available: false, vector: null, dimensions: null, provider: 'test' };
        },
      },
      storage: {
        async writeMemory(memoryItem) {
          writes.push(memoryItem);
          return { id: 'memory-3', ...memoryItem };
        },
        async writeMemoryLink() {
          throw new Error('writeMemoryLink should not run without links');
        },
      },
    });

    assert.strictEqual(writes.length, 1);
    assert.deepStrictEqual(result.links, []);
    assert.strictEqual(result.memory.memory_type, 'workflow_lesson');
    assert.strictEqual(result.memory.embedding, null);
  });
});
