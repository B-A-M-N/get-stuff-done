---
phase: 28
plan: 01
type: standard
status: complete
date: 2026-03-21
requirements_completed:
  - ENFORCE-01
  - ENFORCE-02
---

# Summary 28-01: Search Purge and Schema Hardening

Purged deprecated search tools and hardened the execution summary schema.

## Accomplishments
- Removed `WebSearch` and `WebFetch` tools from all agent prompts.
- Made Firecrawl the exclusive external fetch mechanism.
- Removed deprecated `websearch` CLI command.
- Updated `executionSummarySchema` to mandate `context_artifact_ids` for Phase 28+.
- Updated `templates/summary.md` to include `context_artifact_ids`.

## Evidence
- `tests/summary-contract.test.cjs` passes with backward compatibility for older phases.
- Agent prompts instruct exclusive use of Firecrawl or explicitly fail.
