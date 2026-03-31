const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const openBrain = require('../get-stuff-done/bin/lib/open-brain.cjs');
const embedder = require('../get-stuff-done/bin/lib/open-brain-embedder.cjs');
const context = require('../get-stuff-done/bin/lib/context.cjs');

describe('open brain degraded mode', () => {
  test('missing or disabled embedding capability does not crash callers', async () => {
    const provider = embedder.createEmbeddingProvider({ enabled: false });
    const status = openBrain.checkAvailability({
      postgresAvailable: true,
      pgvectorAvailable: true,
      embeddingProvider: provider,
    });

    assert.strictEqual(provider.getStatus().target, 'fastembed');
    assert.strictEqual(status.available, false);
    assert.strictEqual(status.blocked, false);
    assert.strictEqual(status.reason, 'embedding_unavailable');

    const embedded = await provider.embedText('phase 55');
    assert.deepStrictEqual(
      {
        available: embedded.available,
        reason: embedded.reason,
        dimensions: embedded.dimensions,
      },
      {
        available: false,
        reason: 'embedding_provider_disabled',
        dimensions: null,
      }
    );
  });

  test('missing postgres or pgvector produces explicit degraded metadata', () => {
    const provider = {
      getStatus() {
        return { available: true, target: 'fastembed', detail: null };
      },
    };

    const postgresDown = openBrain.checkAvailability({
      postgresAvailable: false,
      pgvectorAvailable: true,
      embeddingProvider: provider,
    });
    assert.strictEqual(postgresDown.available, false);
    assert.strictEqual(postgresDown.reason, 'postgres_unavailable');
    assert.match(postgresDown.detail, /continuing without semantic recall/i);

    const vectorDown = openBrain.checkAvailability({
      postgresAvailable: true,
      pgvectorAvailable: false,
      embeddingProvider: provider,
    });
    assert.strictEqual(vectorDown.available, false);
    assert.strictEqual(vectorDown.reason, 'pgvector_unavailable');
  });

  test('workflow context recall pack degrades cleanly when open brain is unavailable', async () => {
    assert.strictEqual(typeof context.buildOpenBrainRecallPack, 'function');

    const result = await context.buildOpenBrainRecallPack({
      workflow: 'execute-plan',
      pointer: { phase: 55, plan: 3 },
      recallReader: async () => ({
        available: false,
        blocked: false,
        reason: 'postgres_unavailable',
        detail: 'Open Brain storage unavailable; continuing without semantic recall.',
        backend_state: { active_backend: 'sqlite', degraded: true },
      }),
    });

    assert.deepStrictEqual(result.open_brain_recall, {
      available: false,
      blocked: false,
      reason: 'postgres_unavailable',
      message: 'Open Brain storage unavailable; continuing without semantic recall.',
      total_entries: 0,
      total_candidates: 0,
      entries: [],
      recall_event: null,
      backend_state: { active_backend: 'sqlite', degraded: true },
    });
  });

  test('operator status reports open brain readiness without conflating second brain truth', () => {
    const result = spawnSync(
      process.execPath,
      ['get-stuff-done/bin/gsd-tools.cjs', 'brain', 'open-status', '--raw'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          GSD_MEMORY_MODE: 'sqlite',
          PGHOST: '',
          PGPORT: '',
          PGDATABASE: '',
          PGUSER: '',
          PGPASSWORD: '',
          DATABASE_URL: '',
        },
      }
    );

    assert.strictEqual(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.schema, 'gsd_open_brain');
    assert.strictEqual(output.sidecar_only, true);
    assert.strictEqual(output.execution_truth_owner, 'second_brain');
    assert.strictEqual(output.available, false);
    assert.strictEqual(output.blocked, false);
  });
});
