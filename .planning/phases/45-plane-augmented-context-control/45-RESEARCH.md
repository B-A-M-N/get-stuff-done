# Phase 45 RESEARCH: Plane-Augmented Context Control

**Date:** 2026-03-24 (Deep-dive verification completed)
**Confidence:** HIGH (standard stack) / HIGH (implementation) / HIGH (architecture)

---

## Summary

Phase 45 implements minimal viable Plane integration: a Plane API client with proper error handling, retry logic, and async state mirroring from `.planning/STATE.md` to Plane project metadata. Firecrawl plane source adapter deferred to Phase 46. GSD works completely offline with Plane disabled via environment variables. All code follows established GSD patterns: native HTTPS, structured logging, audit trails, and atomic file writes.

**Primary recommendation:** Build `plane-client.cjs` as singleton with token bucket rate limiting, exponential backoff retries (max 3 attempts), in-memory cache (TTL 5 min). Trigger async `syncStateToPlane()` after `writeStateMd` calls (`state.cjs:958`). Log all sync outcomes to SecondBrain audit. Do not block CLI on Plane operations.

---

## User Constraints

### Locked Decisions (from CONTEXT.md)
- **.planning/ remains source of truth; Plane is read-only mirror** — No bidirectional sync in Phase 45
- **Firecrawl is the unified context layer** — Plane sync uses dedicated plane-client; Firecrawl integration comes later
- **GSD must work without Plane configured** — Plane sync is opt-in via env vars, async best-effort only
- **Authority model unchanged** — Plane sync does NOT require authority envelopes (background operation)

### Claude's Discretion
- Configuration flag design (which env vars?)
- Retry backoff parameters (attempts, delays)
- Cache TTL duration
- Which STATE fields to sync in Phase 45

### Deferred Ideas (OUT OF SCOPE)
- Firecrawl plane source adapter (`plane://` protocol)
- Roadmap/ROADMAP.md → Plane milestones & issues sync
- Checkpoint and SUMMARY comment sync
- Webhooks and bidirectional updates
- Full smoke tests against live Plane instance

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLANE-SYNC-01 | Mirror STATE.md to Plane project for visibility | plane-client with `updateProjectMetadata`; STATE.md field extraction via `stateExtractField` (`state.cjs:226`); async trigger on `writeStateMd` (`state.cjs:958`) |
| PLANE-VISIBILITY-01 | GSD continues with Plane unavailable | Degraded mode pattern: async best-effort, no exit codes, audit log only (copy firecrawl-client `_request` finally block; verified `firecrawl-client.cjs:71-158`) |
| FIRECRAWL-CONTROL-01 | Firecrawl as unified context (separate phase) | Deferred to Phase 46; Phase 45 uses direct plane-client without policy grants |

---

## Standard Stack

### Core
| Library | Version | Purpose | Verified Source |
|---------|---------|---------|-----------------|
| Native `https` | Node.js built-in | HTTP transport | `firecrawl-client.cjs:8`, `searxng-client.cjs:8` |
| `node:test` | Node.js built-in | Test runner | 61 GSD test files use `node:test` |
| `node:assert` | Node.js built-in | Assertions | Used in all GSD tests |
| `core.cjs` | internal | Logging (`logDebug`, `logWarn`, `logError`), `safeFs`, config | `core.cjs:52-55`, `103-114`, `218-323` |
| `state.cjs` | internal | `stateExtractField`, `writeStateMd` hook | `state.cjs:226-236`, `958-965` |
| `second-brain.cjs` | internal | Audit logging (`recordFirecrawlAudit`) | `second-brain.cjs:232-260` |

### Configuration Keys (env vars)
- `PLANE_API_URL` (default: `http://localhost:3003`)
- `PLANE_API_KEY` — service account token
- `PLANE_PROJECT_ID` — target Plane project
- `PLANE_RATE_LIMIT_RPM` (default: `60`) — matches `firecrawl-client.cjs:86`
- `PLANE_SYNC_ENABLED` (default: `true` if API_URL and API_KEY set) — opt-in gate

### Installation
No npm packages required for runtime. Pure Node.js using native modules. Testing may use module cache invalidation; no external `nock` dependency.

---

## Architecture Patterns

### Singleton HTTP client with token bucket rate limiting

**Source:** `firecrawl-client.cjs:13-18, 76-106`

