# Phase 53: Second Brain Connection & Fallback Hardening - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** `gsd:discuss-phase 53`

<domain>
## Phase Boundary

Phase 53 hardens Second Brain service behavior.

This phase is about:
- deterministic Postgres to SQLite degradation behavior
- explicit degraded-state truth surfaces
- warning-noise suppression
- command classification for fail-hard memory-critical cases
- deterministic test posture for local versus explicit Postgres integration runs

This phase is not about:
- making models use Second Brain directly
- adding GenAI toolkit MCP integration
- expanding Firecrawl or Plane capabilities
- making SQLite semantically equivalent to Postgres

Model-facing memory integration belongs to Phase 54.
</domain>

<decisions>
## Implementation Decisions

### Failure Posture
- Default commands degrade to SQLite when Postgres auth, pool, or connectivity fails.
- Commands explicitly marked memory-critical must fail hard when Postgres semantics are required for correctness.
- Degradation must never be silent.
- The governing invariant is: degrade for continuity, surface for truth.

### Noise Policy
- Emit one concise degraded warning per process or run.
- Do not repeat identical user-facing degraded warnings once fallback is already known.
- If the degradation reason changes, one new concise warning may be emitted.
- Keep detailed failure context available through debug or health surfaces instead of normal command output.

### Operator Surface
- Ship both `brain status` and `brain health`.
- `brain status` is the primary operator-facing summary.
- `brain health` is the detailed machine-oriented diagnostic surface.
- Provide a short degraded runbook/help message when the brain is degraded.

### Test Contract
- Baseline local tests must run cleanly without Postgres.
- Postgres integration tests must require explicit env or config opt-in.
- Runtime may auto-attempt Postgres when configured, but normal commands must degrade cleanly without spam if Postgres is unavailable.
- Memory-critical commands still fail hard when Postgres is unavailable.

### Backend State Model
- The implementation must maintain explicit backend state instead of inferring mode from scattered warnings.
- Required state fields:
  - `configured_backend`
  - `active_backend`
  - `degraded`
  - `degraded_reason`
  - `warning_emitted`
  - `memory_critical_blocked`

### Command Classification
- Standard commands may degrade to SQLite and continue.
- Memory-critical commands must explicitly declare that they require Postgres-backed semantics.
- If a memory-critical command runs without Postgres availability, it must fail deterministically instead of silently using SQLite.

### Acceptance Criteria
- Postgres outage does not crash normal commands.
- Degraded state is visible in `brain status` and `brain health`.
- Repeated degraded operations do not emit repeated warnings.
- Local no-Postgres baseline tests pass cleanly.
- Explicit Postgres integration tests only run when opted in.
- Memory-critical commands fail hard with an explicit reason.

### Kill Tests
- Postgres unavailable at startup: one concise degraded warning, SQLite active, normal commands continue.
- Repeated degraded operations: no repeated warning spam.
- Status truthfulness: `brain status` and `brain health` both report the actual active backend and reason.
- Memory-critical command block: hard failure without SQLite fallback for that command.
- Local no-Postgres test run: clean baseline pass.
- Explicit Postgres integration run: exercises Postgres path only under explicit opt-in.
- Failure reason change: one new warning allowed when the reason changes.

### Non-Goals
- Do not hide degraded state.
- Do not aggressively retry until logs become noisy.
- Do not make all commands memory-critical.
- Do not require Postgres for baseline local development.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Milestone And Phase Contract
- `.planning/PROJECT.md` — defines `v0.5.0` milestone intent and why service hardening comes before model-facing memory.
- `.planning/ROADMAP.md` — Phase 53 goal, dependency on Phase 50, and current milestone ordering.
- `.planning/REQUIREMENTS.md` — `BRAIN-OPS-01`, `BRAIN-OPS-02`, and `BRAIN-OPS-03`.
- `.planning/STATE.md` — current blockers and the existing warning/noise context that Phase 53 is meant to resolve.

### Existing Memory Implementation
- `get-stuff-done/bin/lib/second-brain.cjs` — current Postgres, SQLite fallback, audit, and close behavior.
- `get-stuff-done/bin/lib/brain-manager.cjs` — current brain health surface and integration posture.
- `get-stuff-done/bin/gsd-tools.cjs` — current `brain health` route and likely CLI integration point for `brain status`.

### Existing Tests And Warning Sources
- `tests/checkpoint-plane-sync.test.cjs` — currently calls `secondBrain.close()` in teardown and shows degraded-noise symptoms.
- `tests/summary-plane-sync.test.cjs` — same teardown pattern and warning surface.
- `tests/second-brain-grant.test.cjs` — existing direct coverage of Second Brain behavior.

### Adjacent Architecture Direction
- `docs/ARCHITECTURE-V0.4.0.md` — migration path and local memory architecture assumptions that Phase 53 must stabilize rather than replace.
</canonical_refs>

<code_context>
## Code Context

Current repo evidence relevant to Phase 53:

- `get-stuff-done/bin/lib/second-brain.cjs` is a singleton and currently:
  - attempts Postgres setup eagerly
  - falls back to SQLite from many individual call sites
  - emits repeated warnings for the same degraded condition
  - exposes `close()` that ends the pool and closes SQLite
- repeated local test runs currently surface:
  - `SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`
  - `sorry, too many clients already`
  - `Cannot use a pool after calling end on the pool`
- `get-stuff-done/bin/lib/brain-manager.cjs` currently provides only a coarse `brain health` check and does not expose the explicit degraded backend state the user requested.
- `get-stuff-done/bin/gsd-tools.cjs` already has a `brain health` command surface, so Phase 53 should extend that pattern rather than inventing a separate subsystem UI.

This means the real technical target is not “add fallback,” but:
- centralize degradation state
- suppress duplicate warnings
- separate normal degraded operation from true failures
- make the operator surface truthful and concise
</code_context>

<specifics>
## Specific Ideas

- Preferred implementation posture: strict truth, soft dependency.
- Recommended plan split for later planning:
  - backend state and fallback controller
  - operator surface
  - memory-critical command classification
  - test harness and warning regression coverage
- If the planner can keep this in one plan cleanly, it still must preserve those four concerns explicitly.

- Desired concise degraded warning:

```text
Brain degraded: Postgres unavailable, using SQLite fallback.
```

- Desired status shape:

```json
{
  "configured_backend": "postgres",
  "active_backend": "sqlite",
  "degraded": true,
  "degraded_reason": "postgres_auth_failed",
  "warning_emitted": true,
  "memory_critical_blocked": false
}
```
</specifics>

<deferred>
## Deferred Ideas

- Model-facing Second Brain retrieval and writeback through the GenAI toolkit MCP.
- Merging curated prior execution memory into planning context.
- Any expansion of Firecrawl, Plane, or model-facing memory behavior beyond service hardening.
- Broader database abstraction work beyond the explicit Phase 53 operator and degradation contract.
</deferred>

---

*Phase: 53-second-brain-connection-fallback-hardening*
*Context gathered: 2026-03-26 via discuss-phase*

<!-- GSD-AUTHORITY: 53-01-1:a7134dcf6454605419184bab63d6d05a6ef5ae67ec367e6b2ba781ab8f4d78ab -->
