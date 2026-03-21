const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { normalizeInternal } = require('../get-stuff-done/bin/lib/internal-normalizer.cjs');
const { normalizeFirecrawl } = require('../get-stuff-done/bin/lib/firecrawl-normalizer.cjs');
const contextStore = require('../get-stuff-done/bin/lib/context-store.cjs');

describe('Normalization Parity', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-normalization-parity-'));
    // Setup minimal structure
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('internal and external artifacts share canonical structure', async () => {
    // 1. Internal Normalization
    const projectMd = path.join(tmpDir, '.planning', 'PROJECT.md');
    fs.writeFileSync(projectMd, '# Project\nTest vision.', 'utf8');
    const internalArtifacts = await normalizeInternal(tmpDir);
    const internal = internalArtifacts[0];

    // 2. External Normalization
    const firecrawlResult = {
      success: true,
      data: {
        metadata: { sourceURL: 'https://docs.example.com', title: 'Example Docs' },
        markdown: '# Docs\nExample documentation.'
      }
    };
    const external = normalizeFirecrawl(firecrawlResult);

    // 3. Assert Parity
    const keys = ['id', 'source_uri', 'type', 'content_markdown', 'content_hash', 'normalized_at', 'provenance'];
    keys.forEach(key => {
      assert.ok(key in internal, `Internal artifact missing key: ${key}`);
      assert.ok(key in external, `External artifact missing key: ${key}`);
    });

    assert.strictEqual(internal.type, 'internal');
    assert.strictEqual(external.type, 'external');
    assert.strictEqual(internal.provenance.producer, 'internal-normalizer');
    assert.strictEqual(external.provenance.producer, 'firecrawl-normalizer');
  });

  test('id generation is deterministic and stable', () => {
    const firecrawlResult = {
      success: true,
      data: {
        metadata: { sourceURL: 'https://docs.example.com', title: 'Example Docs' },
        markdown: '# Docs\nExample documentation.'
      }
    };

    const first = normalizeFirecrawl(firecrawlResult);
    const second = normalizeFirecrawl(firecrawlResult);

    assert.strictEqual(first.id, second.id, 'IDs should be identical for identical content');
    assert.strictEqual(first.content_hash, second.content_hash, 'Hashes should be identical');
  });

  test('context build integrates with normalizers', async () => {
    // This test ensures that when artifacts are put into the store,
    // they can be retrieved by their canonical ID.
    const projectMd = path.join(tmpDir, '.planning', 'PROJECT.md');
    fs.writeFileSync(projectMd, '# Project\nTest vision.', 'utf8');
    
    const internalArtifacts = await normalizeInternal(tmpDir);
    internalArtifacts.forEach(a => contextStore.put(tmpDir, a));

    const artifactIds = contextStore.list(tmpDir);
    const artifacts = artifactIds.map(id => contextStore.get(tmpDir, id));
    assert.ok(artifacts.length > 0, 'Store should contain normalized artifacts');
    
    const projectArtifact = artifacts.find(a => a.source_uri.includes('PROJECT.md'));
    assert.ok(projectArtifact, 'Project artifact should exist in store');
    assert.strictEqual(projectArtifact.type, 'internal');
  });
});
