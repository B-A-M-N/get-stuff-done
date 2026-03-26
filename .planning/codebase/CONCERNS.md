# Codebase Concerns

**Analysis Date:** 2026-03-25

## Tech Debt

### Silent Error Handling Throughout Codebase

**Issue:** Widespread use of empty `.catch(() => {})` blocks that swallow errors silently across critical subsystems, masking failures and making debugging impossible.

**Files:**
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/second-brain.cjs:62` - `_ensureAuditIndexes().catch(() => {});`
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/second-brain.cjs:76` - `_initializeProjectIsolation().catch(() => {});`
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/roadmap.cjs:333` - Plane sync failure silently ignored
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/audit.cjs:335, 369` - Audit logging failures silently ignored

**Impact:** System failures (database init, audit trail, Plane sync) occur without any indication. Data loss risk when audit entries fail. Plane roadmap desynchronization goes undetected.

**Fix approach:** Replace silent catches with proper error logging and fallback strategies. At minimum, emit `console.warn()` with error details. Consider retry logic for transient failures.

---

### Monolithic 2000+ Line Files

**Issue:** Several core modules exceed 2000 lines, creating maintainability and comprehension bottlenecks.

**Files:**
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/verify.cjs` (2862 lines)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/second-brain.cjs` (1280 lines)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/commands.cjs` (1173 lines)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/state.cjs` (1016 lines)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/planning-server.cjs` (914 lines)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/phase.cjs` (911 lines)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/init.cjs` (904 lines)

**Impact:** Difficult to navigate, test, and modify. High cyclomatic complexity likely. Changes risk breaking multiple concerns.

**Fix approach:** Extract concerns into separate modules. For `verify.cjs`, split by verification category (summary, checkpoint, phase completeness, etc.). For `second-brain.cjs`, separate Postgres, SQLite, audit, grant, and schema subsystems.

---

### Stale Worktree Artifacts

**Issue:** Three orphaned agent worktrees (`-af1d9dbc`, `-aabfe3ba`, `-a460e664`) consuming 15MB in `.claude/worktrees/`.

**Files:**
- `/home/bamn/get-stuff-done/.claude/worktrees/agent-af1d9dbc/`
- `/home/bamn/get-stuff-done/.claude/worktrees/agent-aabfe3ba/`
- `/home/bamn/get-stuff-done/.claude/worktrees/agent-a460e664/`

**Impact:** Disk clutter. Potential confusion about which code is canonical. May contain stale state.

**Fix approach:** Create cleanup utility that verifies no active sessions then removes worktrees older than 7 days. Add automatic cleanup on milestone completion.

---

### Architectural Drift

**Issue:** Architecture documentation is 15+ months out of date. Implementation has grown from 11 to 40+ modules with significant subsystem expansion (Second Brain, Planning Server, ITL expansion, Context enrichment). Documentation claims "zero runtime dependencies" but system requires Postgres, RabbitMQ, Zod.

**Evidence:**
- `/home/bamn/get-stuff-done/docs/ARCHITECTURE.md` - Last major update 2025-01-24 (over a year old)
- `/home/bamn/get-stuff-done/ARCHITECTURE-DRIFT-RESPONSE-SMMARY.md` - Confirmed significant drift
- `/home/bamn/get-stuff-done/.planning/audit/ARCHITECTURAL-DRIFT-ASSESSMENT-2026-03-25.md` - Documents 300% module growth

**Impact:** Knowledge gap between docs and reality. New contributors face misleading information. Design decisions cannot be understood from docs.

**Fix approach:** Either (1) rewrite architecture docs to match current implementation or (2) prune subsystems back to documented scope. Recommendation: Document current reality then evaluate if all subsystems are necessary.

---

### Enforcement Boundary Erosion

**Issue:** The critical enforcement boundary has degraded. Core primitives (`commit-task`, `gate enforce`, `checkpoint write`) exist but are voluntary. Workflow commands can be invoked in any state. Verification steps are bypassable.

**Evidence:**
- `/home/bamn/get-stuff-done/.planning/audit/arch-enforcement.md`: "Every call into those primitives is voluntary. LLM agent compliance is the only enforcement mechanism."
- `verify phase-completeness` not called before `verify_phase_goal` in execute-phase
- `verify research-contract` never called in `plan-phase` critical path
- `gsd-tools.cjs` has no pre-condition checking at CLI router level
- Auto-chain bypass (`_auto_chain_active`) has no scope restriction

**Impact:** Agents can skip critical gates, leading to incomplete work, uncommitted changes, or false phase completion signals.

**Fix approach:** Wrap all workflow entry points with pre-condition validators. Make verification steps mandatory exits (non-zero on failure). Restrict `_auto_chain_active` to exclude human-action checkpoints.

---

### State Machine Gaps

**Issue:** No transition guards, paused state is heuristic, duplicate decision accumulation, phase completion based on counter not disk state.

**Files:**
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/state.cjs:210-237` - `cmdStateAdvancePlan` transitions based on counter, not live SUMMARY file check
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/state.cjs:684` - `buildStateFrontmatter` matches "paused"/"stopped" strings (no `cmdStatePause` function)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/state.cjs` - `cmdStateAddDecision` lacks deduplication

