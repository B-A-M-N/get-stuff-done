# Phase 42: Planning Server Security Hardening - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the local HTTP planning-server service by:
1. Restricting network access (localhost-only)
2. Adding mandatory authentication with token-based access control
3. Implementing rate limiting with per-token/IP boundaries
4. Activating Tree-Sitter AST parsing at startup
5. Blocking `.planning/` exposure via `/v1/read`
6. Adding request validation and security headers
7. Exposing degraded mode signals when AST unavailable
8. Adding minimal security metrics endpoint

This fulfills PLANNING-SERVER-01 (restrict access) and PLANNING-SERVER-02 (AST activation + degraded warnings).

</domain>

<decisions>
## Implementation Decisions

### Authentication & Access Control

**Auth is mandatory by default.**
- Single server-wide bearer token required for all endpoints
- Token source: `PLANNING_SERVER_TOKEN` environment variable only (no config file)
- Server fails to boot if auth is mandatory and token is missing/unset
- Require `Authorization: Bearer <token>` header on all requests
- Use constant-time comparison for token validation
- Return same generic 401 shape for missing/malformed/invalid tokens (no information leakage)
- Never log token contents
- Audit record: auth attempt (yes/no), result (success/failure), endpoint, client identity basis (IP or token identifier)

**Insecure local override is explicit:**
- `PLANNING_SERVER_AUTH_MODE=disabled` or `PLANNING_SERVER_INSECURE_LOCAL=1` to bypass auth
- This must be a deliberate setting; "no auth" is NOT the normal posture
- When insecure mode is active, per-IP rate limiting still applies

**Network binding:**
- Bind to `127.0.0.1` (localhost) only by default
- Optional `GSD_PLANNING_HOST` env var for advanced scenarios (not recommended)
- Do NOT listen on `0.0.0.0` or external interfaces

### Rate Limiting Strategy

**Per-token when auth enabled, per-IP fallback for insecure/no-auth mode.**
- Token-based is the correct identity boundary when auth exists
- IP-based only collapses all local callers into one bucket (weak)

**Default limits (requests per minute):**
- `/health`: 300/min (high, cheap endpoint)
- `/v1/read`: 120/min (file system access)
- `/v1/extract`: 60/min (AST parsing, computationally expensive)
- `/metrics` (if enabled): 120/min
- Auth failures: separate failure counter with escalating delay after repeated failures (exact mechanism: reject with 429 after N failures within window)

**Concurrency caps:**
- Total concurrent requests: 16
- Concurrent extract/AST operations: 4
- When extract queue is full, return 503 with governed error body
- Basic burst control in addition to per-minute window (token bucket with burst allowance)

**Implementation:**
- In-memory token bucket per token or per IP (Map: identity → {tokens, lastRefill})
- Periodically prune stale entries (>10 minutes) to prevent memory leaks
- Include `Retry-After: 60` header on 429 responses

### Degraded Mode Behavior

**Tree-Sitter initialization failure must NOT crash the server.**
- Server starts in degraded mode if AST fails to initialize
- Degraded mode signals appear in three places:
  1. Startup log: explicit warning that regex fallback is active
  2. `/health` response: `ast_parser: "degraded-fallback"` instead of `"active"`
  3. Response header: `X-Planning-Server-Degraded: ast_unavailable` on affected requests

**Capability reduction:**
- `/v1/extract` continues to work but returns text-only analysis (regex fallback)
- Support strict caller option: `?requireAst=true` query parameter
  - In degraded mode, this endpoint returns hard failure (503 or 500, not silent fallback)
  - Without the flag, best-effort fallback is acceptable
- Include machine-readable field in JSON responses where feasible: `degraded: true, degraded_reason: "ast_unavailable"`

**Degraded mode is explicit and enforceable, not silent quality reduction.**

### Observability & Metrics