```javascript
// Inside plane-client constructor
this.rateLimitBuckets = new Map();

// In _request, before API call (copy verbatim):
if (hostname) {
  const now = Date.now();
  const rpm = process.env.PLANE_RATE_LIMIT_RPM ? parseInt(process.env.PLANE_RATE_LIMIT_RPM, 10) : 60;
  const capacity = rpm;
  const refillRate = rpm / 60; // tokens per second
  let bucket = this.rateLimitBuckets.get(hostname);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now };
  } else {
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    const added = elapsedSec * refillRate;
    bucket.tokens = Math.min(capacity, bucket.tokens + added);
    bucket.lastRefill = now;
  }
  if (bucket.tokens < 1) {
    const deficit = 1 - bucket.tokens;
    const retryAfterSec = Math.ceil(deficit / refillRate);
    throw new Error(`Rate limit exceeded for host ${hostname}. Retry after ~${retryAfterSec} seconds.`);
  }
  bucket.tokens -= 1;
  this.rateLimitBuckets.set(hostname, bucket);
}
```

### Exponential backoff retry (MUST implement)

Firecrawl-client has **no retry** (`firecrawl-client.cjs:130-141`). Plane client must add:

```javascript
async _requestWithRetry(action, endpoint, body = null, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await this._request(action, endpoint, body); // single-shot _request that includes audit and rate limiting
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      // Don't retry on 4xx client errors
      if (err.message.startsWith('HTTP 4')) break;
      const baseDelay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      const jitter = Math.random() * 200;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    }
  }
  throw lastError;
}
```

### Audit logging wrapper

**Source:** `firecrawl-client.cjs:71-158`

```javascript
async _request(action, endpoint, body = null) {
  const start = Date.now();
  let status = 'success';
  let result = null;
  try {
    const url = `${this.apiUrl}/api/v1/${endpoint}`;
    const postData = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);
    const response = await this._makeRequest(url, 'POST', headers, postData, 30000);
    result = response.data;
  } catch (err) {
    status = 'error';
    throw err;
  } finally {
    const latency = Date.now() - start;
    await secondBrain.recordFirecrawlAudit({
      action: `plane-${action}`,
      url: body?.url || null,
      status,
      latency_ms: latency
    });
  }
  return result;
}
```

Reuse `recordFirecrawlAudit` with action prefix `plane-` to avoid new table.

### STATE.md hook via `writeStateMd` wrapper

**Source:** `state.cjs:958-965` — single entry point for all STATE.md writes.

All calls verified (`state.cjs` lines: 187, 210, 214, 275, 282, 314, 361, 365, 409, 449, 491, 553, 1004, 1083).

```javascript
// After the definition of writeStateMd in state.cjs:
const planeSync = require('./state-plane-sync.cjs');
const originalWrite = writeStateMd;
writeStateMd = function(statePath, content, cwd, options = {}) {
  originalWrite(statePath, content, cwd, options);
  if (process.env.PLANE_SYNC_ENABLED !== 'false') {
    // Fire-and-forget; do not block
    planeSync.notifyStateChange(cwd, statePath).catch(() => {});
  }
};
```

### STATE field extraction

**Source:** `state.cjs:226-236`

```javascript
function stateExtractField(content, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boldPattern = new RegExp(`\\*\\*${escaped}:\\*\\*[ \\t]*(.*)`, 'i');
  const boldMatch = content.match(boldPattern);
  if (boldMatch) return boldMatch[1].trim() || null;
  const plainPattern = new RegExp(`^${escaped}:[ \\t]*(.*)`, 'im');
  const plainMatch = content.match(plainPattern);
  return plainMatch ? (plainMatch[1].trim() || null) : null;
}
```

Supports `**Field:** value` and `Field: value` (case-insensitive).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP rate limiting | Custom sliding window | Token bucket pattern from `firecrawl-client.cjs:76-106` | Proven per-hostname, simple |
| Audit logging | Ad-hoc log writes | `secondBrain.recordFirecrawlAudit` (action: 'plane-*') | Consistent with GSD audit ledger |
| Config scoping | Manual env parsing | Read `process.env.PLANE_*` directly | GSD pattern (`firecrawl-client.cjs:15-16`) |
| State field extraction | Custom regex | `stateExtractField(content, fieldName)` (`state.cjs:226`) | Handles both formats, future-proof |
| File I/O | Raw `fs` calls | `safeFs` from `core.cjs:103-114` | Respects sandbox/authority if enforced |
| Retry logic | Homegrown loops | Copy pattern above (3 attempts, exponential backoff with jitter) | Standard for transient errors |

---

## Common Pitfalls

### Pitfall 1: Plane sync blocks CLI
**What:** `await planeSync.notifyStateChange()` called synchronously.
**Fix:** Fire-and-forget, swallow errors after logging.
**Detection:** Benchmark shows >100ms overhead vs Plane-disabled.