**Impact:** Incorrect state reporting. Impossible to reliably detect paused sessions. Duplicate STATE.md entries accumulate. False "Phase complete" with missing SUMMARY files.

**Fix approach:** Add explicit `cmdStatePause`/`cmdStateResume`. Implement live disk verification before phase completion transitions. Add deduplication key tracking (e.g., decision content hash).

---

### Context Propagation Gaps

**Issue:** ITL output (ambiguity scores, clarifications, research cues) is not persisted across session boundaries. `CONTEXT.md` generated via PRD express path lacks `research_cues` block. `verify research-contract` exists but never invoked.

**Files:**
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl-audit.cjs` - Produces output that dies with session
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/verify.cjs:550` - "Unresolved Ambiguities" is warning, not error
- `/home/bamn/get-stuff-done/get-stuff-done/workflows/plan-phase.md` - No call to `verify research-contract` after researcher returns

**Impact:** Cross-session continuity broken. Plan-phase cannot see discuss-phase outputs. Research contract compliance not enforced.

**Fix approach:** Persist ITL output to `{phase_dir}/{padded_phase}-ITL.json`. Wire `verify research-contract` into plan-phase critical path. Upgrade unresolved ambiguities to error in verify stage.

---

### Configuration Drift

**Issue:** Multiple configuration keys documented but never read by runtime. Planesync feature flag inconsistencies. Environment variable handling scattered with fallbacks.

**Evidence:** Planner notes indicate "5+ config keys written but never read." Need systematic configuration audit.

**Impact:** Configuration confusion. Users set keys believing they have effect. Silent no-ops.

**Fix approach:** Audit `.planning/config.json` keys against all read locations in code. Document purpose or remove unused keys. Create configuration schema validation.

---

### Schema Fragmentation

**Issue:** Two incompatible checkpoint schemas exist with no cross-reference: artifact-schema (modern) and frontmatter-based legacy. No version field or migration path.

**Files:**
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/artifact-schema.cjs` - New checkpoint schema
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/frontmatter.cjs` - Legacy frontmatter parsing

**Impact:** Checkpoints from different phases may be incompatible. Verification logic must handle both formats with divergent validation rules.

**Fix approach:** Consolidate to single schema with version field. Add migration utility. Deprecate legacy format with clear cutoff version.

---

### Package Extraction Gap

**Issue:** ITL exists as both internal package (`packages/itl/`) and bundled internal modules (`bin/lib/itl-*.cjs`). Dual maintenance burden. Unclear which is canonical.

**Files:**
- `/home/bamn/get-stuff-done/packages/itl/index.cjs` (492 lines)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl.cjs` (555 lines)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl-schema.cjs`, `itl-adapters.cjs`, `itl-extract.cjs`, etc.

**Impact:** Duplicate logic. Changes may be applied to one copy but not other. Deployment confusion.

**Fix approach:** Choose single source of truth. Recommended: package format with proper exports. Remove bundled copies. Use proper module resolution.

---

## Known Bugs

### Planesync Observability Gap

**Symptoms:** When Plane sync fails (API error, rate limit, network), there is no audit trail in `STATE.md` or logs indicating sync status. User has no visibility into desynchronization.

**Trigger:** Plane API unavailable or returns error during `notifyRoadmapChange()`.

**Workaround:** None currently. User must manually check Plane workspace vs ROADMAP.md.

**Fix:** Record sync attempts (success/failure, error type, timestamp) in STATE.md or dedicated sync log file.

---

### State Add Decision Duplication

**Symptoms:** Re-running `/gsd:plan-phase` or adding decisions manually accumulates duplicate entries in `STATE.md` decisions array.

