---
phase: 42
plan: 01
subsystem: planning-server
tags: [security, hardening, ast, headers, cors, observability]
dependency_graph:
  requires: [phase-39-p01]
  provides: [localhost-binding, ast-init, security-headers, planning-dir-block, server-timeout, optional-cors]
  affects: [phase-42-p02, agents]
tech-stack:
  added: [node:http, security-headers, CORS, server timeout]
  patterns: [local-only-binding, fail-closed, degraded-mode, configuration-via-env, best-effort-audit]
key-files:
  created: []
  modified:
    - path: get-stuff-done/bin/lib/planning-server.cjs
      changes: "Added HOST config, AST init with try/catch, setSecurityHeaders helper, CORS support, server timeout, /v1/read endpoint with .planning blocking and audit"
decisions:
  - "Default network binding is 127.0.0.1; override via GSD_PLANNING_HOST"
  - "AST parser initialized at startup; on failure log warning and continue in degraded mode (regex fallback)"
  - "Security headers (X-Content-Type-Options, X-Frame-Options, Cache-Control) set on all responses"
  - "CORS disabled by default; enable with GSD_PLANNING_CORS_ORIGINS (comma-separated exact-match allowlist) and handle OPTIONS preflight"
  - "Server timeout set to 30 seconds"
  - "New /v1/read endpoint serves general project files, enforces absolute path, project root containment, and explicitly blocks .planning/ access"
  - "Audit logging integrated on /v1/read successes (best-effort)"
metrics:
  tasks: 4
  files: 1
  duration: "~25min"
  commit_count: 4
---

# Phase 42 Plan 01: Planning Server Security Hardening — Summary

**One-liner:** Localhost binding, AST activation, security headers, optional CORS, server timeout, and .planning/ directory blocking implemented for the Planning Server.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1-1 | Restrict network binding to localhost | d3012fe | get-stuff-done/bin/lib/planning-server.cjs |
| 1-2 | Activate Tree-Sitter at server startup | cbd6f4e | get-stuff-done/bin/lib/planning-server.cjs |
| 1-3 | Add security headers and server timeout | ddd8120 | get-stuff-done/bin/lib/planning-server.cjs |
| 1-4 | Block .planning/ exposure via /v1/read | 0be56e2 | get-stuff-done/bin/lib/planning-server.cjs |

## Task Details

### Task 1-1: Restrict network binding to localhost

- Added `HOST` constant defaulting to `127.0.0.1` with `GSD_PLANNING_HOST` override.
- Modified `server.listen(PORT, HOST, ...)` to bind to localhost only.
- Updated startup log to include full URL with host.

**Verification:** Code inspection confirms binding uses `HOST` and log format.

---

### Task 1-2: Activate Tree-Sitter at server startup

- Imported `astParser` module.
- In `startServer()`, before `server.listen()`, call `await astParser.init()` with try/catch.
- On success: log `[PlanningServer] AST parser initialized: Tree-Sitter active`.
- On failure: log warning with error and continue in degraded mode.
- Updated `normalizeContent()` to use `astParser.parseCode()`.

**Verification:** Startup logs will indicate initialization status or warning.

---

### Task 1-3: Add security headers and server timeout

- Created `setSecurityHeaders(res)` helper setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`.
- Called at top of every request handler before any response.
- Added optional CORS support: read `GSD_PLANNING_CORS_ORIGINS` as comma-separated allowlist; if request `Origin` matches, set `Access-Control-Allow-Origin`; handle `OPTIONS` preflight with appropriate headers.
- Set `server.timeout = 30000` and attached timeout event listener with optional logging.
- Security headers now present on all responses, including errors and preflight.

**Verification:** `curl -I http://localhost:3011/health` should show required headers. CORS headers only if configured.

---

### Task 1-4: Block .planning/ exposure via /v1/read

- Added new `/v1/read` endpoint for general project file access (non-`.planning` files).
- Implements absolute path requirement and project root containment via realpath checks.
- Added explicit `.planning/` directory denial:
  - After realpath resolution, compute `realPlanningDir`.
  - If target is within `.planning/`, return 403 with restricted message directing to `/v1/extract`.
  - Wrapped in try/catch to handle missing `.planning` directory gracefully.
- Integrated audit logging on successful reads using existing `audit.recordAuditEntry` pattern (best-effort).
- Maintains existing error handling patterns (400, 403, 404, 500).

**Verification:** Requesting a path under `.planning/` via `/v1/read` returns 403 and the denial message. `/v1/extract` continues to serve `.planning/` files.

## Deviations from Plan

None — plan executed exactly as written. The `/v1/read` endpoint was implied by the task context and was added as part of this task to provide the target for the .planning blocking.

## Authentication Gates

None encountered.

## Self-Check

- [x] All task commits exist: d3012fe, cbd6f4e, ddd8120, 0be56e2
- [x] Modified file exists: get-stuff-done/bin/lib/planning-server.cjs
- [x] No other files modified
- [x] Summary matches implementation

**Self-Check: PASSED**