**Include minimal `/metrics` endpoint in this phase (do not defer).**
- Security-hardened services must expose enforcement counters to prove controls are active
- Format: Prometheus text-based exposition
- Required counters/gauges:
  - `planning_server_requests_total{method, path, status}`
  - `planning_server_request_duration_seconds{path}` (histogram buckets: 0.01, 0.05, 0.1, 0.5, 1, 5, 15, 30)
  - `planning_server_rate_limited_total{identity_type}` (token or ip)
  - `planning_server_auth_failures_total`
  - `planning_server_path_denial_total{reason}` (traversal, symlink, planning_dir_block)
  - `planning_server_ast_degraded` (gauge: 1 if degraded, 0 if active)
  - `planning_server_extraction_fallback_total` (regex fallback invocations)
  - `planning_server_in_flight_requests` (gauge)
  - `planning_server_in_flight_extracts` (gauge)
  - `planning_server_errors_total{type}` (internal errors by category)

**No historic retention or alerting yet — that is Phase 50's job.**
- Just expose counters; operators can poll/scrape as needed

### CORS Policy

**CORS disabled by default.**
- Do NOT emit `Access-Control-Allow-Origin: *` or any CORS headers unless explicitly configured
- This is a local privileged service with file-reading implications; browser reachability should be opt-in

**Opt-in via exact-match allowlist:**
- `PLANNING_SERVER_CORS_ORIGINS` environment variable (comma-separated list)
  - Example: `http://localhost:3000,http://127.0.0.1:5173`
- For each request with `Origin` header, if it exactly matches an allowlist entry, echo it back in `Access-Control-Allow-Origin`
- No wildcards, no pattern matching, no `*`
- Support preflight `OPTIONS` requests ONLY if CORS is enabled
- When CORS is enabled, set:
  - `Access-Control-Allow-Methods: GET, OPTIONS`
  - `Access-Control-Allow-Headers: Authorization, Content-Type`
  - Do NOT set `Access-Control-Allow-Credentials: true` unless proven necessary later

**Single-origin only is too rigid; wildcard is too loose. Exact-match allowlist is correct.**

### Request Validation & Resource Limits

**Default limits (configurable via env vars, boot-time only):**

- `PLANNING_SERVER_MAX_PATH_BYTES`: 4096 (max path/query string length)
- `PLANNING_SERVER_MAX_FILE_BYTES`: 5 * 1024 * 1024 (5MB default; reject larger files with 413)
- `PLANNING_SERVER_MAX_BODY_BYTES`: 64 * 1024 (64KB)
- `PLANNING_SERVER_MAX_HEADER_BYTES`: 8 * 1024 (8KB)
- `PLANNING_SERVER_MAX_CONCURRENT_REQUESTS`: 16 (total in-flight)
- `PLANNING_SERVER_MAX_CONCURRENT_EXTRACTS`: 4 (AST-parsing concurrency)
- `PLANNING_SERVER_REQUEST_TIMEOUT_MS`: 30000 (30s server-wide timeout)
  - `/health`: expect fast response, but still subject to overall timeout
  - `/v1/read`: effective read timeout ~5s for file I/O
  - `/v1/extract`: effective timeout ~15s for AST parsing (does not block overall 30s)

**Additional mandatory enforcement:**
- Canonicalized **allowed roots**: After `realpath` resolution, require the target to be under one of:
  - Project root (for `/v1/read`)
  - `.planning/` directory (for `/v1/extract`)
- Reject paths containing null bytes (`\0`) immediately with 400
- Reject paths exceeding 4096 bytes before path resolution

**Why 5MB not 10MB:** Planning server is not a general-purpose large-file parser. 5MB bounds memory/CPU pressure and prevents abuse while covering typical source files and docs.

**All limits are boot-time configuration only.** No hot-reload needed.

### Block .planning/ Exposure via `/v1/read`

**The `/v1/read` endpoint must refuse paths inside `.planning/`.**
- Only `/v1/extract` should serve planning artifacts (with normalization, AST, audit)
- After computing `absolutePath` and performing existing `realpath` checks, add explicit denial:
  - Check if resolved path starts with `<projectRoot>/.planning/` (or equals it)
  - If yes, return 403 with message: `Access to .planning/ files via /v1/read is restricted; use /v1/extract`
- This preserves separation: governance artifacts go through extract (normalized + audited), raw read is for general project files only

### Security Headers & Hardening