**Trigger:** Multiple `cmdStateAddDecision` calls with same content.

**Impact:** STATE.md grows unnecessarily. Decision history unclear.

**Workaround:** Manual cleanup of STATE.md.

**Files:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/state.cjs` (deduplication missing)

---

### Checkpoint Bypass in Auto-Chain Mode

**Symptoms:** Setting `_auto_chain_active` allows agent to bypass `checkpoint:human-action` types without detection, violating checkpoint guarantees.

**Trigger:** Agent sets `_auto_chain_active` in STATE.md before checkpoint that requires user input.

**Impact:** Waits for user never enforced. Workflow proceeds without necessary approval, risking rework or misalignment.

**Workaround:** Monitor STATE.md for `_auto_chain_active` and verify checkpoint types manually.

**Files:** `/home/bamn/get-stuff-done/get-stuff-done/workflows/execute-phase.md` - auto-chain logic lacks scope check

---

## Security Considerations

### Audit Logging Silent Failures

**Risk:** Audit log failures are silently caught in multiple catch blocks, creating gaps in security audit trail. Cannot prove compliance or trace actions.

**Evidence:**
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/planning-server.cjs:335, 369` - `try { audit.record(...) } catch (e) {}`
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/second-brain.cjs` - Multiple silent catches around audit operations

**Impact:** Security incidents cannot be investigated. Compliance cannot be demonstrated. Malicious actions within system may go undetected.

**Recommendation:** Do NOT catch audit failures silently. Either (a) retry with exponential backoff, then escalate to console.error + metrics, or (b) block operation if audit cannot be recorded.

---

### Insecure Defaults in Planning Server

**Risk:** Planning server has optional authentication (`PLANNING_SERVER_AUTH_MODE=disabled` or `PLANNING_SERVER_INSECURE_LOCAL=1`) that allows unrestricted access. Default is `mandatory` which is good, but insecure mode available.

**Evidence:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/planning-server.cjs:18-21` - Auth mode configuration.

**Impact:** If operator accidentally enables insecure mode, local processes (or attackers with local access) can bypass all gates.

**Recommendation:** Remove insecure mode entirely. If truly needed for development, require explicit opt-in with prominent warning in logs on startup.

---

### Rate Limiting In-Memory Only

**Risk:** Rate limit state stored in JavaScript Map (`rateLimitMap`) is lost on process restart. Attacker can reset tokens by causing server restart.

**Evidence:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/planning-server.cjs:212` - `rateLimitMap = new Map()`.

**Impact:** Rate limiting effectiveness degraded. DoS protection partially defeated by restart.

**Recommendation:** Persist rate limit counters to shared storage (Redis) or at least to filesystem with graceful degradation. Document limitation.

---

### SQL Injection Risk Assessment

**Status:** ✅ **No SQL injection detected.** All database queries use parameterized statements via `pg` library or SQLite prepared statements. No string concatenation with user input found in queries.

**Evidence:**
- `second-brain.cjs` uses `await this.pool.query('CREATE SCHEMA IF NOT EXISTS gsd_local_brain');` (static)
- All dynamic queries use parameter arrays: `pool.query('SELECT ... WHERE id = $1', [id])` pattern

**Note:** Continue monitoring. Avoid introducing raw string concatenation for user-provided values.

---

### Command Injection Assessment

**Status:** ✅ **No command injection detected.** All `git` operations use `spawnSync('git', argsArray)` with array arguments, avoiding shell interpolation. No `exec()` with string commands.

**Evidence:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/core.cjs:482-493`:
```javascript
function execGit(cwd, args) {
  const result = spawnSync('git', args, { /* options */ });
  // ...
}
```

All calls pass args as array: `execGit(cwd, ['rev-parse', '--short', 'HEAD'])`.

---

### Environment Variable Secrets Leakage

**Risk:** Environment variables containing secrets (`PLANE_API_KEY`, `FIRECRAWL_API_KEY`, `PGPASSWORD`) are passed to audit logs and error messages.

