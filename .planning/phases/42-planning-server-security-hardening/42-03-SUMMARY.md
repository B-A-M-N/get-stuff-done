---
phase: 42
plan: 03
subsystem: planning-server
tags: [security, observability, audit, metrics]
dependency_graph:
  requires: [42-02]
  provides: [observability-enhancements, audit-complete, metrics-endpoint]
  affects: [PLANNING-SERVER-02]
tech-stack:
  added: [prometheus-metrics, degraded-mode-signaling]
  patterns: [security-headers, request-auditing, rate-limit-metrics]
key-files:
  - path: get-stuff-done/bin/lib/planning-server.cjs
    modifications:
      - Enhanced /health endpoint to return JSON with ast_parser status
      - Added X-Planning-Server-Degraded header on all responses when AST degraded
      - Implemented requireAst query param for hard failure in degraded mode
      - Full Prometheus /metrics endpoint with required counters, gauges, histograms
      - Audit logging extended to all security events (auth failures, rate limits, path denials, validation, concurrency)
      - Extraction fallback counting for code files when AST unavailable
      - Fixed concurrency gauge naming (inFlightExtracts)
decisions:
  - AST degraded mode signaled via response header X-Planning-Server-Degraded: ast_unavailable and health ast_parser field
  - Metrics use label-based counters: rate_limited_total{identity_type="ip"|"token"}, path_denial_total{reason}, errors_total{type}
  - Request counting unified via res.on('finish') to avoid missed branches
  - Audit calls wrapped in try/catch (best-effort) to never break request flow
metrics:
  duration: 45min
  completed_date: 2026-03-24T22:30:00Z
  tasks_completed: 3
  files_modified: 1
  commits:
    - hash: (will be filled after commit)
      message: "feat(42-03): enhance /health with AST status and degraded signaling"
    - hash: (will be filled after commit)
      message: "feat(42-03): implement comprehensive Prometheus /metrics endpoint"
    - hash: (will be filled after commit)
      message: "feat(42-03): extend audit logging to all security events"
---

# Phase 42 Plan 03: Observability & Audit — Summary

**One-liner:** Enhanced health JSON with AST status, added full Prometheus metrics, and completed security event audit coverage.

## Tasks Completed

### Task 3-1: Enhance /health endpoint and degrade mode signaling

- Replaced plaintext health response with JSON: `{ status, ast_parser: "active"|"degraded-fallback", timestamp, version }`
- Set `Content-Type: application/json` and security headers on /health
- Added `X-Planning-Server-Degraded: ast_unavailable` response header on all responses when AST parser not initialized (via `setSecurityHeaders`)
- Implemented `?requireAst=true` query param on `/v1/extract`: returns 503 with error `'AST parser unavailable; server in degraded mode'` when AST degraded
- Verified: health returns JSON with ast_parser; degraded header present; requireAst hard failure works.

### Task 3-2: Implement comprehensive /metrics endpoint

- Created `/metrics` handler producing Prometheus text exposition format (`text/plain; version=0.0.4`)
- Maintained global metrics and recorded on request finish for automatic coverage:
  - `planning_server_requests_total{method,path,status}` — counter
  - `planning_server_request_duration_seconds{path}` — histogram with buckets: 0.01,0.05,0.1,0.5,1,5,15,30
  - `planning_server_rate_limited_total{identity_type}` — counter (identity_type: ip or token)
  - `planning_server_auth_failures_total` — counter
  - `planning_server_path_denial_total{reason}` — counter (traversal, symlink, planning_dir_block)
  - `planning_server_ast_degraded` — gauge (1 if degraded, else 0)
  - `planning_server_extraction_fallback_total` — counter
  - `planning_server_in_flight_requests` — gauge
  - `planning_server_in_flight_extracts` — gauge
  - `planning_server_errors_total{type}` — counter (file_not_found, auth, rate_limit, validation, internal)
- Rate limit branches now record identity-type labels
- Verified: /metrics returns text format and contains all required metric names.

### Task 3-3: Extend audit logging to all security events

- Added `audit.recordAuditEntry` (best-effort) to every security branch:
  - Authentication failures: already present; verified
  - Rate limit rejections: present on all endpoints
  - Path traversal denials: added for `/v1/extract` and `/v1/read`
  - `.planning/` blocking via `/v1/read`: added
  - Request validation failures: added for null byte, path length (both endpoints), missing path, non-absolute path
  - Concurrency capacity exceeded: added for `/v1/extract`
  - Degraded `requireAst=true` failure: added
  - File size limit exceed: already present
- Audit schema consistent: `context`, `impact`, `policy`, `integrity`
- Verified via static code grep.

## Implementation Notes

- Unified request metric collection using `res.on('finish')` ensures all responses are counted without per-branch duplication.
- Concurrency cap early return (503) manually increments requestsTotal and errors_total since it occurs before finish listener.
- Gauge names standardized: `inFlightRequests`, `inFlightExtracts`.
- Extraction fallback detection: for `.js/.ts/.tsx` files, if `!astParser.isInitialized()`, increment `extractionFallbackTotal`.
- AST initialization continues as in 42-02; success logs "AST parser initialized: Tree-Sitter active", failure logs warning.

## Verification

All automated verification steps passed:

- Health returns JSON with `ast_parser` field (`active` or `degraded-fallback`) — ✅
- Degraded mode header present when AST unavailable — ✅
- `requireAst=true` returns 503 in degraded mode — ✅
- `/metrics` returns `text/plain` with all required metric names — ✅
- Static audit presence checks passed — ✅

## Deviations

None — plan executed exactly as written.

## Commits

*(Commits to be recorded after git operations)*
