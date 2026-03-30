const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// FirecrawlClient exports a singleton instance
const client = require('../get-stuff-done/bin/lib/firecrawl-client.cjs');

// ---------------------------------------------------------------------------
// crawl() tests
// ---------------------------------------------------------------------------

test('crawl: rejects with ZodError when spec is missing required sources', async () => {
  await assert.rejects(
    async () => await client.crawl({}),
    /sources/
  );
});

test('crawl: calls _request with correct parameters on valid spec', async () => {
  let capturedAction = null;
  let capturedEndpoint = null;
  let capturedBody = null;

  const originalRequest = client._request;
  client._request = async (action, endpoint, body) => {
    capturedAction = action;
    capturedEndpoint = endpoint;
    capturedBody = body;
    return { result: 'ok' };
  };

  try {
    const result = await client.crawl({
      sources: ['https://example.com', '.planning/'],
      options: {
        normalize: true,
        max_total_bytes: 1000000
      }
    });

    assert.strictEqual(capturedAction, 'crawl');
    assert.strictEqual(capturedEndpoint, 'context/crawl');
    assert.deepStrictEqual(capturedBody, {
      sources: ['https://example.com', `file://${path.resolve('.planning/')}`],
      options: {
        allowed_roots: [process.cwd()],
        normalize: true,
        max_total_bytes: 1000000
      }
    });
    assert.strictEqual(result.result, 'ok');
  } finally {
    client._request = originalRequest;
  }
});

test('crawl: accepts minimal spec with just sources', async () => {
  const originalRequest = client._request;
  client._request = async (action, endpoint, body) => {
    assert.strictEqual(action, 'crawl');
    assert.strictEqual(endpoint, 'context/crawl');
    assert.deepStrictEqual(body, {
      sources: ['file:///path'],
      options: {
        allowed_roots: [process.cwd()],
      },
    });
    return {};
  };

  try {
    await client.crawl({ sources: ['file:///path'] });
  } finally {
    client._request = originalRequest;
  }
});

test('crawl: normalizes relative internal sources to file URIs', async () => {
  const originalRequest = client._request;
  client._request = async (_action, _endpoint, body) => {
    assert.deepStrictEqual(body, {
      sources: [`file://${path.resolve('.planning/STATE.md')}`],
      options: {
        allowed_roots: [process.cwd()],
      },
    });
    return {};
  };

  try {
    await client.crawl({ sources: ['.planning/STATE.md'] });
  } finally {
    client._request = originalRequest;
  }
});

// ---------------------------------------------------------------------------
// getArtifact() tests
// ---------------------------------------------------------------------------

test('getArtifact: rejects when ID is empty string', async () => {
  await assert.rejects(
    async () => await client.getArtifact(''),
    /Invalid artifact ID/
  );
});

test('getArtifact: rejects when ID is not a string', async () => {
  await assert.rejects(
    async () => await client.getArtifact(null),
    /Invalid artifact ID/
  );
});

test('getArtifact: rejects when ID is whitespace-only', async () => {
  await assert.rejects(
    async () => await client.getArtifact('   '),
    /Invalid artifact ID/
  );
});

test('getArtifact: calls _request with correct parameters for valid ID', async () => {
  let capturedAction = null;
  let capturedEndpoint = null;
  let capturedBody = null;

  const originalRequest = client._request;
  client._request = async (action, endpoint, body) => {
    capturedAction = action;
    capturedEndpoint = endpoint;
    capturedBody = body;
    return { artifact: { id: 'abc123' } };
  };

  try {
    const result = await client.getArtifact('abc123');

    assert.strictEqual(capturedAction, 'getArtifact');
    assert.strictEqual(capturedEndpoint, 'artifacts/get');
    assert.deepStrictEqual(capturedBody, { id: 'abc123' });
    assert.strictEqual(result.artifact.id, 'abc123');
  } finally {
    client._request = originalRequest;
  }
});

test('getArtifact: returns Firecrawl response directly', async () => {
  const originalRequest = client._request;
  client._request = async () => ({
    id: 'xyz789',
    content_markdown: '# Test'
  });

  try {
    const result = await client.getArtifact('xyz789');
    assert.strictEqual(result.id, 'xyz789');
    assert.strictEqual(result.content_markdown, '# Test');
  } finally {
    client._request = originalRequest;
  }
});