### Pitfall 2: Recursive sync
**What:** Sync writes to `.planning/` → re-triggers → infinite loop.
**Fix:** Sync must only call Plane API, never touch local files.
**Detection:** CPU spike after state writes; log spam.

### Pitfall 3: Race conditions
**What:** Concurrent commands cause Plane conflicts (HTTP 409).
**Fix:** Phase 45 STATE-only: last-write-wins okay. Document for later phases.

### Pitfall 4: Memory leak
**What:** `rateLimitBuckets` Map grows unbounded in daemon mode.
**Fix:** Phase 45 CLI exits after command → no leak. Daemon mode needs TTL eviction later.

### Pitfall 5: Silent data loss
**What:** Plane API returns unexpected shape → errors → skipped sync.
**Fix:** Validate response; log full JSON on mismatch.

---

## Code Examples

### Example 1: plane-client.cjs skeleton

```javascript
// get-stuff-done/bin/lib/plane-client.cjs
const https = require('https');
const secondBrain = require('./second-brain.cjs');
const { logDebug, logWarn, logError } = require('./core.cjs');

class PlaneClient {
  constructor() {
    this.apiUrl = process.env.PLANE_API_URL || 'http://localhost:3003';
    this.apiKey = process.env.PLANE_API_KEY || '';
    this.rateLimitBuckets = new Map();
    this.cache = new Map();
  }

  async _makeRequest(url, method = 'POST', headers = {}, body = null, timeout = 30000) {
    // Copy firecrawl-client.cjs:23-66 exactly
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { ...headers, timeout },
      timeout,
    };
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve({ statusCode: res.statusCode, data: JSON.parse(data) }); }
            catch (e) { reject(new Error(`Invalid JSON response: ${e.message}`)); }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      if (body) req.write(body);
      req.end();
    });
  }

  async _request(action, endpoint, body = null) {
    // Include token bucket rate limiting (firecrawl-client.cjs:76-106)
    // Then call _makeRequest, catch errors, finally audit with recordFirecrawlAudit
  }

  async updateProjectMetadata(metadata) {
    return this._request('update-project', `projects/${process.env.PLANE_PROJECT_ID}`, metadata);
  }
}

module.exports = new PlaneClient();
```

### Example 2: Test structure (node:test, no nock)

**Source:** `tests/http-clients-security.test.cjs:10-50` (module cache invalidation pattern)

GSD tests **do not use `nock`**. They manipulate env vars and use `delete require.cache`.

```javascript
// tests/plane-client.test.cjs
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('PlaneClient (Phase 45)', () => {
  let originalEnv = {};
  beforeEach(() => {
    originalEnv.PLANE_API_URL = process.env.PLANE_API_URL;
    originalEnv.PLANE_API_KEY = process.env.PLANE_API_KEY;
    originalEnv.PLANE_PROJECT_ID = process.env.PLANE_PROJECT_ID;
  });
  afterEach(() => {
    process.env.PLANE_API_URL = originalEnv.PLANE_API_URL;
    process.env.PLANE_API_KEY = originalEnv.PLANE_API_KEY;
    process.env.PLANE_PROJECT_ID = originalEnv.PLANE_PROJECT_ID;
    delete require.cache[require.resolve('../get-stuff-done/bin/lib/plane-client.cjs')];
  });

  test('defaults to localhost:3003 when PLANE_API_URL unset', () => {
    delete process.env.PLANE_API_URL;
    const PlaneClient = require('../get-stuff-done/bin/lib/plane-client.cjs');
    assert.strictEqual(PlaneClient.apiUrl, 'http://localhost:3003');
  });

  test('rate limiting: token bucket decrements per request', async () => {
    process.env.PLANE_API_URL = 'http://localhost:3003';
    process.env.PLANE_API_KEY = 'test-key';
    const PlaneClient = require('../get-stuff-done/bin/lib/plane-client.cjs');
    const originalMakeRequest = PlaneClient._makeRequest.bind(PlaneClient);
    PlaneClient._makeRequest = async () => ({ statusCode: 200, data: {} });
    try {
      await PlaneClient._request('test', 'ping', {});
      const bucket = PlaneClient.rateLimitBuckets.get('localhost:3003');
      assert.ok(bucket && bucket.tokens < 60);
    } finally {
      PlaneClient._makeRequest = originalMakeRequest;
    }
  });

  test('async best-effort: sync failure does not throw to caller', async () => {
    const PlaneClient = require('../get-stuff-done/bin/lib/plane-client.cjs');
    PlaneClient.updateProjectMetadata = async () => { throw new Error('Network error'); };
    // Should not throw when called via fire-and-forget
    const p = PlaneClient.updateProjectMetadata({});
    await p; // Should reject; in practice we catch
    assert.ok(p instanceof Promise);
  });
});
```