**Set on all responses (except errors before headers can be set):**

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Cache-Control: no-store` (planning server responses should not be cached by intermediaries)

**Remove `X-Powered-By`:**
- Node.js does not set this by default; ensure it is not added by any middleware
- Do not add any header that reveals implementation details unnecessarily

**Audit logging:**
- Extend existing audit pattern on `/v1/read` to `/v1/extract` and all denial paths
- Wrap security checks with `try { audit.recordAuditEntry(...) } catch {}` — best-effort, never break requests
- Audit entries should include: action, path (or attempted path), client identity basis (IP/token), outcome (allowed/denied), reason for denial

### AST Initialization

**Must call `astParser.init()` during server startup before `server.listen()`.**
- Log success: `AST parser initialized: Tree-Sitter active`
- On failure: log warning: `AST parser initialization failed; code analysis will use regex fallback: <error>`
- Do not crash startup on AST failure; degraded mode is acceptable

**No code changes needed in `normalizeContent` — it already calls `parseCode()` which handles both Tree-Sitter and regex paths.**

### Error Handling & Stability

- Set `server.timeout = 30_000` (30 seconds)
- Handle `timeout` event to close connections gracefully
- Rate limiter memory management: prune entries older than 10 minutes on each check with 1% probability, or periodically via timer
- Generic error messages for security-relevant failures (auth, rate limit, path traversal). Do not expose internal paths or detailed stack traces to client.
- For file errors, keep minimal: `File not found` vs `File /abs/path/... not found`

### Configuration via Environment Variables

All knobs in this plan are env-based:

- `PLANNING_SERVER_TOKEN` (required unless insecure mode)
- `PLANNING_SERVER_AUTH_MODE` (optional: `disabled` to skip auth)
- `PLANNING_SERVER_INSECURE_LOCAL` (alternative to AUTH_MODE: `1` to disable)
- `GSD_PLANNING_HOST` (default: `127.0.0.1`)
- `GSD_PLANNING_PORT` (default: `3011`)
- `GSD_PLANNING_RATE_LIMIT` (default: per-endpoint defaults; set to `0` to disable)
- `GSD_PLANNING_CORS_ORIGINS` (comma-separated allowlist; unset = no CORS)
- `PLANNING_SERVER_MAX_FILE_BYTES` (default: `5242880` = 5MB)
- `PLANNING_SERVER_MAX_PATH_BYTES` (default: `4096`)
- `PLANNING_SERVER_MAX_BODY_BYTES` (default: `65536`)
- `PLANNING_SERVER_MAX_CONCURRENT_REQUESTS` (default: `16`)
- `PLANNING_SERVER_MAX_CONCURRENT_EXTRACTS` (default: `4`)
- `PLANNING_SERVER_REQUEST_TIMEOUT_MS` (default: `30000`)

**No config-file secrets. No hot-reload. Fail fast on boot if mandatory config missing.**

### Claude's Discretion

The following implementation details are left to engineer judgment:

- Exact error message phrasing for 401/403/429/413 responses (keep them canonical and non-leaky)
- Rate limiter exact prune strategy (probabilistic vs timer-based)
- Whether to include `degraded` field in JSON responses (recommended but not mandatory)
- Metric naming conventions and bucket boundaries (follow Prometheus best practices)
- Concurrency queue implementation (simple FIFO, priority queue, or rejection-only)
- Audit log field richness (minimum: action, path, outcome, identity; more is okay)
- Whether `/metrics` should also include version/build info (nice-to-have)

Crucial policy decisions above are locked; implementation must adhere to those constraints.

</decisions>

<canonical_refs>
## Canonical References

### Phase Documentation
- `.planning/phases/42-planning-server-security-hardening/RESEARCH.md` — Comprehensive hardening analysis, gap identification, and recommended steps (the source of truth for technical approach)
- `.planning/phases/42-planning-server-security-hardarding/42-01-PLAN.md` — Implementation plan (to be created)

### Existing Code References (for implementation)
- `get-stuff-done/bin/lib/planning-server.cjs` — Current server implementation (needs modification)
- `get-stuff-done/bin/lib/ast-parser.cjs` — Tree-Sitter wrapper with `init()` function
- `get-stuff-done/bin/lib/core.cjs` — `safeReadFile`, logging utilities
- `get-stuff-done/bin/lib/audit.cjs` — Audit logging mechanism
- `get-stuff-done/bin/lib/broker.cjs` — Message broker (event publishing)
- `get-stuff-done/wasm/` — Tree-Sitter WASM language files (tree-sitter-javascript.wasm, tree-sitter-typescript.wasm, tree-sitter-tsx.wasm)

### Related Phases (context)
- `.planning/phases/30-strict-context-determinism-enforcement-hardening/30-CONTEXT.md` — Prior planning-server context (existing `/v1/read` implementation pattern)
- `.planning/phases/23-research-hard-context-sandbox/23-CONTEXT.md` — Sandbox patterns (exit codes, path denial)

### External Specifications (none)
No external design docs or ADRs exist for this phase; all requirements in RESEARCH.md and context decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `planning-server.cjs` already has `/health` and `/v1/extract` and `/v1/read` endpoints with path traversal protection
- `ast-parser.cjs` has ready-to-use `init()` and `parseCode()`; just needs initialization call
- `audit.cjs` provides `recordAuditEntry()` — already used on `/v1/read`, can be extended
- In-memory rate limiter pattern available from research code examples

### Established Patterns
- Path traversal prevention uses `fs.realpathSync()` comparison against allowed base (see lines 70-94 and 155-179)
- Error responses use JSON format consistently: `{ error: '...' }`
- Audit is best-effort (try/catch) so failures don't break requests
- Endpoint routing uses simple `url.pathname` checks in a single `http.createServer` handler
- Concurrency management will be new; no existing async queue pattern in this file

### Integration Points
- `planning-server.cjs` is standalone; changes are localized to this file except for:
  - `package.json` may need to ensure `web-tree-sitter` dependency exists (verify)
  - `wasm/` directory must contain Tree-Sitter language WASM files (already present)
- All other GSD components (agents, tools) call this server; they need no changes for auth/concurrency unless they bypass the server (they shouldn't)
- `core.cjs` and `audit.cjs` are stable libraries; just ensure they are imported where needed

</code_context>

<specifics>
## Specific Ideas

**Auth token handling:**
- Use `crypto.timingSafeEqual` for constant-time comparison if both strings are same length; otherwise fall back to naive `===` is acceptable for local dev tool (timing attack not a realistic threat on localhost, but `timingSafeEqual` is easy to add)
- If `PLANNING_SERVER_TOKEN` is set but empty string, treat as missing (fail boot)
- Startup sequence: validate token presence if auth mandatory → call `astParser.init()` → connect broker → start server

**Rate limiter identity:**
- When auth is mandatory: use the token itself as bucket identity (hash the token to avoid using raw secrets as map keys, or just use the raw string—localhost only, no persistence, acceptable)
- When insecure/no-auth: use `req.socket.remoteAddress` (typically `::1` or `127.0.0.1` for localhost)
- Prune stale entries every 1000 requests with 1% probability per entry, or on a `setInterval` (simpler: timer every 5 minutes)

**Concurrency control:**
- Use a semaphore or counting mutex for extract operations
- `let activeExtracts = 0; const MAX_EXTRACTS = 4;`
- On `/v1/extract` request: if `activeExtracts >= MAX_EXTRACTS`, return 503 immediately with message: `"Extraction capacity exceeded, try again later"`
- Increment counter before starting AST/regex work, decrement in finally block
- Total concurrent requests: use server-level semaphore; on each request entry, check count, reject with 503 if over limit

**Degraded mode header:**
- `X-Planning-Server-Degraded: ast_unavailable` — set on every response when `!astParser.isInitialized()`
- Health endpoint returns JSON: `{ status: "ok", ast_parser: "degraded-fallback", timestamp: "...", version: "1.0" }`
- Normal response (when AST active): `{ status: "ok", ast_parser: "active", ... }`

**Metrics endpoint (`/metrics`):**
- Plaintext Prometheus format
- Expose at root `/metrics` or `/v1/metrics`? Let research recommend: `/metrics` is conventional
- No authentication? Should be accessible without auth for monitoring agents that may not have token. This is acceptable since it's localhost-only and metrics are not sensitive (no data values, only counters).
- Implement as simple text response; Node doesn't need external library
- Update counters in every relevant branch (requests, errors, denials, rate limits, degradation flags)

**Security headers:**
- Set on every successful response path (2xx, 3xx, 4xx, 5xx) before `res.end()`
- Create helper: `setSecurityHeaders(res)` to avoid forgetting

**Request validation:**
- Path length check immediately after reading query param: `if (relativePath.length > 4096) return 400`
- Null byte check: `if (relativePath.includes('\0')) return 400`
- File size check after `fs.statSync` but before reading: `if (stats.size > maxSize) return 413`
- These checks should occur BEFORE expensive operations like AST parsing

**Canonical root enforcement (already partly present):**
- For `/v1/read`: existing `realpath` + project root check (lines 156-179) is sufficient
- For `/v1/extract`: existing `realpath` + `.planning/` check (lines 70-94) is sufficient
- Additional enhancement: after realpath resolution, ensure path is under expected root using `startsWith(realRoot + path.sep)` — current code uses string prefix; that's fine as long as realpath is used (prevents symlink escapes)

**Audit:**
- Add audit to `/v1/extract` success path? Possibly, but at least add on denials:
  - Auth failure
  - Rate limit exceeded
  - Path traversal attempt (when `isOutside` condition true)
  - `.planning/` access via `/v1/read`
  - File size limit exceeded
  - Invalid path (null byte, too long)
- Use same `try { audit.recordAuditEntry(...) } catch {}` pattern

**Token env var lifecycle:**
- Load at server startup: `const expectedToken = process.env.PLANNING_SERVER_TOKEN;`
- If auth mandatory and token is `undefined` or empty string: log error and exit(1) before starting server
- If insecure mode, skip token requirement

**CORS handling:**
- Only add CORS headers if `PLANNING_SERVER_CORS_ORIGINS` is set and non-empty
- On each request with `Origin` header, check if it exactly matches one of the origins; if yes, set `Access-Control-Allow-Origin: <that origin>`
- Preflight `OPTIONS` requests: only if CORS enabled; respond with 204, appropriate headers
- If no `Origin` header, do not set CORS headers (standard)

**Concurrency design:**
- In-flight requests: maintain `activeRequests` counter; increment at start of handler, decrement in finally
- Expose as gauge in `/metrics`
- For extract concurrency: separate `activeExtracts` counter; before starting AST work, check against limit; if exceeded, return 503 immediately

**Rate limiter cleanup:**
- On every `checkRateLimit(ip)` call, with 1% probability call `pruneStale()`
- `pruneStale()` iterates over `rateLimitState` and deletes entries where `now - entry.last > 10 * 60 * 1000` (10 minutes)
- This keeps memory bounded without requiring a timer

**Metrics naming:**
- Use `planning_server_` prefix for all metrics
- Histogram buckets for latency: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] seconds
- Labels: for `requests_total`, include `method`, `path` (path should be the literal route like `/v1/read`, not the full path with query)
- For errors: `planning_server_errors_total{type="file_not_found"|"auth"|"rate_limit"|"validation"|"internal"}`

**Logging:**
- Use existing `core.cjs` logging functions if available: `logInfo`, `logWarn`, `logError`
- At minimum, `console.log`/`console.warn` are fine
- Startup log must include: port, host, auth mode (mandatory/insecure), token presence (present/missing), AST init status (active/degraded), rate limit defaults

**Verification is part of this phase** — the `/metrics` endpoint itself must be tested to emit expected counters.

</specifics>

<deferred>
## Deferred Ideas

None — all needed functionality is in-scope for Phase 42.

Out of scope for this phase:
- Full Prometheus scraping integration (Phase 50)
- Alerting rules and dashboards (Phase 50)
- Advanced metrics (per-route latency percentiles, long-term storage)
- TLS/HTTPS (local-only service, use tunneling if needed)
- Multi-token or OAuth (overkill for local service)
- Persistent rate limit store (in-memory is sufficient)
- Request queuing beyond simple capacity limit (reject with 503)
- Distributed rate limiting across processes (single-process server)

</deferred>

---

*Phase: 42-planning-server-security-hardening*
*Context gathered: 2026-03-24 via locked policy decisions*
