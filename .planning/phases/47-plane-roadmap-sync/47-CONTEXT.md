# Phase 47: Plane Roadmap & Issue Hierarchy Sync

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend Plane sync to include ROADMAP.md → Plane milestones + issues, creating full project visibility. This is a one-way GSD → Plane synchronization layer; GSD remains the execution/planning source of truth, while Plane is an external tracking surface.

**Key artifacts:**
- `roadmap-plane-sync.cjs` adapter
- Milestone creation from GSD phases
- Issue creation from GSD plans with status mapping
- Reconciliation logic for drift

**Success criteria:**
- Plane shows all phases as milestones with correct goals
- Each plan appears as an issue in the correct milestone
- Issue status (todo/in-progress/done) matches ROADMAP.md
- Manual Plane edits do not break GSD (one-way sync)

**Dependencies:** Phase 46 complete

**Out of scope:** Checkpoint/comment sync (Phase 48)

</domain>

<decisions>
## Implementation Decisions

### Milestone Mapping Strategy
**Pick A: One Plane milestone per GSD milestone.**
- `ROADMAP milestone (v0.3.0)` → `Plane milestone (v0.3.0)`
- Phases and/or plans live as issues under that milestone
- Semantically aligned: Plane milestones are release-oriented, matching GSD's versioned milestones
- Keeps milestone count sane; preserves abstraction boundary

### Issue Creation Granularity
**Both, with asymmetry:**
- **Phase = parent issue** (provides roadmap-level tracking)
- **Plan = child issue / sub-issue** (provides execution/audit detail)

**If Plane's parent-child model is limited:** fallback to phase issues only; plans remain inside GSD artifacts (not ideal but acceptable).

**Issue content requirements:**

*Phase issue:*
- phase number
- title
- goal/summary
- milestone version
- status rollup
- link/reference to local planning artifacts (repo-relative paths)
- child plan count

*Plan issue:*
- plan id
- parent phase reference
- atomic task scope
- acceptance/verification summary
- completion metadata
- summary artifact path
- commit SHA (when available)

### Status Mapping & Reconciliation

**Status mapping (one-way GSD → Plane):**
- `[Planned]` → `Todo`
- `[Research]` → `Backlog` or `Todo`
- `[Discussed]` → `Todo` with label `discussed`
- `[In Progress]` → `In Progress`
- `[Blocked]` → `Blocked`
- `[Complete]` / `[Verified]` → `Done`

**Use labels for nuance** if Plane supports them (e.g., `discussed`, `ready`, `verified`). If custom states are available, add: `Research`, `Ready for Execution`, `Verified`.

**Drift handling:**
- Detect drift when Plane fields differ from GSD
- Skip overwriting protected fields by default
- Log warning and continue (does not block sync)
- Provide `--force` flag to override and overwrite

**Authority definition:**
- GSD is authoritative for: milestone assignment, canonical status, titles/ids, phase/plan structure
- Plane may own: comments, assignee, estimate, external labels not reserved by GSD

**Conflict resolution:**
- Protected field mismatch → log drift, skip overwrite unless `--force`
- Continue syncing other unaffected items

### Sync Trigger & Timing

**Pick: deterministic triggers, not background polling.**

1. **Manual command is canonical:** `gsd-tools roadmap-sync` (full reconciliation pass)
2. **On-write hooks for best-effort freshness:**
   - Hook on `ROADMAP.md` write → sync milestones + phase structure
   - Hook on `SUMMARY.md` completion → sync status + completion data
3. **No background periodic sync** (avoids failure modes, duplicate writes, timing ambiguity)

**Operational model:**
- Roadmap mutation triggers opportunistic sync
- Phase completion triggers status update
- On-demand manual command for full reconciliation
- All sync operations are async best-effort, non-blocking (consistent with Phase 45)

### Data Enrichment & Links

**Include in Plane issues:**
- `Synced from GSD` label/tag
- Stable external ID fields:
  - `gsd_milestone_version`
  - `gsd_phase_number`
  - `gsd_plan_id`
  - `gsd_sync_version`
  - `gsd_last_synced_at`
- **Repo-relative artifact paths** (not raw `file://` URIs)
- Commit SHA or commit range when available
- Provenance block in description indicating sync source and timestamp

**Avoid:**
- Raw `file://` links as primary UX (brittle, useless from hosted Plane, environment-dependent)
- If artifact resolution needed later, use Firecrawl/Planning Server layer to translate repo paths to accessible URLs

**Description template:**

*Phase issue:*
```
# Phase X: [Title]

**Milestone:** v0.X.0
**Status:** [Current GSD status]
**Goal:** [Short goal from ROADMAP]

## Child Plans
- [Plan list with links if available]

## Artifacts
- Phase directory: .planning/phases/XX-slug/
- ROADMAP reference: (line/section)

---
*Synced from GSD on 2026-03-25 · gsd_phase_number=47 · gsd_milestone_version=v0.4.0*
```

*Plan issue:*
```
# Plan XX-YZ: [Title]

**Parent Phase:** Phase X
**Plan ID:** XX-YZ
**Scope:** [Atomic task description]

## Verification
- [Acceptance criteria from PLAN.md]

## Completion
- Status: [Done/In Progress]
- Summary: .planning/phases/.../XX-YZ-SUMMARY.md
- Commit: abc123def (if available)

---
*Synced from GSD on 2026-03-25 · gsd_plan_id=XX-YZ · gsd_phase_number=X*
```

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Sync Specification
- `.planning/ROADMAP.md` — Phase structure, milestone grouping, status conventions
- `.planning/STATE.md` — State tracking patterns (for consistency, not direct use)

