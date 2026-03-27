# Phase 53: Second Brain Connection & Fallback Hardening - Research

**Researched:** 2026-03-26
**Domain:** Second Brain backend lifecycle, deterministic Postgres-to-SQLite fallback, operator health surfaces
**Confidence:** HIGH

## User Constraints

### Locked Decisions
- Default commands degrade to SQLite when Postgres auth, pool, or connectivity fails.
- Commands explicitly marked memory-critical must fail hard when Postgres semantics are required for correctness.
- Degradation must never be silent.
- The governing invariant is: degrade for continuity, surface for truth.

- Emit one concise degraded warning per process or run.
- Do not repeat identical user-facing degraded warnings once fallback is already known.
- If the degradation reason changes, one new concise warning may be emitted.
- Keep detailed failure context available through debug or health surfaces instead of normal command output.

- Ship both `brain status` and `brain health`.
- `brain status` is the primary operator-facing summary.
- `brain health` is the detailed machine-oriented diagnostic surface.
- Provide a short degraded runbook/help message when the brain is degraded.

- Baseline local tests must run cleanly without Postgres.
- Postgres integration tests must require explicit env or config opt-in.
- Runtime may auto-attempt Postgres when configured, but normal commands must degrade cleanly without spam if Postgres is unavailable.
- Memory-critical commands still fail hard when Postgres is unavailable.

- The implementation must maintain explicit backend state instead of inferring mode from scattered warnings.
- Required state fields:
  - `configured_backend`
  - `active_backend`
  - `degraded`
  - `degraded_reason`
  - `warning_emitted`
  - `memory_critical_blocked`

- Standard commands may degrade to SQLite and continue.
- Memory-critical commands must explicitly declare that they require Postgres-backed semantics.
- If a memory-critical command runs without Postgres availability, it must fail deterministically instead of silently using SQLite.

- Postgres outage does not crash normal commands.
- Degraded state is visible in `brain status` and `brain health`.
- Repeated degraded operations do not emit repeated warnings.
- Local no-Postgres baseline tests pass cleanly.
- Explicit Postgres integration tests only run when opted in.
- Memory-critical commands fail hard with an explicit reason.

- Postgres unavailable at startup: one concise degraded warning, SQLite active, normal commands continue.
- Repeated degraded operations: no repeated warning spam.
- Status truthfulness: `brain status` and `brain health` both report the actual active backend and reason.
- Memory-critical command block: hard failure without SQLite fallback for that command.
- Local no-Postgres test run: clean baseline pass.
- Explicit Postgres integration run: exercises Postgres path only under explicit opt-in.
- Failure reason change: one new warning allowed when the reason changes.

- Do not hide degraded state.
- Do not aggressively retry until logs become noisy.
- Do not make all commands memory-critical.
- Do not require Postgres for baseline local development.

### Claude's Discretion
None provided in `53-CONTEXT.md`.

### Deferred Ideas (OUT OF SCOPE)
- Model-facing Second Brain retrieval and writeback through the GenAI toolkit MCP.
- Merging curated prior execution memory into planning context.
- Any expansion of Firecrawl, Plane, or model-facing memory behavior beyond service hardening.
- Broader database abstraction work beyond the explicit Phase 53 operator and degradation contract.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BRAIN-OPS-01 | Second Brain connection initialization MUST avoid noisy repeated Postgres auth/pool failures and degrade deterministically to SQLite with an explicit operator-visible reason. | Use a single backend-state controller, one-time warning emission keyed by degraded reason, lazy Postgres transition logic, and truthful `brain status` / `brain health` surfaces. |
| BRAIN-OPS-02 | Memory-dependent commands and tests SHALL close or reuse Second Brain resources cleanly so fallback noise does not mask real failures or exhaust local connection limits. | Make `close()` idempotent, avoid reusing ended pools, centralize lifecycle resets for tests, and gate Postgres integration tests behind explicit opt-in. |
| BRAIN-OPS-03 | The system SHALL expose a concise operational health and runbook surface for Second Brain mode, active backend, and degraded-state cause. | Add a human-facing `brain status`, expand `brain health` to include backend truth fields and failure details, and attach a short degraded runbook/help payload. |

## Summary

