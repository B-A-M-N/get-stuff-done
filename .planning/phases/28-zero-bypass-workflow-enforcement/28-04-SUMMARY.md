---
phase: 28
plan: 04
subsystem: enforcement
tags: [zero-bypass, firecrawl, agent-purge, ENFORCE-06]
dependency-graph:
  requires: ["28-03"]
  provides: ["ENFORCE-06-complete", "researcher-prompt-purged"]
  affects: []
tech-stack:
  added: []
  patterns:
    - "Firecrawl control plane as exclusive external discovery gateway"
    - "No native WebSearch/WebFetch tools used in researcher prompt"
key-files:
  - path: "agents/gsd-project-researcher.md"
    modifications:
      - "Removed all WebSearch/WebFetch/brave_search references"
      - "Replaced with Firecrawl search/extract"
      - "Updated tool strategy, verification protocol, confidence levels"
      - "Updated source priority hierarchy to: Context7 → Official Docs → Firecrawl (verified) → Firecrawl (unverified)"
decisions: []
metrics:
  duration: "2 minutes"
  completed: "2026-03-23T08:01:53Z"
  tasks: 2
  files_modified: 1
---

# Phase 28 Plan 04: Finalize Agent Prompt Purge (ENFORCE-06) — Summary

**One-liner:** Removed all WebSearch/WebFetch references from `gsd-project-researcher` agent and enforced Firecrawl control plane as the exclusive external discovery mechanism.

## Tasks Completed

| Task | Name | Commit | Changes |
|------|------|--------|---------|
| 1 | Remove WebSearch/WebFetch references from researcher prompt | eaa3e23 | agents/gsd-project-researcher.md (17 additions, 33 deletions) |
| 2 | Verify no other agent or doc files contain forbidden references | fee2d90 | No file changes; verification findings documented |

## Deviations from Plan

### Plan Execution: Within Scope

- Task 1 executed exactly as specified: surgical removal of deprecated search tool references from `agents/gsd-project-researcher.md`.
- File now contains explicit `firecrawl search` and `firecrawl extract` usage guidance.
- All verification checks for researcher prompt pass:
  ```bash
  grep -qE "WebSearch|WebFetch|cmdWebsearch" agents/gsd-project-researcher.md  # returns false
  grep -q "firecrawl search\|firecrawl extract" agents/gsd-project-researcher.md  # returns true
  ```

### Issues Identified: Out of Scope

Task 2 verification discovered that other agent prompts and documentation still contain WebSearch/WebFetch references. These are not part of this plan's scope (which targeted only `gsd-project-researcher.md`) but must be addressed to achieve the phase-wide zero-bypass guarantee.

**Affected files:**

- `agents/gsd-debugger.md` — tools list includes `WebSearch`
- `agents/gsd-phase-researcher.md` — extensive use of `WebSearch`, `WebFetch`, `brave_search`, degraded mode fallbacks
- `agents/gsd-planner.md` — tools list includes `WebFetch`
- `agents/gsd-ui-researcher.md` — tools list includes `WebSearch`, `WebFetch`
- `docs/ARCHITECTURE.md` — mentions `WebSearch` in allowed tools
- `docs/AGENTS.md` — tool tables include `WebSearch`, `WebFetch` entries

These will require separate remediation plans (likely in future waves of Phase 28 or Phase 29). No auto-fix was attempted here to respect scope boundaries.

## Verification

### Automated Checks (performed)

```bash
# 1. Researcher prompt clean of forbidden patterns
! grep -qE "WebSearch|WebFetch|cmdWebsearch" agents/gsd-project-researcher.md  # PASS

# 2. Firecrawl references present
grep -q "firecrawl search" agents/gsd-project-researcher.md  # PASS
grep -q "firecrawl extract" agents/gsd-project-researcher.md  # PASS

# 3. Global scan for leftovers in other agents/docs
grep -rE "WebSearch|WebFetch|cmdWebsearch" agents/ docs/  # Found matches (documented above)
```

### Manual Review

The `agents/gsd-project-researcher.md` prompt now:
- Uses only Firecrawl for external data retrieval
- Has no native `WebSearch` or `WebFetch` tool access
- Provides clear query templates for `firecrawl search`
- References Firecrawl Control Plane (localhost:3002) as exclusive gateway
- Verification protocol and confidence levels are updated to Firecrawl terminology

## Self-Check

- [x] Summary file created at expected path
- [x] Commits exist: `eaa3e23` (Task 1), `fee2d90` (Task 2)
- [x] Modified file `agents/gsd-project-researcher.md` exists with changes
- [x] All required verification commands executed and captured

**Status:** PASSED for scope; deferred issues documented.
