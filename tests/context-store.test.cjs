const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('../get-stuff-done/bin/lib/context-store.cjs');
const { generateArtifactId } = require('../get-stuff-done/bin/lib/context-artifact.cjs');

test('Context Store - lifecycle', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-store-test-'));
  
  try {
    await t.test('should put and get an artifact', () => {
      const artifact = {
        id: generateArtifactId('https://example.com', 'hash123'),
        source_uri: 'https://example.com',
        type: 'external',
        content_markdown: '# Example',
        content_hash: 'hash123',
        normalized_at: new Date().toISOString(),
        provenance: {
          producer: 'firecrawl',
          producer_version: '1.0.0',
          parameters_hash: null
        }
      };
      
      const saved = store.put(tmpDir, artifact);
      assert.deepStrictEqual(saved, artifact);
      
      const retrieved = store.get(tmpDir, artifact.id);
      assert.deepStrictEqual(retrieved, artifact);
    });
    
    await t.test('should list saved artifacts', () => {
      const ids = store.list(tmpDir);
      assert.strictEqual(ids.length, 1);
      assert.ok(ids.includes(generateArtifactId('https://example.com', 'hash123')));
    });
    
    await t.test('should find by source URI', () => {
      const matches = store.findBySource(tmpDir, 'https://example.com');
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].source_uri, 'https://example.com');
    });
    
    await t.test('should handle missing files', () => {
      const result = store.get(tmpDir, 'non-existent-id');
      assert.strictEqual(result, null);
    });
    
    await t.test('should handle malformed JSON', () => {
      const dir = store.getStoreDir(tmpDir);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, 'malformed.json');
      fs.writeFileSync(filePath, 'invalid json', 'utf8');
      
      const result = store.get(tmpDir, 'malformed');
      assert.strictEqual(result, null);
    });

  } finally {
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