Phase 53 should not add another fallback path. It should replace the current scattered fallback behavior in `get-stuff-done/bin/lib/second-brain.cjs` with one authoritative backend state machine that owns: initial backend selection, degradation reason, one-time warning emission, memory-critical blocking, and clean teardown. Right now the file attempts Postgres work eagerly in the constructor, falls back from many individual methods, and exposes `close()` as a raw `pool.end()` plus SQLite close. That shape is what creates repeated warnings, stale pool reuse, and nondeterministic behavior across CLI runs and tests.

The repo already has the right direction in adjacent work: Phase 50 introduced truthful operator status derived from canonical state instead of inferring health from console noise, and the current CLI already exposes `brain health`. Phase 53 should apply that same pattern to Second Brain: keep degraded operation for continuity, but move all backend truth into explicit state surfaced by `brain status` and `brain health`. The status surface should be cheap, deterministic, and stable across repeated calls in a single process.

The safest plan is to keep the existing stack: Node runtime with built-in `node:sqlite`, `pg` for Postgres, and `node:test` for validation. Do not add a new SQLite package or retry framework. Fix the lifecycle and state model first, then add operator surfaces, then classify memory-critical commands, then add tests that prove local baseline runs are silent while explicit Postgres integration remains opt-in.

**Primary recommendation:** Refactor Second Brain around a single explicit backend state object and transition API, then build `brain status`, memory-critical guards, and opt-in integration tests on top of that state instead of on top of warning strings.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js runtime | 22.22.1 in repo, current docs at 25.8.2 | Built-in `node:sqlite`, `node:test`, CLI runtime | The repo already runs on Node and the phase only needs built-ins plus lifecycle fixes, not new infrastructure. |
| `pg` | 8.20.0 | Postgres connection pool and client lifecycle | Official `pg` pool supports explicit error handlers, pool metrics, and `pool.end()` shutdown semantics needed for deterministic CLI/test cleanup. |
| `node:sqlite` | built-in (`DatabaseSync`) | SQLite fallback store | Already used in repo; built into the runtime; avoids adding `better-sqlite3` or a second SQLite binding. |
| `node:test` | built-in | Unit and integration test runner | The repo already uses it everywhere; hooks and CLI filtering are sufficient for this phase. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `c8` | 11.0.0 | Optional focused coverage for the new backend-state tests | Use only if the planner wants a narrow coverage gate for the new lifecycle/state module. |
| `amqplib` | 0.10.9 | Existing broker dependency adjacent to `brain health` | Only relevant if `brain health` keeps reporting broker state beside backend truth. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in `node:sqlite` fallback | `better-sqlite3` | Adds a dependency and migration cost without solving the actual problem, which is state ownership and lifecycle discipline. |
| Singleton state controller | Per-method fallback checks | This is the current failure mode: repeated warnings, inconsistent degraded truth, and teardown bugs. |
| Explicit command classification | Let every command auto-fallback | Violates the locked requirement that memory-critical commands fail hard when Postgres semantics matter. |

**Installation:**
```bash
# No new package install is required for Phase 53.
# Current verified versions:
# npm view pg version
# npm view amqplib version
```

**Version verification:** `npm view pg version time --json` returned `8.20.0`, published `2026-03-04T23:48:49.439Z`. `npm view amqplib version time --json` returned `0.10.9`, published `2025-08-25T16:34:04.559Z`. The current repo runtime is `Node.js v22.22.1`, and the current official Node docs are `v25.8.2`.

## Architecture Patterns

### Recommended Project Structure
```text
get-stuff-done/bin/lib/
├── second-brain.cjs          # Public API facade kept stable for callers
├── second-brain-state.cjs    # New explicit backend state + transitions
├── brain-manager.cjs         # Detailed health surface consumes state
└── commands.cjs / gsd-tools.cjs
                             # CLI routes classify memory-critical commands

tests/
├── second-brain-state.test.cjs
├── second-brain-status.test.cjs
├── second-brain-lifecycle.test.cjs
└── second-brain-postgres-optin.test.cjs
```

If the planner wants a smaller diff, `second-brain-state.cjs` can remain private inside `second-brain.cjs`, but the state object and transition functions still need to be isolated logically.

### Pattern 1: Single Authoritative Backend State
**What:** Maintain one in-memory state object that every Second Brain operation reads and mutates through explicit transitions.
**When to use:** Always. No method should infer backend mode from logs, missing handles, or ad hoc exceptions.
**Example:**
```javascript
// Source: repo pattern synthesized from get-stuff-done/bin/lib/second-brain.cjs
const state = {
  configured_backend: 'postgres',
  active_backend: 'sqlite',
  degraded: true,
  degraded_reason: 'postgres_auth_failed',
  warning_emitted: true,
  memory_critical_blocked: false,
  last_transition_at: new Date().toISOString(),
};
```