### Phase Context
- `.planning/phases/45-plane-augmented-context-control/CONTEXT.md` — Phase 45 decisions: Plane client patterns, async best-effort, fire-and-forget, audit logging
- `.planning/phases/46-firecrawl-context-integration/CONTEXT.md` — Phase 46 decisions: unified context layer, Firecrawl API patterns

### Implementation References
- `get-stuff-done/bin/lib/plane-client.cjs` — Existing PlaneClient singleton with rate limiting, retry, audit, updateProjectMetadata
- `get-stuff-done/bin/lib/roadmap.cjs` — ROADMAP.md parsing functions (cmdRoadmapGetPhase, cmdRoadmapAnalyze)
- `get-stuff-done/bin/lib/state-plane-sync.cjs` — Pattern for state change notification (fire-and-forget, error swallowing)

### Project Requirements
- `.planning/REQUIREMENTS.md` — Requirements PLANE-VISIBILITY-02, PLANE-SYNC-02 (traceability)

### External Documentation
- Plane API documentation (to be discovered/researched by agent): endpoints for creating milestones (`POST /projects/{id}/milestones`) and issues (`POST /projects/{id}/issues`), parent-child linking, custom fields

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `plane-client.cjs` — Singleton PlaneClient with:
  - `_makeRequest` (native HTTPS, timeout, error handling)
  - `_request` wrapper (rate limiting token bucket, retry 3x exponential backoff, audit logging in finally)
  - `updateProjectMetadata(metadata)` — existing update method
  - Config via env vars: `PLANE_API_URL` (default localhost:3003), `PLANE_API_KEY`, `PLANE_PROJECT_ID`
  - Async best-effort pattern: errors don't bubble to caller
- `roadmap.cjs` — Parsing functions:
  - `cmdRoadmapGetPhase(cwd, phaseNum)` — extracts phase section, goal, success criteria
  - `cmdRoadmapAnalyze(cwd)` — full roadmap analysis, phase list with metadata
  - Internal: `findPhaseInternal`, `stripShippedMilestones`, `replaceInCurrentMilestone`
- `state-plane-sync.cjs` — Pattern for notification hooks:
  - `notifyStateChange(cwd, statePath)` — extracts fields, calls planeClient, fire-and-forget with error swallowing
- `state.cjs` — Integration point: wrapper around `writeStateMd` that calls `planeSync.notifyStateChange`

### Established Patterns
- **Fire-and-forget async:** Call async function, `.catch(() => {})` to swallow errors; never block main flow
- **Audit logging:** Record in `_request` finally block with `secondBrain.recordFirecrawlAudit({ action: 'plane-{action}', ... })`
- **Rate limiting:** Token bucket per hostname; default 60 RPM via `PLANE_RATE_LIMIT_RPM`
- **Retry policy:** 3 attempts max, exponential backoff (1s, 2s, 4s base) + jitter (0-200ms); no retry on HTTP 4xx
- **Config via env vars:** Sensible defaults, overrideable, validation by presence checks
- **Safe file operations:** Use `safeFs` from `core.cjs` for all filesystem access
- **Error handling:** Log warnings with context, continue; never throw from sync notifiers

### Integration Points
- **state.cjs** — Provides pattern for integrating sync hooks; similar approach needed for ROADMAP sync (either hook into roadmap write command or provide separate notifier)
- **command structure:** GSD commands live in `bin/gsd-tools.cjs` or as standalone modules; roadmap commands exist in `roadmap.cjs`
- **write tracking:** Hook should fire after successful write to ROADMAP.md (using `safeWriteFile` wrapper pattern)
- **Testing:** Unit tests in `tests/` directory using `node:test`, `assert`, env var manipulation, require cache invalidation; mock `_makeRequest` not `secondBrain.audit`

</code_context>

<specifics>
## Specific Ideas

- Sync should be **idempotent** — running `gsd-tools roadmap-sync` multiple times should produce same Plane state (use Plane's upsert semantics if available)
- Consider implementing **reconciliation mode** that scans Plane for drift and reports differences without syncing
- If Plane API doesn't support parent-child issue linking cleanly, use **custom fields** or **labels** to establish relationship (e.g., `gsd_parent_phase=12`)
- Protect synced issues from accidental deletion via "Synced from GSD" tag or by storing GSD IDs in immutable custom fields
- **Do not** attempt to mirror every minor detail; focus on visibility, not perfection

</specifics>

<deferred>
## Deferred Ideas

- Plane checkpoint/comment sync (Phase 48)
- Plane webhooks for Plane → GSD triggers (Phase 49)
- Firecrawl plane source adapter (allows GSD agents to read Plane data via Firecrawl) — out of scope for roadmap sync, could be separate phase
- Full artifact path resolution via Planning Server URL (would require exposing planning server externally or using tunnels)
- Bi-directional sync for comments/assignee (explicitly rejected; out of scope)

</deferred>

---

*Phase: 47-plane-roadmap-sync*
*Context gathered: 2026-03-25*