**Evidence:**
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/audit.cjs:231-232` logs entire environment including `GSD_INTERNAL_BYPASS`.
- Error messages in `second-brain.cjs` may leak database connection details.

**Impact:** Secrets may appear in logs, terminal output, or STATE.md if exceptions are caught and logged.

**Recommendation:** Scrub sensitive keys from any logged environment. Use structured logging that filters `*_KEY`, `*_SECRET`, `*_PASSWORD`, `TOKEN` patterns. Audit all `console.error` calls for PII/secret leakage.

---

## Performance Bottlenecks

### Large File Parsing

**Issue:** Files like `verify.cjs` (2862 lines) and `second-brain.cjs` (1280 lines) must be loaded on every invocation. This impacts cold start time and memory footprint.

**Impact:** Slower CLI response, especially on first run or after cache invalidation.

**Fix approach:** Split into smaller modules with targeted imports. Use lazy loading for rarely used functions.

---

### In-Memory Rate Limiting

**Issue:** Token bucket rate limit state stored entirely in memory (`rateLimitMap`) with no persistence. High-traffic deployments will see token reset on every restart, weakening DoS protection.

**Files:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/planning-server.cjs:212`

**Impact:** Rate limits less effective than they could be. Attacker can cause restart to gain fresh tokens.

**Fix approach:** Implement Redis-back rate limiting or at least write counter snapshots to disk every minute.

---

### Database Connection Pool Defaults

**Issue:** Second Brain uses pg Pool with default settings (no explicit max connections). Under concurrent load, may create too many Postgres connections.

**Files:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/second-brain.cjs:31-55`

**Impact:** Database overload if multiple GSD instances or other apps share same Postgres server.

**Fix approach:** Set explicit `max` in pool config (e.g., `max: 10`). Read from `PGMAXCONNECTIONS` env if provided.

---

## Fragile Areas

### Planning Server Request Handling

**Monolithic handler:** The `server` callback in `planning-server.cjs:254` handles all routes in single function. Complex branching, difficult to test, error-prone modifications.

**Fix:** Split into route-specific handlers (express-style) even if using raw http. Each endpoint gets dedicated function with focused validation.

---

### Verify.cjs God Function

**Issue:** `verify.cjs` exports numerous verification functions but they share internal state and complex dependencies. Modifying one verification may affect others unpredictably.

**Fix:** Break into submodules: `verify-summary.cjs`, `verify-checkpoint.cjs`, `verify-phase.cjs`, `verify-git.cjs`. Define clear interfaces.

---

### Roadmap-Planesync Integration

**Issue:** `roadmap-plane-sync.cjs` calls `notifyRoadmapChange` as fire-and-forget with no error reporting back to caller. Silent failures mean roadmap updates in Plane can be lost without user knowledge.

**Files:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/roadmap-plane-sync.cjs`

**Impact:** Desynchronization between ROADMAP.md and Plane workspace.

**Fix:** At minimum, log sync failures to STATE.md. Consider retry with backoff. Surface as warning in `/gsd:progress`.

---

## Scaling Limits

### Concurrent Request Cap

**Current:** `PLANNING_SERVER_MAX_CONCURRENT_REQUESTS` default 16. Hard cap returns 503 when exceeded.

**Risk:** Legitimate traffic may be rejected during burst. No queuing - immediate rejection.

**Mitigation:** Document limit. Allow tuning via env. Consider implementing request queue with timeout instead of immediate reject for better UX.

---

### Rate Limit Identity Granularity

**Current:** Rate limiting uses identity (IP in insecure mode, Bearer token otherwise). No per-user or per-project granularity beyond that.

**Risk:** Shared token across multiple actors (CI, multiple developers) spreads limit across all, leading to premature throttling.

**Mitigation:** Document limitation. Consider extracting project identifier from request context for secondary limit dimension.

---

### In-Memory Metrics Retention

**Issue:** `metrics.requestDuration` stores up to 1000 duration samples per path in memory indefinitely. `/metrics` endpoint accumulates ever-growing buckets in memory without cleanup.

**Files:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/planning-server.cjs:279-282`

**Impact:** Memory leak under long-running server with diverse endpoints. Eventually OOM.

**Fix:** Implement circular buffer with fixed capacity. Prune old path entries when map exceeds threshold (e.g., 100 distinct paths).

---

## Dependencies at Risk

### RabbitMQ Optional Dependency

**Status:** `amqplib` is listed in dependencies but code handles connection failure with `console.warn` and continues in disconnected mode.

**Evidence:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/broker.cjs:33-61` - Connection retries then operates without messaging.

**Risk:** Messaging features (event-driven notifications, async processing) silently disabled if RabbitMQ unreachable. User unaware of degraded functionality.

**Mitigation:** Clear startup message indicating "Broker disconnected - features limited". Add `planning-server /health` to report broker status in degraded flag (like AST parser).