### Pattern 2: Lazy Postgres Acquisition With Explicit Degrade Transition
**What:** Create the pool once, but do not scatter fallback logic across every method. One helper should attempt Postgres work, classify the failure, transition state, emit a concise warning once, and route subsequent non-critical work to SQLite.
**When to use:** For initialization and every operation that can run on either backend.
**Example:**
```javascript
// Source: https://node-postgres.com/apis/pool
// Source: repo adaptation for Phase 53
async function withPostgres(op, { memoryCritical = false } = {}) {
  try {
    return await op(pool);
  } catch (err) {
    const reason = classifyPostgresFailure(err);
    transitionToDegraded(reason);
    if (memoryCritical) throw buildMemoryCriticalError(reason);
    return withSqliteFallback();
  }
}
```

### Pattern 3: Idempotent Resource Teardown
**What:** `close()` and test reset helpers must be safe to call repeatedly. Closing an ended pool or closed SQLite DB should not create secondary failures or future reuse bugs.
**When to use:** In test teardown, CLI exit paths, and any reset hook.
**Example:**
```javascript
// Source: https://node-postgres.com/apis/pool
// Source: https://nodejs.org/api/sqlite.html
async function closeBackendResources() {
  if (state.pool_open) {
    state.pool_open = false;
    await pool.end();
  }
  if (sqliteDb?.isOpen) {
    sqliteDb.close();
  }
}
```

### Pattern 4: Split Status From Health
**What:** `brain status` is concise and human-facing; `brain health` is machine-oriented and detailed.
**When to use:** Always expose both. `status` is for normal CLI use; `health` is for diagnosis and test assertions.
**Example:**
```json
// Source: locked output contract in 53-CONTEXT.md
{
  "configured_backend": "postgres",
  "active_backend": "sqlite",
  "degraded": true,
  "degraded_reason": "postgres_auth_failed",
  "warning_emitted": true,
  "memory_critical_blocked": false
}
```

### Anti-Patterns to Avoid
- **Fallback in every method:** This duplicates warning logic and guarantees drift between methods.
- **Constructor-side eager mutation:** The current constructor kicks off async Postgres work before callers ask for anything. Move backend transitions behind explicit helpers so test and CLI startup are deterministic.
- **Using `offlineMode` and `useSqlite` as the full truth model:** Those booleans are too coarse for operator surfaces and memory-critical blocking.
- **Inferring state from console output:** Status surfaces must come from structured state, not from warnings.
- **Reusing a singleton after raw `pool.end()`:** This is how `Cannot use a pool after calling end on the pool` leaks into unrelated tests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pool lifecycle tracking | Custom socket/accounting around Postgres connections | `pg` pool properties and `pool.end()` semantics | `pg` already exposes `totalCount`, `idleCount`, `waitingCount`, and lifecycle events. |
| SQLite binding selection | New native addon or wrapper package | Existing `node:sqlite` `DatabaseSync` | The runtime already ships it and the repo already depends on it. |
| Warning dedupe via log scraping | Regex against stderr/stdout | Explicit `warning_emitted` + `degraded_reason` state | Log parsing is nondeterministic and cannot power operator truth safely. |
| Test selection | Custom shell globs or ad hoc scripts | Existing `node --test` + `scripts/run-tests.cjs` | The repo already standardizes test enumeration this way across platforms. |

**Key insight:** The hard part here is not connecting to databases. It is making backend truth stable across repeated CLI invocations, test teardown, and mixed success/failure paths. Custom heuristics will recreate the same churn in a different form.

## Common Pitfalls

### Pitfall 1: Reusing a Pool After `pool.end()`
**What goes wrong:** Tests call `secondBrain.close()`, then later code reuses the singleton and hits `Cannot use a pool after calling end on the pool`.
**Why it happens:** The singleton survives in module cache, but its internal pool does not.
**How to avoid:** Make `close()` idempotent and pair it with a deterministic re-init/reset path. Tests that clear require cache should not also inherit ended resources.
**Warning signs:** Failures only appear after one test passes; teardown noise masks unrelated assertions.

