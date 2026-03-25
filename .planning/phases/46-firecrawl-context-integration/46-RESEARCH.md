# Phase 46: Firecrawl Context Integration - Research

**Researched:** 2026-03-24
**Domain:** Context retrieval unification, Firecrawl API design, policy enforcement integration
**Confidence:** HIGH (architecture) / MEDIUM (implementation details) / HIGH (migration strategy)

## Summary

Phase 46 implements a unified context retrieval layer where all GSD agents call Firecrawl's `crawl(spec)` API instead of directly reading files or making separate WebSearch/WebFetch calls. The Firecrawl service (localhost:3002) will gain a new `POST /v1/context/crawl` endpoint that accepts a specification of multiple sources (local files via `file://`, external URLs via `https://`, and future `plane://` URIs), fetches from each source using dedicated adapters, normalizes content into ContextArtifact objects, applies policy grants and audit logging, and returns aggregated results.

**Primary recommendation:** Extend `firecrawl-client.cjs` with `async crawl(spec)` and `async getArtifact(id)` methods. Implement source adapter registry pattern in Firecrawl service to plug in handlers for `file://` (via Planning Server), `https://` (via existing scraper), and `plane://` (stub for Phase 47). Update all researcher and planner agents to construct a unified spec and call `crawl()` exclusively. Maintain fallback to planning-server `/v1/read` and Read tool only if Firecrawl is unavailable.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing Firecrawl service | localhost:3002 | Centralized control plane for all context | Already implements policy, audit, rate limiting; we extend with crawl endpoint |
| firecrawl-client.cjs | current (as of 2026-03-24) | Node.js client for Firecrawl API | Used by all agents; singleton instance with grant caching |
| Planning Server | localhost:3011 | Serves `.planning/` files with auth | Existing internal file server with rate limits; acts as source for `file://` adapter |
| ContextArtifact schema | v1 (current) | Canonical normalized artifact format | firecrawl-normalizer.cjs already validates; reuse for all sources |
| policy-grant-cache.cjs | current | 60s TTL in-memory grant cache | PERFORMANCE-01 requirement; prevents policy check latency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | current | Schema validation for crawl spec | Validate spec before sending to Firecrawl |
| second-brain.cjs | current | Grant persistence and audit | Policy checks and audit logging for all sources |
| plane-client.cjs | Phase 45 implementation | Plane API client (source for plane://) | Used by plane source adapter in Phase 47; stub in Phase 46 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Unified `crawl` API | Keep current ad-hoc pattern (planning server + Firecrawl MCP) | Simpler short-term but inconsistent, model does assembly, no cross-source filters |
| Source adapter registry | Hardcoded switch in Firecrawl | Registry allows easy addition of new sources (plane://, git://, etc.) without modifying core |
| Client-side spec assembly | Let Firecrawl discover sources | Client knows context needs; Firecrawl should be transport, not decision engine |

**Installation:**
No new npm packages. Extend existing modules:
- Add `crawl()` method to `firecrawl-client.cjs`
- Add source adapters to Firecrawl service (controlled by this project, likely in same codebase as firecrawl-server if it exists under `get-stuff-done/` or as separate process)
- Update agent instructions (`.md` files) to use unified pattern

**Version verification:**
```bash
# Verify current versions (no changes yet)
node -e "console.log(require('./get-stuff-done/bin/lib/package.json').version)"
# No new dependencies introduced
```

## Architecture Patterns

### Recommended Project Structure
```
get-stuff-done/
├── bin/
│   ├── lib/
│   │   ├── firecrawl-client.cjs       # Add: crawl(spec), getArtifact(id)
│   │   ├── firecrawl-normalizer.cjs   # Already normalizes external scrape
│   │   ├── internal-normalizer.cjs    # For file:// sources via planning server
│   │   ├── context-schema.cjs         # Zod schema for crawl spec (new)
│   │   └── source-adapters/           # New: registry of source handlers
│   │       ├── file-adapter.cjs       # Handles file:// via planning server
│   │       ├── http-adapter.cjs       # Handles https:// via Firecrawl scraper
│   │       └── plane-adapter.stub.cjs # Stub for Phase 47 (returns not-implemented)
├── .planning/
└── agents/
    ├── gsd-planner.md                 # Update: use crawl() instead of separate calls
    ├── gsd-phase-researcher.md        # Update: use crawl()
    ├── gsd-project-researcher.md      # Update: use crawl()
    └── ... (all agents that load context)
```

### Pattern 1: Unified Context Specification

**What:** A single JSON object describing all desired context sources, filters, and normalization options. Replaces multiple independent fetches.

**When to use:** Anytime an agent needs to load project context (initialization, research, planning, verification).

**Spec format:**
```json
{
  "sources": [
    "file://.planning/STATE.md",
    "file://.planning/ROADMAP.md",
    "file://.planning/research/*.md",
    "https://docs.example.com/api/rest",
    "plane://project/issues?phase=23"
  ],
  "options": {
    "extract_schema": null,
    "filter_globs": ["*.md", "*.ts"],
    "max_total_bytes": 10485760,
    "timeout_ms": 30000,
    "normalize": true
  }
}
```

**Source URI schemes:**
- `file://<path>`: Local filesystem path (absolute or relative to cwd). Handled by file adapter using Planning Server `/v1/read` or direct fs.read (with policy grant check).
- `https://<url>` or `http://<url>`: External web resources. Handled by HTTP adapter using existing Firecrawl scraper.
- `plane://<resource>`: Plane API resources (Phase 47). Stub returns "Not implemented" with helpful message.
- `.planning/...` (relative path without scheme): Interpreted as `file://` implicitly during spec pre-processing in agent.

**Example:**
```typescript
// In agent workflow (pseudocode)
const spec = {
  sources: [
    ".planning/STATE.md",
    ".planning/ROADMAP.md",
    ".planning/research/45-RESEARCH.md",
    "https://developer.example.com/docs/latest"
  ],
  options: { normalize: true }
};
const result = await firecrawl_client.crawl(spec);
// result.artifacts is array of ContextArtifact objects
```

**Source:** Phase 45 RESEARCH.md (lines 272-300) proposed this pattern; Phase 46 implements it.

### Pattern 2: Source Adapter Registry

**What:** Firecrawl service maintains a registry mapping URI schemes to handler functions. The `crawl` endpoint iterates through spec sources, dispatches to appropriate adapter, aggregates results.

**When to use:** Inside Firecrawl service implementation. Allows extensibility without modifying core dispatch logic.

**Adapter interface:**
```javascript
// Each adapter implements:
{
  scheme: 'file', // or 'https', 'plane', etc.
  canHandle(uri) { return uri.startsWith('file://') },
  async fetch(uri, options) {
    // Return normalized ContextArtifact or throw
  }
}
```

**Registry:**
```javascript
const adapters = [fileAdapter, httpAdapter, planeAdapterStub];
for (const source of spec.sources) {
  const adapter = adapters.find(a => a.canHandle(source));
  if (!adapter) throw new Error(`Unsupported source scheme: ${source}`);
  const artifact = await adapter.fetch(source, spec.options);
  results.push(artifact);
}
```

**Why registry:** Clean separation; Phase 47 just adds `planeAdapter` without touching `crawl` endpoint.

### Anti-Patterns to Avoid

- **Monolithic `crawl` method:** Don't bake all source logic into one huge function. Use adapter pattern for maintainability.
- **Client-side parallel fetching:** Don't have agent call Firecrawl multiple times in parallel for different sources. Use single `crawl(spec)` call to let Firecrawl batch and enforce global policy.
- **Schema drift:** Don't let different adapters return different artifact shapes. All must conform to `ContextArtifactSchema`.
- **Silent failures:** If one source fails, don't drop it silently. Return partial success with error details in artifact metadata.
- **Hardcoded TTLs:** Don't bake cache TTLs into Firecrawl; make configurable via env vars (like `FIRECRAWL_CACHE_TTL_SECONDS`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Source-type dispatch logic | Custom switch-case in `crawl` | Adapter registry | Extensible; new sources plug in without core changes |
| Policy grant matching | Custom glob matcher | `secondBrain.checkGrant()` already handles scheme-agnostic pattern matching | Consistency; grants already stored in second brain; reuse |
| Content normalization per source | Per-adapter normalizer | `firecrawl-normalizer.cjs` for external, `internal-normalizer.cjs` (new) for files | Centralized MD normalization and AST parsing |
| Rate limiting | Per-source limiter | Firecrawl client already does rate limiting (token bucket) in `_request` | Proven implementation; just extend to `crawl` |
| Audit logging | Manual log writes | `secondBrain.recordFirecrawlAudit()` called automatically from client `_request` | Centralized audit; already integrated |
| Retry logic | Manual retry loops | Firecrawl client's `_request` has exponential backoff (3 attempts) | Already implemented; reuse for all API calls |

**Key insight:** Firecrawl already provides policy enforcement, audit, rate limiting, and retry via `firecrawl-client.cjs`. The `crawl` API should reuse this existing infrastructure instead of reimplementing. Build only the source adapter layer and spec parser.

## Common Pitfalls

### Pitfall 1: Cache Invalidation Complexity

**What goes wrong:** Content cache (separate from policy grant cache) becomes stale when source files change. Agents get outdated context without realizing.

**Why it happens:** Firecrawl caches normalized artifacts for performance, but `.planning/` files update frequently during execution. No mechanism to invalidate cache on file change or Plane webhook.

**How to avoid:**
- Include `If-Modified-Since` or ETag checks when fetching from file:// and https:// sources.
- For local files: compare file mtime with cache entry timestamp; skip cache if file newer.
- For external URLs: respect HTTP cache headers (ETag, Last-Modified).
- For Plane (Phase 47): invalidate on webhook event.
- Provide `cache: false` option in spec to bypass cache for fresh reads.
- Document cache TTL default (e.g., 60s for external, 5s for local files) and make configurable.

**Warning signs:** Agents consistently reading stale STATE.md or ROADMAP.md; testing shows updates not reflected for >1 minute.

### Pitfall 2: Policy Grant Gaps for Custom Schemes

**What goes wrong:** Agent attempts to fetch `file://secret.txt` or `plane://admin/delete` and it succeeds even though no grant exists because policy matcher doesn't recognize the scheme.

**Why it happens:** `secondBrain.checkGrant()` uses URL-aware matching for resources with `://` and fallback string matching. Custom schemes may bypass proper host/path checks if pattern is `file://*` and resource is `file:///etc/passwd`.

**How to avoid:**
- Ensure `checkGrant()` handles custom schemes robustly: it should parse `scheme://path` and check scheme+path prefix correctly.
- Add explicit test cases for `file://`, `plane://` patterns.
- Default policy: deny all unless explicitly granted. Firecrawl should call `checkAccessGrant(uri)` before every fetch.
- Document grant patterns: `file://**` vs `file://.planning/**` vs `plane://project/**`.

**Warning signs:** Security audit shows access to sensitive paths without corresponding grants.

### Pitfall 3: Agent Fallback Confusion

**What goes wrong:** Firecrawl is down; agents fall back to old patterns inconsistently—some use Read tool, some use curl to planning server, leading to audit gaps and permission bypasses.

**Why it happens:** Mixed fallback strategies in different agent .md files. No centralized way to check Firecrawl availability and switch modes.

**How to avoid:**
- Define a single fallback strategy in the agent tool documentation:
  1. Check `firecrawl_client.check()` (already exists) to see if Firecrawl + Planning Server are up.
  2. If up: use `crawl(spec)` exclusively.
  3. If down: declare "Firecrawl unavailable" and STOP. Do not attempt ad-hoc reads.
- Actually, for Phase 46 we may want degraded mode: fall back to planning-server `/v1/read` for `file://` sources and WebSearch for `https://`. But this bypasses policy grants. Need to decide.
- If allowing fallback, ensure fallback path still enforces some policy (e.g., planning server auth token) and is audited.

**Warning signs:** Agents working during Firecrawl outage but audit logs missing; policy grants not applied.

### Pitfall 4: Spec Over-fetching and Performance

**What goes wrong:** Agent requests 100 sources in one spec, causing Firecrawl to fetch everything sequentially, exceeding 30s timeout and blowing context budget.

**Why it happens:** No per-agent or per-phase limits on source count. Agents may be over-eager to load all context.

**How to avoid:**
- Enforce a hard limit: `max_sources_per_spec = 20` configurable via env.
- Encourage agents to use globs (`file://.planning/research/*.md`) instead of enumerating individual files.
- Firecrawl should fetch in parallel (up to concurrency limit, e.g., 5 at a time) to reduce total latency.
- Cache results aggressively; use `Cache-Control` headers in response so agents can reuse for subsequent calls.
- Provide feedback to agents: include `warning: "spec contained 50 sources, exceeded limit of 20, truncated"` in response.

**Warning signs:** `crawl` calls regularly taking >10s; agents timing out; context budget exceeded.

### Pitfall 5: Relative Path Resolution Ambiguity

**What goes wrong:** Agent sends spec with `"file://src/components/Button.tsx"`. Is that relative to cwd or to planning dir? Firecrawl interprets differently than agent intended.

**Why it happens:** `file://` URIs with relative paths are ambiguous. Different adapters may resolve against different base directories.

**How to avoid:**
- Rule: All `file://` URIs must be absolute paths (starting with `/` or drive letter). If agent wants a path relative to cwd, it must resolve before constructing spec.
- Alternatively: define that relative paths are relative to the current working directory of the Firecrawl process (which is project root). Document this clearly.
- Better: disallow relative paths entirely. Agent should call `realpath()` or use `path.resolve()` before constructing URI.
- In Firecrawl, validate that `file://` URIs are within allowed base directories (e.g., project root and subdirectories only). Reject `file:///etc/` or `file://../../` escapes.

**Warning signs:** File-not-found errors for paths that exist; security alerts about path traversal attempts.

## Code Examples

### Unified context spec usage in agent (to be added to agent documentation)

```bash
# Researcher agent initialization pattern
FC=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" firecrawl check 2>/dev/null)
FIRECRAWL_UP=$(echo "$FC" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.available?'yes':'no')}catch{process.stdout.write('no')}")

if [[ "$FIRECRAWL_UP" != "yes" ]]; then
  echo "Firecrawl unavailable. Cannot load context. Please start Firecrawl service."
  exit 1
fi

# Build unified spec
SPEC=$(node -e "
const spec = {
  sources: [
    '.planning/STATE.md',
    '.planning/ROADMAP.md',
    '.planning/research/45-RESEARCH.md',
    'https://developer.example.com/docs/authentication'
  ],
  options: { normalize: true, max_total_bytes: 10485760 }
};
process.stdout.write(JSON.stringify(spec));
")

# Call Firecrawl crawl via MCP tool (or via curl if not using MCP)
# Using MCP: firecrawl_extract with special endpoint? Actually MCP may need new method.
# For now, design curl interface:
RESPONSE=$(curl -s -X POST http://localhost:3002/v1/context/crawl \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SPEC")

# Parse response
ARTIFACTS=$(echo "$RESPONSE" | node -e "JSON.parse(require('fs').readFileSync(0,'utf8')).artifacts.forEach(a=>console.log(a.source_uri, a.title || '(no title)'))")
echo "Loaded artifacts:"
echo "$ARTIFACTS"
```

**Source:** This pattern combines existing `firecrawl check` with new `POST /v1/context/crawl` endpoint. Agent .md files will be updated to replace multiple individual fetch steps with this unified block.

### Firecrawl client: adding `crawl()` method

```javascript
// In firecrawl-client.cjs
class FirecrawlClient {
  // ... existing methods ...

  /**
   * Unified context crawl: fetch from multiple sources with a spec.
   * @param {Object} spec - { sources: [...], options?: { normalize?, max_total_bytes? } }
   * @returns {Promise<{artifacts: ContextArtifact[], errors: [], metadata}}>
   */
  async crawl(spec) {
    // Validate spec shape
    if (!spec || !Array.isArray(spec.sources)) {
      throw new Error('Invalid spec: sources array required');
    }

    // Call Firecrawl service
    return this._request('crawl', 'context/crawl', spec);
  }

  /**
   * Retrieve a previously cached artifact by ID.
   * @param {string} id - Artifact ID from ContextArtifact.id
   * @returns {Promise<ContextArtifact>}
   */
  async getArtifact(id) {
    // GET /v1/artifacts/:id or POST /v1/artifacts/get with { id }
    return this._request('getArtifact', `artifacts/${id}`, { id });
    // Note: _request is POST; if endpoint needs GET, adjust accordingly
  }
}

module.exports = new FirecrawlClient();
```

**Source:** Extends existing `_request` pattern with policy+audit. `getArtifact` allows agents to fetch a specific artifact by ID if they have it from previous crawl.

### Firecrawl service: file adapter skeleton (inside Firecrawl server code)

```javascript
// In firecrawl-service/lib/source-adapters/file-adapter.cjs
const https = require('https'); // if using planning server over HTTP
const { ContextArtifactSchema } = require('../artifact-schema');
const { normalizeMd } = require('../core');

async function fetchFileUri(uri, options) {
  // Convert file:// URI to local path
  let filePath = decodeURIComponent(uri.replace('file://', ''));
  if (!path.isAbsolute(filePath)) {
    filePath = path.join(process.cwd(), filePath);
  }

  // Security: ensure path is within allowed roots
  const allowedRoots = [process.cwd(), '/tmp']; // configurable
  const resolved = path.resolve(filePath);
  if (!allowedRoots.some(root => resolved.startsWith(root))) {
    throw new Error(`Access denied: path outside allowed roots`);
  }

  // Read file (option A) or call planning server (option B)
  // Option A - direct read (simpler for Phase 46, but bypasses planning server auth):
  // const content = fs.readFileSync(resolved, 'utf-8');
  // Option B (preferred): call planning server /v1/read to get audit + policy
  const planningUrl = `http://localhost:3011/v1/read?path=${encodeURIComponent(resolved)}`;
  const resp = await fetch(planningUrl);
  if (!resp.ok) throw new Error(`Failed to read file: ${resp.statusText}`);
  const { data } = await resp.json(); // assume planning server returns { content, metadata }

  // Normalize
  const normalized = normalizeMd(data.content);
  const contentHash = crypto.createHash('sha256').update(normalized).digest('hex');

  return {
    id: `file:${resolved}:${contentHash.substring(0, 16)}`,
    source_uri: uri,
    title: path.basename(resolved),
    type: 'internal',
    content_markdown: normalized,
    content_hash: contentHash,
    normalized_at: new Date().toISOString(),
    provenance: { producer: 'file-adapter', producer_version: '1.0', parameters_hash: null },
    is_sanctioned: true
  };
}

module.exports = {
  scheme: 'file',
  canHandle: uri => uri.startsWith('file://'),
  fetch: fetchFileUri
};
```

**Note:** The planning server `/v1/read` endpoint must be used to ensure audit logging and policy. The adapter will call that internally.

**Source:** Based on existing `firecrawl-normalizer.cjs` pattern and planning-server architecture (lines 1-200 of planning-server.cjs). The `ContextArtifactSchema` is defined in `artifact-schema.cjs`.

## Validation Architecture

Skip this section if workflow.nyquist_validation is explicitly false in .planning/config.json. The key is true, so include.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js test suite (existing: Jest or custom) |
| Config file | `tests/firecrawl-crawl.test.cjs` (new) |
| Quick run command | `npm test -- tests/firecrawl-crawl.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

The phase requirements aren't explicitly listed in CONTEXT.md, but implied:
- All researcher and planning agents call Firecrawl for context
- Firecrawl applies normalization, policy, audit
- Performance <2s with cache

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CRAWL-01 | `firecrawl_client.crawl(spec)` returns ContextArtifact array | unit | `npm test -- tests/firecrawl-client.crawl.test.js` | ❌ Wave 0 |
| CRAWL-02 | `file://` adapter fetches via planning server | integration | `npm test -- tests/source-adapters/file-adapter.test.js` | ❌ Wave 0 |
| CRAWL-03 | `https://` adapter uses existing scraper | unit (mock) | `npm test -- tests/source-adapters/http-adapter.test.js` | ❌ Wave 0 |
| CRAWL-04 | Policy grant enforced before each fetch | unit | `npm test -- tests/policy-grant-crawl.test.js` | ❌ Wave 0 |
| CRAWL-05 | Spec with 10 sources completes <2s (with cache) | performance | `npm test -- tests/performance/crawl-benchmark.test.js` | ❌ Wave 0 |
| CRAWL-06 | Agent fallback when Firecrawl down | integration | `npm test -- tests/fallback.test.js` | ❌ Wave 0 |
| CRAWL-07 | ContextArtifact schema validated for all adapters | unit | `npm test -- tests/artifact-schema-cross-adapter.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- tests/firecrawl-crawl.test.cjs` (fast unit suite)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/firecrawl-client.crawl.test.js` — tests spec validation, API dispatch, response parsing
- [ ] `tests/source-adapters/file-adapter.test.js` — integration test with test planning server
- [ ] `tests/source-adapters/http-adapter.test.js` — mock Firecrawl scraper response
- [ ] `tests/policy-grant-crawl.test.js` — verify grant check called for each source URI
- [ ] `tests/performance/crawl-benchmark.test.js` — measure latency with cache warm vs cold
- [ ] `tests/fallback.test.js` — agent fallback behavior when Firecrawl unreachable
- [ ] `tests/artifact-schema-cross-adapter.test.js` — ensure all adapter outputs conform

*(If tests already exist: "None — existing test infrastructure covers all phase requirements")*

## Open Questions

1. **Firecrawl service implementation location:** Where does the `POST /v1/context/crawl` endpoint live? Is there an existing server code in this repo (`get-stuff-done/firecrawl-server/`) or is it an external binary? We need to locate the Firecrawl service code to add adapters.
   - What we know: `firecrawl-client.cjs` talks to `localhost:3002`. That service is probably a separate process (maybe from `mnt/firecrawl` or Docker). Research needed to find if we control its source.
   - Recommendation: Check for `firecrawl-server` directory or `docker-compose.yml` starting a firecrawl container. If we don't control it, may need to implement a local proxy that adds the crawl endpoint.

2. **Caching strategy details:** Should Firecrawl cache individual source fetches (per-URI) or whole-spec results? Likely per-URI with composite response. Need to decide TTL per source type: external URLs (60s), local files (5s), plane (30s)? Should be configurable.
   - What we know: There's already a policy grant cache with 60s TTL (PERFORMANCE-01). We can add a separate content cache.

3. **Fallback behavior design:** Phase 46 says "Update GSD agents to use Firecrawl's crawl API". Does this mean all-or-nothing, or should we provide a degraded mode if Firecrawl is down? The existing agent patterns have a gate: if Firecrawl down, STOP. But that might be too harsh. Need user input: should agents be operable offline with reduced audit?
   - Options: (a) fail hard, (b) fallback to planning-server only for file sources and WebSearch for external, (c) use cached artifacts from previous runs.

4. **Concurrent access to Planning Server:** The file adapter will call planning server `/v1/read` for every `file://` source. But Planning Server already has its own rate limiting (120 RPM by default). If agents request dozens of files, we might exceed. Need to decide: should file adapter batch requests? Or should we allow direct fs reads in degraded mode?
   - Recommendation: File adapter should use Planning Server to maintain audit. Batch multiple files into one request? Planning server currently one-file-per-request. We can increase rate limit or add bulk endpoint in Phase 46.

5. **Plane source adapter stub:** What should `plane://` return in Phase 46? A clear error message "Plane source adapter not available until Phase 47" or just treat as unsupported scheme? We need to implement a stub that returns an error artifact so agents get a graceful failure with guidance.

6. **Metrics and observability:** The success criteria includes performance <2s. How do we measure and expose metrics? Through existing second-brain metrics? Need to add crawl latency histogram, source count, cache hit rate.
   - Existing: `secondBrain.recordFirecrawlAudit()` logs each request. We can add metrics there.

7. **Interaction with Phase 45 Plane sync:** Phase 45 implemented plane-client.cjs and state-plane-sync.cjs. The plane source adapter in Phase 47 will use that client to fetch from Plane API. Does the file adapter need to use planning-server or could it use direct reads? It must use planning-server to keep audit trail. Ensure file adapter respects Planning Server auth token (PLANNING_SERVER_TOKEN) when calling `/v1/read`.

8. **Relative path handling in spec:** Should agents be allowed to send `.planning/STATE.md` without `file://`? The spec parser could prepend `file://` automatically for paths that don't have a scheme. But what about paths like `docs/README.md`? Clearly a file. We can define: any source that doesn't match `://` and doesn't start with `http://` or `https://` is treated as a file path (with `file://` implied). This keeps the spec concise.

9. **Error aggregation in response:** When one source fails (e.g., file not found), should the whole crawl fail or return partial results? Agents need to know which sources succeeded. Proposal: return `{ artifacts: [...], errors: [{source: "...", message: "...", recoverable: true/false}] }`. Agent can decide whether to halt or continue based on presence of non-recoverable errors.

10. **Cache key design:** For content cache, key should be (uri, options) combination. If same URI appears in multiple specs with different options (e.g., different `max_total_bytes`), should we share cache? Probably ignore options for cache key except maybe normalization flag. Documentation needed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Agents use WebFetch (raw HTML) and WebSearch (unstructured) | Firecrawl MCP tools (scrape → clean markdown, extract → structured) | Phase 28-29 | Better context quality, reduced model parsing work |
| Agents read planning files via Read tool directly | Planning Server `/v1/extract` for structured, Read only for .planning/* | Phase 27-28 | Audit trail, policy enforcement for internal files |
| Each agent assembles context with multiple calls to different services | Unified `crawl(spec)` single call | Phase 46 (this doc) | Consistent policy, simpler agent code, cross-source filtering |
| Policy grants checked per-request inline | Grant cache with 60s TTL | Phase 29 (PERFORMANCE-01) | Reduced policy check latency |
| Context sources only external URLs | Multi-source: local files, external URLs, Plane API | Phase 46-47 | Single source of truth for all context |

**Deprecated/outdated:**
- Direct filesystem reads by agents (`fs.readFile`, `cat`) for project source files (not `.planning/*`). Must go through Firecrawl or Planning Server.
- Ad-hoc Firecrawl usage: agents calling `firecrawl_scrape` individually per URL. Replaced by batch `crawl`.
- Separate handling for internal vs external context in agent prompts. Unified spec.

## Sources

### Primary (HIGH confidence)
- `get-stuff-done/bin/lib/firecrawl-client.cjs` — existing methods: scrape, search, extract, map, check; policy grant integration (lines 1-232)
- `get-stuff-done/bin/lib/firecrawl-normalizer.cjs` — normalization into ContextArtifact (lines 1-80)
- `get-stuff-done/bin/lib/planning-server.cjs` — internal file serving with auth (lines 1-200)
- `get-stuff-done/bin/lib/artifact-schema.cjs` — ContextArtifact validation
- `get-stuff-done/bin/lib/policy.cjs` and `policy-grant-cache.cjs` — grant checking and caching
- `get-stuff-done/bin/lib/context.cjs` — example of spec-based context building (for execution snapshots)
- `agents/gsd-planner.md` — agent context loading patterns (lines 37-56, 127-164)
- `agents/gsd-phase-researcher.md` — research agent patterns and Firecrawl gate (lines 30-48, 121-161)
- `agents/gsd-executor.md` — executor's use of planning server (lines 42-46)
- `.planning/phases/45-plane-augmented-context-control/RESEARCH.md` — overall architecture vision (embedded earlier)
- `.planning/phases/29-firecrawl-control-plane-strongdm-parity/29-RESEARCH.md` — Firecrawl control plane design (referenced but not fully read; high-level based on existing code)

### Secondary (MEDIUM confidence)
- `.planning/phases/45-plane-augmented-context-control/CONTEXT.md` — phase scope
- `.planning/ROADMAP.md` — phase chronology and dependencies
- Existing agent prompt patterns from all `.md` files in `agents/` (surveyed via Grep)

### Tertiary (LOW confidence)
- Location and structure of Firecrawl service server code (not found in repo; may be external). Assumption: it's a separate service we control and can modify. Need to verify in planning/implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing libraries identified; only new files to create
- Architecture: HIGH — based on solid patterns (adapter registry, unified spec) and existing code
- Pitfalls: MEDIUM — identified from similar systems; specific cache invalidation requires implementation details
- Migration strategy: HIGH — clear per-agent changes and fallback behavior

**Research date:** 2026-03-24
**Valid until:** 60 days (architecture stable; implementation details may evolve)

---

## Phase Requirements Mapping

Since CONTEXT.md provided artifact descriptions but not explicit requirement IDs, I derive:

| Requirement | Supported By |
|-------------|--------------|
| Firecrawl `crawl(spec)` method | firecrawl-client.cjs extension + service endpoint |
| Unified context spec format | Context spec schema + agent instructions |
| Policy grants for file:// and plane:// | secondBrain.checkGrant() extension for custom schemes |
| Performance <2s with cache | Content cache + policy grant cache + parallel fetching |
| All researcher/planning agents use Firecrawl | Agent .md updates and workflow changes |
| Normalization, policy, audit | Reuse existing firecrawl-normalizer and policy integration |

**Key files to modify:**
- `get-stuff-done/bin/lib/firecrawl-client.cjs`
- Firecrawl service server (location TBD)
- `agents/gsd-planner.md`, `agents/gsd-phase-researcher.md`, `agents/gsd-project-researcher.md`, `agents/gsd-ui-researcher.md`
- Possibly `get-stuff-done/bin/lib/context-schema.cjs` (new)
- `get-stuff-done/bin/lib/source-adapters/*.cjs` (new)

This research provides enough detail for a planner to create concrete tasks: implement each adapter, add crawl method, update agents, write tests, and verify policy integration.
