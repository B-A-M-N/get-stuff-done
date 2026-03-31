const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

describe('Synthesis Replay (Phase 12-03)', () => {
  let replay;
  let storeMock;
  let ptMock;
  let originalExists;

  beforeEach(() => {
    // Create mocks
    storeMock = {
      getArtifactWithSections: async (id) => ({
        id,
        mission_id: '52',
        artifact_type: 'phase-truth',
        content: 'generated_at: 2026-03-30T12:00:00Z\nphase: 52\nfinal_status: VALID\n',
        atom_ids_used: ['a.md', 'b.md'],
        synthesis_citations: [],
        sections: []
      }),
      getMissionSynthesisTimeline: async (mid) => [{
        id: 'syn_123',
        mission_id: mid,
        artifact_type: 'phase-truth',
        content: 'generated_at: 2026-03-30T12:00:00Z\nphase: 52\nfinal_status: VALID\n',
        atom_ids_used: ['a.md', 'b.md'],
        synthesis_citations: [],
        sections: []
      }]
    };

    ptMock = {
      derivePhaseTruth: async (cwd, phase, options) => ({
        generated_at: options.now || '2026-03-30T12:00:00Z',
        phase: String(phase),
        final_status: 'VALID'
      }),
      renderYaml: (obj) => `generated_at: ${obj.generated_at}\nphase: ${obj.phase}\nfinal_status: ${obj.final_status}\n`
    };

    originalExists = fs.existsSync;
    fs.existsSync = () => true;

    // Clear cache to force fresh require
    delete require.cache[require.resolve('../get-stuff-done/bin/lib/synthesis-replay.cjs')];
    // Set NODE_ENV so module registers hooks
    process.env.NODE_ENV = 'test';
    replay = require('../get-stuff-done/bin/lib/synthesis-replay.cjs');
    // Inject mocks via hooks
    replay.__setStore(storeMock);
    replay.__setPhaseTruth(ptMock);
  });

  afterEach(() => {
    fs.existsSync = originalExists;
    process.env.NODE_ENV = 'undefined';
    // Remove hooks reference
    if (replay && replay.__setStore) {
      delete replay.__setStore;
      delete replay.__setPhaseTruth;
    }
  });

  test('replayArtifact matches', async () => {
    const result = await replay.replayArtifact('syn_123');
    assert.strictEqual(result.matches, true, 'Should match when derivation identical');
    assert.strictEqual(result.failure_category, null);
  });

  test('replayArtifact not found', async () => {
    storeMock.getArtifactWithSections = async () => null;
    const result = await replay.replayArtifact('missing');
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.failure_category, 'NOT_FOUND');
  });

  test('replayArtifact missing atom', async () => {
    fs.existsSync = () => false;
    const result = await replay.replayArtifact('syn_123');
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.failure_category, 'MISSING_ATOM');
  });

  test('replayArtifact derivation failure', async () => {
    ptMock.derivePhaseTruth = async () => { throw new Error('derive failed'); };
    const result = await replay.replayArtifact('syn_123');
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.failure_category, 'VALIDATION_REJECTION');
  });

  test('replayArtifact content mismatch', async () => {
    ptMock.renderYaml = () => 'wrong content';
    const result = await replay.replayArtifact('syn_123');
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.failure_category, 'CONTENT_MISMATCH');
  });

  test('verifyArtifactIntegrity boolean', async () => {
    const result = await replay.verifyArtifactIntegrity('syn_123');
    assert.strictEqual(typeof result, 'boolean');
    assert.strictEqual(result, true);
  });

  test('reconstructMissionState aggregates', async () => {
    const result = await replay.reconstructMissionState('52');
    assert.strictEqual(result.mission_id, '52');
    assert.strictEqual(result.artifact_count, 1);
    assert.strictEqual(result.overall_status, 'intact');
  });
});