### Pitfall 2: Repeated Degrade Warnings
**What goes wrong:** Every failed Postgres call emits another fallback warning, spamming test and CLI output.
**Why it happens:** Fallback is currently triggered from many methods instead of from one state transition.
**How to avoid:** Emit at transition time only. Re-emit only if `degraded_reason` changes.
**Warning signs:** The same auth, pool, or connection error repeats across one process run.

### Pitfall 3: Coarse Health Surfaces
**What goes wrong:** `brain health` says Postgres is in error but does not tell operators whether SQLite is active, whether the process is degraded, or why memory-critical commands are blocked.
**Why it happens:** The current `brain-manager.cjs` reports infrastructure checks, not backend truth.
**How to avoid:** Build health responses from the authoritative backend state and enrich with probe details, not vice versa.
**Warning signs:** Operators have to read console warnings to understand current mode.

### Pitfall 4: Silent Semantic Downgrade
**What goes wrong:** A memory-critical command accidentally runs on SQLite and returns results that look valid but are semantically wrong for the caller.
**Why it happens:** Command-level capability requirements are implicit.
**How to avoid:** Add an explicit `requiresPostgres` or `memoryCritical` declaration at the command boundary and hard-fail before running.
**Warning signs:** Commands differ in correctness depending on backend, but the CLI output does not say so.

### Pitfall 5: Baseline Tests Accidentally Exercising Postgres
**What goes wrong:** Local tests depend on ambient `PG*` or `DATABASE_URL` state and become flaky or noisy.
**Why it happens:** Test setup does not explicitly choose no-Postgres baseline versus opt-in Postgres coverage.
**How to avoid:** Default baseline tests to no Postgres and require a dedicated env flag for integration runs.
**Warning signs:** Test output contains auth or connection-limit errors on machines with no intended Postgres usage.

## Code Examples

Verified patterns from official sources:

### `pg` Pool Error Handling And Shutdown
```javascript
// Source: https://node-postgres.com/apis/pool
pool.on('error', (err, client) => {
  // Idle clients can still emit background errors.
  // Use this only to transition backend state, not to spam logs.
});

await pool.end();
```

### `pg` Pool Metrics For Debug Health
```javascript
// Source: https://node-postgres.com/apis/pool
const snapshot = {
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount,
};
```

### `node:sqlite` Fallback Lifecycle
```javascript
// Source: https://nodejs.org/api/sqlite.html
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(dbPath);
db.exec(schemaSql);
db.close();
```

