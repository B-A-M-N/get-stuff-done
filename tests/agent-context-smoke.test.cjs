const { test, describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Firecrawl client
const firecrawlClient = require('../get-stuff-done/bin/lib/firecrawl-client.cjs');

// Check availability first
const checkFirecrawl = async () => {
  const status = await firecrawlClient.check();
  return status.available;
};

// Skip entire suite if Firecrawl not available
const ensureAvailable = async () => {
  const available = await checkFirecrawl();
  if (!available) {
    console.log('Skipping agent-context-smoke test: Firecrawl unavailable');
    process.exit(0); // Success but skipped
  }
};

describe('Agent Context Smoke Test', () => {
  before(async () => {
    await ensureAvailable();
  });

  it('should retrieve unified context via Firecrawl API', async () => {
    const spec = {
      sources: ['.planning/STATE.md', '.planning/ROADMAP.md'],
      options: {
        normalize: true,
        max_total_bytes: 1048576,
        timeout_ms: 30000
      }
    };

    const start = Date.now();
    const result = await firecrawlClient.crawl(spec);
    const latency = Date.now() - start;

    console.log(`Unified context crawl completed in ${latency}ms`);

    // Validate response structure
    assert.ok(result, 'Result should be defined');
    assert.ok(Array.isArray(result.artifacts), 'Result should have artifacts array');
    assert.ok(result.artifacts.length >= 2, `Expected at least 2 artifacts, got ${result.artifacts.length}`);

    // Check each artifact has required fields
    for (const artifact of result.artifacts) {
      assert.ok(artifact.id, 'Artifact should have id');
      assert.ok(artifact.source_uri, 'Artifact should have source_uri');
      assert.ok(artifact.content_markdown, 'Artifact should have content_markdown');
      assert.ok(artifact.content_hash, 'Artifact should have content_hash');
      assert.ok(artifact.normalized_at, 'Artifact should have normalized_at');
    }

    // Verify both requested sources are present
    const sourceURIs = result.artifacts.map(a => a.source_uri);
    assert.ok(
      sourceURIs.includes(`file://${path.resolve('.planning/STATE.md')}`),
      'Missing STATE.md artifact'
    );
    assert.ok(
      sourceURIs.includes(`file://${path.resolve('.planning/ROADMAP.md')}`),
      'Missing ROADMAP.md artifact'
    );

    console.log('All assertions passed.');
  });
});
