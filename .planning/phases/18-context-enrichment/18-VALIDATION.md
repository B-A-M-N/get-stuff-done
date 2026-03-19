---
phase: 18
slug: context-enrichment
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-17
---

# Phase 18 Validation Strategy: Context Enrichment

**Goal:** Ensure the system automatically harvests ambient project state to auto-resolve or narrow clarifications, and persists ITL results for session continuity.

## Validation Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — scripts/run-tests.cjs auto-discovers *.test.cjs |
| **Quick run command** | `node --test tests/context-enrichment.test.cjs` |
| **Full suite command** | `node scripts/run-tests.cjs` |
| **Estimated runtime** | ~5 seconds (quick), ~35 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/context-enrichment.test.cjs`
- **After every plan wave:** Run `node scripts/run-tests.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Dimension 8: Verification Matrix (Nyquist)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | CONTEXT-01 | unit | `node --test tests/context-enrichment.test.cjs` | ✅ existing | ⬜ pending |
| 18-02-01 | 02 | 1 | CONTEXT-04 | unit | `node --test tests/context-enrichment.test.cjs` | ✅ existing | ⬜ pending |
| 18-03-01 | 03 | 2 | CONTEXT-03 | integration | `node --test tests/context-enrichment.test.cjs` | ✅ existing | ⬜ pending |
| 18-04-01 | 04 | 2 | CONTEXT-02 | unit | `node --test tests/context-enrichment.test.cjs` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/context-enrichment.test.cjs` — created by Plan 01, contains unit tests for context harvesting and persistence logic.
- [x] `gsd-tools.cjs state harvest-context` — defined in Plan 01, allows manual verification of data gathering.

---

## Manual-Only Verifications

| Behavior | Manual Verification Steps | Expected Outcome |
|----------|---------------------------|------------------|
| ITL Persistence | Run `/gsd:discuss-phase` and check phase directory | A `{phase}-ITL.json` file exists with ambiguity scores and scores. |
| Prompt Narrowing | Trigger a clarification with a term defined in PROJECT.md | The prompt references the definition from PROJECT.md to narrow choices. |
| discuss-seed Enrichment | Run `gsd-tools itl discuss-seed --phase {N}` | The generated seed includes a `<ambient_context>` block with project goals/decisions. |