### Node Test Hooks For Deterministic Teardown
```javascript
// Source: https://nodejs.org/api/test.html
const { describe, beforeEach, afterEach, test } = require('node:test');

describe('second-brain state', () => {
  beforeEach(() => resetBackendState());
  afterEach(async () => { await secondBrain.close(); });

  test('degrades once per reason', async () => {
    // ...
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scattered fallback calls inside many methods | Centralized backend transition controller | Phase 53 should adopt now | Removes warning spam and keeps operator truth consistent. |
| Coarse `brain health` probe output | Split `brain status` and `brain health` backed by explicit state | Pattern established by Plane observability in Phase 50 | Operators can see active backend and degraded cause immediately. |
| Raw singleton teardown | Idempotent close/reset with re-init discipline | Needed now because tests already close the singleton | Prevents ended-pool reuse and connection exhaustion noise. |
| Implicit fallback for all commands | Explicit memory-critical command classification | Required by `53-CONTEXT.md` on 2026-03-26 | Prevents silent semantic corruption when Postgres is required. |

**Deprecated/outdated:**
- Inferring backend mode from `useSqlite` plus console warnings: too coarse for truthful operator surfaces.
- Eager constructor-side Postgres setup as the primary source of state: too nondeterministic for repeated test and CLI runs.

## Open Questions

1. **Which commands must be classified as memory-critical in Phase 53?**
   - What we know: the phase contract requires an explicit hard-fail path, but it does not enumerate command names yet.
   - What's unclear: whether this phase should classify only existing Second Brain write/query commands or also adjacent commands that transitively depend on Postgres semantics.
   - Recommendation: planner should include an inventory step that names concrete commands and introduces one explicit classification API.

2. **Should `brain status` live under `brain` or `second-brain` naming internally?**
   - What we know: `gsd-tools.cjs` already exposes `brain health`, and the locked requirement says ship both `brain status` and `brain health`.
   - What's unclear: whether internal helper modules should keep the older `BrainManager` naming or move to `second-brain-*`.
   - Recommendation: keep CLI names as `brain status` and `brain health`; internal naming can remain stable if state ownership becomes explicit.

3. **How much of `brain-manager.cjs` should survive?**
   - What we know: it currently checks Postgres, RabbitMQ, and Planning Server but does not expose backend truth.
   - What's unclear: whether the planner should extend it or replace most of it with a thinner health facade over `second-brain-state`.
   - Recommendation: preserve the file as the CLI-facing aggregator, but move backend-truth logic into a dedicated state module.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js `node:test` on runtime `v22.22.1` |
| Config file | none - `scripts/run-tests.cjs` enumerates `tests/**/*.test.cjs` |
| Quick run command | `node --test tests/second-brain-grant.test.cjs tests/checkpoint-plane-sync.test.cjs tests/summary-plane-sync.test.cjs tests/plane-health.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRAIN-OPS-01 | Postgres auth/pool/connect failures degrade once, choose SQLite deterministically, and expose explicit degraded reason | unit + integration | `node --test tests/second-brain-state.test.cjs` | ❌ Wave 0 |
| BRAIN-OPS-02 | Singleton resources close/reuse cleanly and baseline tests stay silent without exhausting pool limits | unit | `node --test tests/second-brain-lifecycle.test.cjs tests/checkpoint-plane-sync.test.cjs tests/summary-plane-sync.test.cjs` | ❌ / ✅ mixed |
| BRAIN-OPS-03 | `brain status` and `brain health` report active backend, degraded cause, and runbook/help truthfully | unit + CLI | `node --test tests/second-brain-status.test.cjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/second-brain-grant.test.cjs tests/checkpoint-plane-sync.test.cjs tests/summary-plane-sync.test.cjs tests/plane-health.test.cjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green plus explicit opt-in Postgres run green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/second-brain-state.test.cjs` - covers BRAIN-OPS-01 degraded reason, one-time warning emission, and reason-change re-emit behavior
- [ ] `tests/second-brain-lifecycle.test.cjs` - covers BRAIN-OPS-02 idempotent close/reset and ended-pool non-reuse
- [ ] `tests/second-brain-status.test.cjs` - covers BRAIN-OPS-03 `brain status` and `brain health` truth surfaces plus runbook text
- [ ] `tests/second-brain-postgres-optin.test.cjs` - explicit Postgres integration path gated by env such as `GSD_TEST_POSTGRES=1`
- [ ] Test harness contract: baseline runs should scrub or ignore ambient `PG*` / `DATABASE_URL` unless the opt-in flag is set

## Sources

### Primary (HIGH confidence)
- Official repo code: `get-stuff-done/bin/lib/second-brain.cjs` - current fallback, warning, and teardown behavior
- Official repo code: `get-stuff-done/bin/lib/brain-manager.cjs` - current health surface shape
- Official repo code: `get-stuff-done/bin/gsd-tools.cjs` - current `brain health` CLI entry point
- Official repo tests: `tests/checkpoint-plane-sync.test.cjs`, `tests/summary-plane-sync.test.cjs`, `tests/second-brain-grant.test.cjs`, `tests/second-brain.test.cjs`, `tests/plane-health.test.cjs`
- Official docs: https://node-postgres.com/apis/pool - `pool.connect`, `pool.end`, error events, pool metrics
- Official docs: https://nodejs.org/api/sqlite.html - `DatabaseSync`, `database.close()`, built-in SQLite API
- Official docs: https://nodejs.org/api/test.html - `node:test`, `beforeEach`, `afterEach`, CLI test execution model
- npm registry: `npm view pg version time --json`, `npm view amqplib version time --json` - current package versions and publish dates

### Secondary (MEDIUM confidence)
- `docs/ARCHITECTURE-V0.4.0.md` - current project architecture and existing Postgres/SQLite assumptions
- `.planning/STATE.md` - current blocker description and why Phase 53 exists now

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against current repo runtime, npm registry, and official docs
- Architecture: HIGH - derived from current repo code plus established Phase 50 observability pattern
- Pitfalls: HIGH - directly evidenced by current `second-brain.cjs`, current tests, and the locked phase context

**Research date:** 2026-03-26
**Valid until:** 2026-04-25