---

### SQLite Fallback Module

**Status:** `node:sqlite` (experimental) is optional. If unavailable and Postgres fails, Second Brain operates in highly degraded mode (no persistence).

**Evidence:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/second-brain.cjs:9-13` - try/catch require. Fallback path logs errors but continues.

**Risk:** Silent degradation to no database when both Postgres and SQLite unavailable. Data loss for audit trail, grants, context schema registry.

**Mitigation:** Emit startup banner stating which storage backend is active. Add `offlineMode` flag exposed in `/health` endpoint.

---

### Tree-sitter Native Module

**Status:** `web-tree-sitter` loads native WASM/compiled components. Failure falls back to regex analysis but no explicit warning in normal operation.

**Evidence:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/planning-server.cjs:71-74` - degraded mode signaled via header but not logged prominently.

**Risk:** Code analysis quality reduced without user knowledge.

**Mitigation:** Console.warn on startup if AST unavailable. Include in `/health` response (already done). Consider making AST mandatory with clear installation instructions.

---

## Test Coverage Gaps

### Coverage Ratio

**Statistics:** 64 source files in `bin/lib/` vs 45 test files in `tests/`. Approximately 70% file coverage, but function/lines likely lower due to large monolithic files.

**Gaps:**
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl-audit.cjs` - No dedicated test file visible
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/policy-grant-cache.cjs` - No test
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/context-artifact.cjs` - No test

---

### Stub-Only Tests

**Issue:** Some tests contain TODO placeholders or stub implementations awaiting real code.

**Files:**
- `/home/bamn/get-stuff-done/tests/second-brain-grant.test.cjs` - Contains placeholder tests
- `/home/bamn/get-stuff-done/tests/copilot-install.test.cjs` - Contains stubs

**Impact:** Coverage numbers may be misleading if tests don't assert real behavior.

**Fix approach:** Replace stubs with real assertions. Track TODO tests with `*.TODO.test.cjs` naming until implemented.

---

### Missing Integration Tests

**Gap:** Heavy focus on unit tests for individual modules. Missing end-to-end workflow tests that span multiple modules (e.g., full discuss → plan → execute cycle with real filesystem).

**Impact:** Integration-level bugs not caught until manual testing.

**Fix approach:** Add integration test suite using `tmp` directories, spawning subprocesses, validating `.planning/` state transitions. Reference: Phase 42 planning-server integration tests as model.

---

### No Contract Tests for External Interfaces

**Gap:** No contract tests verifying Plane API interaction, Firecrawl protocol compliance, or RabbitMQ message formats against external schemas.

**Impact:** Breaking changes in external services cause runtime failures not caught pre-deploy.

**Fix approach:** Record golden responses from external services. Test against recorded fixtures. Use contract testing frameworks or simple JSON snapshot tests.

---

## Missing Critical Features

### ITL Output Persistence

**Missing:** Clarification decisions, ambiguity assessments, research cues from discuss-phase are not persisted to disk. New context (plan-phase) cannot recover them after session reset.

**Impact:** Cross-session continuity broken. User must re-answer clarifications if context cleared.

**Recommended location:** `{phase_dir}/{padded_phase}-ITL.json` alongside CONTEXT.md.

---

### Plane Sync Audit Trail

**Missing:** No record of Plane sync operations in STATE.md or logs. Cannot tell when ROADMAP was last synced, what issues were created/updated, or if sync failed.

**Impact:** Users cannot diagnose Plane desynchronization.

**Recommendation:** Add `plane_sync` section to STATE.md with last sync timestamp, issue counts, errors.

---

### Checkpoint Versioning and Migration

**Missing:** Multiple checkpoint schema versions exist with no migration path. Old checkpoints cannot be upgraded automatically.

**Impact:** Checkpoints from older phases may fail validation in newer versions. Manual editing required.

**Recommendation:** Add version field to checkpoints. Implement upgrade functions (e.g., v1 → v2 adds `narrative_task_hash`). Document breaking changes across versions.

---

### Health Check Comprehensive Reporting

**Missing:** `/health` endpoint reports AST status but not other subsystems (Second Brain connectivity, Broker status, Firecrawl availability, Plane API reachability).

**Impact:** Health check gives incomplete picture of system readiness.

**Recommendation:** Extend `/health` to include:
- `second_brain: { status: "ok"/"degraded"/"offline", backend: "postgres"/"sqlite" }`
- `broker: { status: "connected"/"disconnected" }`
- `firecrawl: { reachable: boolean }` (optional)
- `plane: { api_ok: boolean }` (if configured)

---

### Configuration Validation on Load

**Missing:** `config.cjs` loads environment variables with defaults but does not validate combinations (e.g., `PLANNING_SERVER_TOKEN` required when `PLANNING_SERVER_AUTH_MODE=mandatory`).

**Impact:** Misconfiguration leads to runtime errors that could be caught earlier.

**Recommendation:** Add `validateConfig()` function that checks invariants and emits warnings/errors on startup. Include checks: token present when mandatory, numeric envs parse correctly, directory paths exist.

---

## Configuration Debt

### Environment Variable List Is Scattered

**Issue:** Environment variables documented in multiple places (README, docs, code) with inconsistencies. No single source of truth.

**Example vars:**
- `PLANNING_SERVER_TOKEN`, `PLANNING_SERVER_AUTH_MODE`, `PLANNING_SERVER_INSECURE_LOCAL`
- `GSD_PLANNING_PORT`, `GSD_PLANNING_HOST`, `GSD_PLANNING_CORS_ORIGINS`
- `PLANE_API_KEY`, `PLANE_API_URL`, `PLANE_PROJECT_ID`, `PLANE_RATE_LIMIT_RPM`
- `FIRECRAWL_API_KEY`, `FIRECRAWL_API_URL`, `FIRECRAWL_RATE_LIMIT_RPM`
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `DATABASE_URL`

**Fix:** Create `docs/ENVIRONMENT-VARIABLES.md` with comprehensive table (name, purpose, default, required, security level). Reference it from README.

---

### Logging Not Structured

**Issue:** All logging uses `console.warn`/`console.error` with free-form messages. No JSON output, no log levels, no correlation IDs.

**Impact:** Difficult to parse logs programmatically. No request tracing across services. No aggregation into observability platforms (Datadog, Loki).

**Recommendation:** Introduce structured logger (pino, winston) with JSON output behind `GSD_LOG_FORMAT=json` flag. Include request ID in planning-server requests. Document log fields.

---

## Deployment Concerns

### No Process Manager Configuration

**Issue:** Planning server and Second Brain are long-running processes but no provided systemd, pm2, or Docker configurations. Users must figure out how to keep them running.

**Impact:** Poor production UX. Unreliable local development (server crashes require manual restart).

**Fix:** Provide `deploy/` directory with:
- `systemd/gsd-planning.service`
- `docker-compose.yml` for Postgres + RabbitMQ + Planning Server + Firecrawl
- `pm2/ecosystem.config.js`

---

### Port Conflicts Undocumented

**Issue:** Default ports: Planning Server 3011, Firecrawl 3002, Plane 3003 (if local). No detection or warning if ports already in use.

**Impact:** Startup failures that users must diagnose manually.

**Fix:** Add port checking on startup. If port occupied, suggest `GSD_PLANNING_PORT=...` or kill existing process. Emit error with remediation steps.

---

## Observability Gaps

### No Metrics Export Beyond Prometheus Text

**Issue:** Planning server exposes `/metrics` in Prometheus text format but no Grafana dashboard or alerting rules. Users must build own dashboards.

**Impact:** precious metrics not used. No alerting on error spikes, auth failures, rate limiting events.

**Fix:** Provide `monitoring/` directory with:
- `grafana/dashboard.json`
- `prometheus/alert-rules.yml`
- `README.md` explaining what each metric means and alert thresholds

---

### No Distributed Tracing

**Issue:** System has multiple processes (planning-server, brokers, external APIs) but no trace IDs propagated. Cannot follow request across service boundaries.

**Impact:** Debugging cross-process issues extremely difficult.

**Recommendation:** Implement trace context propagation using `traceparent` header (W3C Trace Context). Generate trace IDs in planning-server, pass to downstream calls (Firecrawl, Plane). Log trace ID with every message.

---

## Conclusion

This codebase exhibits signs of rapid growth without corresponding architectural discipline. The most critical concerns are:

1. **Silent failures** (escalate to top priority)
2. **Enforcement boundary erosion** (security/quality impact)
3. **Architectural drift** (documentation vs reality)
4. **Large file maintainability** (developer productivity)
5. **State machine gaps** (reliability)

Addressing these in order will dramatically improve system robustness. The detailed fix approaches described above can be converted into remediation tickets.