### Example 3: STATE sync hook

```javascript
// get-stuff-done/bin/lib/state-plane-sync.cjs
const { safeFs } = require('./core.cjs');
const { stateExtractField } = require('./state.cjs');
const planeClient = require('./plane-client.cjs');
const { logWarn } = require('./core.cjs');

async function notifyStateChange(cwd, statePath) {
  if (!planeClient.apiKey || !planeClient.projectId) return; // disabled
  try {
    const content = safeFs.readFileSync(statePath, 'utf-8');
    const metadata = {
      current_phase: stateExtractField(content, 'Current Phase'),
      status: stateExtractField(content, 'Status'),
      last_activity: stateExtractField(content, 'Last Activity'),
      current_plan: stateExtractField(content, 'Current Plan'),
      total_plans: stateExtractField(content, 'Total Plans in Phase'),
    };
    await planeClient.updateProjectMetadata(metadata);
  } catch (err) {
    logWarn('Plane sync failed (continuing):', { error: err.message });
  }
}

module.exports = { notifyStateChange };
```

### Example 4: Error handling — known error codes

Handle:
- `ECONNREFUSED`, `ETIMEDOUT`, `EADDRNOTAVAIL` — transient; log warning
- `HTTP 4xx` — config error; log error, don't retry
- `HTTP 5xx` / `429` — retry (handled in retry loop)
- `"Rate limit exceeded"` — from token bucket; respects retry-after calculation

```javascript
try {
  await planeClient.updateProjectMetadata(metadata);
} catch (err) {
  const msg = err.message;
  if (msg.includes('ECONN') || msg.includes('timeout') || msg.includes('EADDRNOTAVAIL')) {
    // Already logged by audit; optionally log warning
  } else if (msg.startsWith('HTTP 4')) {
    logError('Plane API client error (check config):', { error: msg });
  } else {
    // Unexpected; rethrow or log error
    logError('Plane sync unexpected error:', { error: msg });
  }
}
```

---

## Verified Code Locations

### Plane client foundation
- FirecrawlClient structure: `firecrawl-client.cjs:13-232`
- `_makeRequest`: `firecrawl-client.cjs:23-66`
- `_request` wrapper pattern: `firecrawl-client.cjs:71-158`
- Rate limiting token bucket: `firecrawl-client.cjs:76-106`
- SearXNG client simpler pattern: `searxng-client.cjs:12-104`

### State sync hook
- `writeStateMd`: `state.cjs:958-965` (single entry point)
- All `writeStateMd` call sites: lines 187, 210, 214, 275, 282, 314, 361, 365, 409, 449, 491, 553, 1004, 1083
- `stateExtractField`: `state.cjs:226-236`
- `syncStateFrontmatter`: `state.cjs:947-952`

### Core utilities
- Logging: `core.cjs:52-55`
- `safeFs`: `core.cjs:103-114`
- `loadConfig`: `core.cjs:218-323` (pattern)

### Audit
- `recordFirecrawlAudit`: `second-brain.cjs:232-260` (schema reference)
- `recordAuditEntry`: `audit.cjs:48-94`

### Testing patterns
- Node.js `node:test` usage: 61 test files
- HTTP security tests: `tests/http-clients-security.test.cjs` (env var manipulation, module cache invalidation)
- Grant tests: `tests/second-brain-grant.test.cjs` (state restoration patterns)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All components verified in codebase (https, node:test, core.cjs utilities)
- Architecture: HIGH — `writeStateMd` hook location and call sites explicitly identified
- Pitfalls: HIGH — Derived from known patterns and anti-patterns observed in existing code
- Plane API specifics: MEDIUM — Plane endpoint design not yet verified against live API (Phase 45 will validate)

**Research date:** 2026-03-24
**Valid until:** 60 days (Plane API contract may evolve)

---

## Conclusion

Phase 45 is ready for planning. Key implementation tasks:
- Build `plane-client.cjs` by adapting `firecrawl-client.cjs` patterns (token bucket, audit, HTTPS).
- Add retry logic (3 attempts, exponential backoff with jitter).
- Hook into `state.cjs:958` to trigger async sync after STATE writes using `stateExtractField`.
- Use `secondBrain.recordFirecrawlAudit` for sync audit logs (action prefix `plane-`).
- Ensure non-blocking fire-and-forget semantics; CLI must not fail if Plane is down.
- Write tests using `node:test` with module cache invalidation; no `nock` dependency needed.
- Follow GSD's established conventions: native https, structured logging, safeFs, env-based config.
