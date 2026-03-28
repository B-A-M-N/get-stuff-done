---
phase: 46
plan: 03
subsystem: firecrawl-context-integration
tags:
  - context
  - firecrawl
  - agents
  - normalization
  - smoke-test
requires:
  - phase: 46-01
    provides:
      - unified-context-spec
      - firecrawl-client-methods
affects:
  - agents
  - documentation
  - testing
provides:
  - unified-firecrawl-context-instructions-for-planner-and-researcher-agents
  - smoke-test-for-end-to-end-context-crawl
  - README alignment for Firecrawl and Plane intent
tech-stack:
  added: []
  patterns:
    - unified-context-spec
    - firecrawl-availability-gate
    - context-crawl-endpoint
key-files:
  created:
    - tests/agent-context-smoke.test.cjs
  modified:
    - README.md
    - agents/gsd-planner.md
    - agents/gsd-phase-researcher.md
    - agents/gsd-project-researcher.md
    - agents/gsd-ui-researcher.md
key-decisions:
  - "Researcher and planner agents should treat Firecrawl as the single context retrieval gateway instead of mixing direct planning reads with ad hoc external search."
  - "Firecrawl is both retrieval transport and normalization boundary, so agent instructions must construct a unified source spec and call /v1/context/crawl."
patterns-established:
  - "Agent prompts declare a Firecrawl availability gate before context loading."
  - "Agent prompts reference crawl(spec) or POST /v1/context/crawl instead of WebSearch/WebFetch for context gathering."
requirements-completed:
  - FIRECRAWL-CONTROL-02
  - CONTEXT-UNIFY-01
context_artifact_ids: []
duration: unknown
completed: 2026-03-25T09:13:48-05:00
---

# Phase 46 Plan 03: Firecrawl Context Integration — Agent Migration

## One-liner

Migrated planner and researcher agent instructions to the unified Firecrawl context flow and added a smoke test for end-to-end context crawl behavior.

## Summary

This plan moved the planning and research surfaces onto the unified Firecrawl context contract introduced earlier in Phase 46. Instead of treating internal planning reads and external fetches as separate mechanisms, the affected agent prompts now describe a single Firecrawl-mediated context flow built around `crawl(spec)` and `POST /v1/context/crawl`.

## What Was Built

### 1. Agent prompt migration

Updated the following agent prompt files:

- `agents/gsd-planner.md`
- `agents/gsd-phase-researcher.md`
- `agents/gsd-project-researcher.md`
- `agents/gsd-ui-researcher.md`

Each now includes:

- a Firecrawl availability check before context retrieval
- guidance to construct a unified spec with internal and external sources
- explicit references to `/v1/context/crawl` and `crawl(spec)`
- removal of the older mixed narrative that treated ad hoc WebSearch/WebFetch as the context-gathering path for these agent roles

### 2. Smoke test for unified context retrieval

Created `tests/agent-context-smoke.test.cjs` to exercise `firecrawlClient.crawl(spec)` against a minimal spec using `.planning/STATE.md` and `.planning/ROADMAP.md`, asserting artifact presence and basic response shape.

### 3. README alignment

Updated `README.md` so the documented system intent matches the agent migration work:

- Firecrawl is the unified context layer
- Firecrawl acts as the normalization boundary for retrieved context
- Plane is described as the project-sync and visibility surface

## Verification

Repository evidence confirms the migration intent:

- commit `324f2a3` exists for `feat(46-03): migrate researcher/planner agents to unified Firecrawl context`
- affected agent prompt files contain `POST /v1/context/crawl` and `crawl(spec)`
- `tests/agent-context-smoke.test.cjs` exists and calls `firecrawlClient.crawl(spec)`

## Deviations from Plan

### Documentation gap recovered during reconciliation

- **Issue:** The implementation commit for 46-03 existed, but no standalone `46-03-SUMMARY.md` was present in the planning directory.
- **Impact:** Roadmap truth drifted, making Phase 46 appear less complete and less trustworthy than the code history indicated.
- **Resolution:** Reconstructed this summary from commit `324f2a3` and direct inspection of the affected files.

## Outcome

The agent-facing half of Phase 46 is materially present in this repository and can be treated as implemented. Phase 46 as a whole still depends on reconciling the server-side Firecrawl work from `46-02` before the full phase should be marked complete.
