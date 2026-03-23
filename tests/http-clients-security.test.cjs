/**
 * HTTP Clients Security Tests
 *
 * Verifies that malicious environment variables do not lead to shell command
 * execution. Since we replaced execSync with https.request, shell injection
 * should be impossible. These tests confirm that malformed URLs are handled
 * safely (throwing errors, not executing arbitrary commands).
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Clean up any previous pwned file
const PWNED_FILE = '/tmp/pwned';

function cleanupPwned() {
  if (fs.existsSync(PWNED_FILE)) {
    fs.unlinkSync(PWNED_FILE);
  }
}

describe('HTTP Clients Security', () => {
  let originalEnv = {};

  beforeEach(() => {
    cleanupPwned();
    // Save original env vars
    originalEnv.FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
    originalEnv.GSD_SEARXNG_URL = process.env.GSD_SEARXNG_URL;
    originalEnv.GSD_PLANNING_URL = process.env.GSD_PLANNING_URL;
  });

  afterEach(() => {
    // Restore env vars
    process.env.FIRECRAWL_API_URL = originalEnv.FIRECRAWL_API_URL;
    process.env.GSD_SEARXNG_URL = originalEnv.GSD_SEARXNG_URL;
    process.env.GSD_PLANNING_URL = originalEnv.GSD_PLANNING_URL;
    cleanupPwned();
  });

  test('SECURITY: FirecrawlClient does not execute shell on malicious URL', async () => {
    // Set malicious URL with shell metacharacters
    process.env.FIRECRAWL_API_URL = 'http://localhost:3002"; echo pwned > /tmp/pwned; #';

    // Import after setting env to pick up the malicious value
    delete require.cache[require.resolve('../get-stuff-done/bin/lib/firecrawl-client.cjs')];
    const FirecrawlClient = require('../get-stuff-done/bin/lib/firecrawl-client.cjs');

    // Attempt to use the client - check() should not throw even with malformed URL
    let error = null;
    try {
      const result = await FirecrawlClient.check();
      // With malformed URL, the API will be unavailable (apiUp false)
      assert.strictEqual(result.available, false, 'API should be unavailable with malformed URL');
    } catch (err) {
      error = err;
    }

    // If an error was thrown, it should be a URL/network error, not a shell injection
    if (error) {
      assert.ok(
        error.message.includes('Invalid URL') || error.message.includes('timeout') || error.message.includes('ECONN'),
        `Expected URL/network error if thrown, got: ${error.message}`
      );
    }

    // Verify no arbitrary file creation occurred
    assert.ok(!fs.existsSync(PWNED_FILE), 'No /tmp/pwned file should be created');
  });

  test('SECURITY: SearxngClient does not execute shell on malicious URL', async () => {
    process.env.GSD_SEARXNG_URL = 'http://localhost:8080"; echo pwned > /tmp/pwned; #';

    delete require.cache[require.resolve('../get-stuff-done/bin/lib/searxng-client.cjs')];
    const SearxngClient = require('../get-stuff-done/bin/lib/searxng-client.cjs');

    let error = null;
    try {
      const result = await SearxngClient.check();
      // With malformed URL, the API will be unavailable
      assert.strictEqual(result.available, false, 'SearXNG should be unavailable with malformed URL');
    } catch (err) {
      error = err;
    }

    if (error) {
      assert.ok(
        error.message.includes('Invalid URL') || error.message.includes('timeout') || error.message.includes('ECONN'),
        `Expected URL/network error if thrown, got: ${error.message}`
      );
    }

    assert.ok(!fs.existsSync(PWNED_FILE), 'No /tmp/pwned file should be created');
  });

  test('SECURITY: internal-normalizer does not execute shell on malicious planning URL', async () => {
    process.env.GSD_PLANNING_URL = 'http://localhost:3011"; echo pwned > /tmp/pwned; #';

    // We need to test normalizeInternal function behavior.
    // Create a temporary directory to use as cwd
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-internal-norm-test-'));
    try {
      // Create a dummy .planning structure
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      const testFile = path.join(planningDir, 'test.md');
      fs.writeFileSync(testFile, '# Test\n\nContent');

      const normalizeInternal = require('../get-stuff-done/bin/lib/internal-normalizer.cjs').normalizeInternal;

      let threw = false;
      try {
        await normalizeInternal(tmpDir);
      } catch (err) {
        threw = true;
        // Error related to URL or network
        assert.ok(
          err.message.includes('Invalid URL') || err.message.includes('timeout') || err.message.includes('ECONN'),
          `Expected URL/network error, got: ${err.message}`
        );
      }
      // It may or may not throw depending on how the error is handled internally
      // The key assertion is no file creation
      assert.ok(!fs.existsSync(PWNED_FILE), 'No /tmp/pwned file should be created');
    } finally {
      // Cleanup
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  test('SECURITY: valid URLs still work (sanity check for positive path)', async () => {
    // This test ensures that the clients still function with valid URLs
    // It will likely fail due to connection refused (no server), but should not
    // throw due to URL parsing errors or shell injection.
    process.env.FIRECRAWL_API_URL = 'http://localhost:3002';
    process.env.GSD_SEARXNG_URL = 'http://localhost:8080';
    process.env.GSD_PLANNING_URL = 'http://localhost:3011';

    delete require.cache[require.resolve('../get-stuff-done/bin/lib/firecrawl-client.cjs')];
    const FirecrawlClient = require('../get-stuff-done/bin/lib/firecrawl-client.cjs');

    let error = null;
    try {
      const result = await FirecrawlClient.check();
      // If successful (unlikely), apiUp might be false due to connection refused
      // That's still okay; we're just checking no shell injection
    } catch (err) {
      error = err;
    }

    // If there's an error, it should be a connection/network error
    if (error) {
      const msg = error.message || '';
      assert.ok(
        msg.includes('ECONN') || msg.includes('timeout') || msg.includes('EADDRNOTAVAIL') || msg.includes('connection'),
        `Expected connection/network error, got: ${msg}`
      );
    }

    assert.ok(!fs.existsSync(PWNED_FILE), 'No /tmp/pwned file should be created');
  });
});
