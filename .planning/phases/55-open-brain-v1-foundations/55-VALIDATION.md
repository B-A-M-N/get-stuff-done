---
phase: 55
slug: open-brain-v1-foundations
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
updated: 2026-03-27
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for Open Brain foundation, retrieval, and workflow integration work.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node --test`) |
| **Quick run command** | `node --test tests/open-brain-schema.test.cjs tests/open-brain-ingestion.test.cjs tests/open-brain-retrieval.test.cjs` |
| **Full suite command** | `node --test tests/open-brain-schema.test.cjs tests/open-brain-ingestion.test.cjs tests/open-brain-retrieval.test.cjs tests/open-brain-feedback.test.cjs tests/open-brain-context-integration.test.cjs tests/open-brain-degraded-mode.test.cjs tests/install-isolation.test.cjs` |
| **Syntax checks** | `node --check get-stuff-done/bin/lib/open-brain.cjs get-stuff-done/bin/lib/open-brain-embedder.cjs get-stuff-done/bin/lib/open-brain-ranker.cjs get-stuff-done/bin/lib/context.cjs bin/install.js` |
| **Estimated runtime** | ~60 seconds for targeted suites, longer only at full-suite or wave-end verification |

---

## Sampling Rate

- **After every task commit:** Run the narrowest targeted `node --test` command for the files changed in that task and keep feedback latency at `<=30s`.
- **After every plan wave:** Run the focused suite for that plan’s owned tests.
- **Before `$gsd-verify-work`:** The full Phase 55 suite must be green.
- **Max feedback latency:** 30 seconds for task-level loops; longer suites are reserved for wave-end or pre-verify runs.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | OPEN-BRAIN-01, OPEN-BRAIN-02 | unit | `node --test tests/open-brain-schema.test.cjs` | ✅ present | ✅ green |
| 55-01-02 | 01 | 1 | OPEN-BRAIN-01, OPEN-BRAIN-02, OPEN-BRAIN-06 | integration | `node --test tests/open-brain-schema.test.cjs tests/open-brain-degraded-mode.test.cjs` | ✅ present | ✅ green |
| 55-01-03 | 01 | 1 | OPEN-BRAIN-01, OPEN-BRAIN-02 | regression | `node --check get-stuff-done/bin/lib/open-brain.cjs && node --check get-stuff-done/bin/lib/open-brain-embedder.cjs` | ✅ present | ✅ green |
| 55-02-01 | 02 | 2 | OPEN-BRAIN-03 | integration | `node --test tests/open-brain-ingestion.test.cjs` | ✅ present | ✅ green |
| 55-02-02 | 02 | 2 | OPEN-BRAIN-04, OPEN-BRAIN-05 | integration | `node --test tests/open-brain-retrieval.test.cjs tests/open-brain-feedback.test.cjs` | ✅ present | ✅ green |
| 55-02-03 | 02 | 2 | OPEN-BRAIN-03, OPEN-BRAIN-04, OPEN-BRAIN-05 | regression | `node --check get-stuff-done/bin/lib/open-brain.cjs && node --check get-stuff-done/bin/lib/open-brain-ranker.cjs && node --test tests/open-brain-ingestion.test.cjs tests/open-brain-retrieval.test.cjs tests/open-brain-feedback.test.cjs` | ✅ present | ✅ green |
| 55-03-01 | 03 | 3 | OPEN-BRAIN-04, OPEN-BRAIN-06 | integration | `node --test tests/open-brain-context-integration.test.cjs tests/open-brain-degraded-mode.test.cjs` | ✅ present | ✅ green |
| 55-03-02 | 03 | 3 | OPEN-BRAIN-05, OPEN-BRAIN-06 | integration | `node --test tests/open-brain-feedback.test.cjs tests/open-brain-context-integration.test.cjs` | ✅ present | ✅ green |
| 55-03-03 | 03 | 3 | OPEN-BRAIN-04, OPEN-BRAIN-05, OPEN-BRAIN-06 | regression | `node --check get-stuff-done/bin/lib/context.cjs && node --check get-stuff-done/bin/lib/open-brain.cjs && node --test tests/open-brain-context-integration.test.cjs tests/open-brain-feedback.test.cjs tests/open-brain-degraded-mode.test.cjs` | ✅ present | ✅ green |
| 55-04-01 | 04 | 4 | OPEN-BRAIN-06 | integration | `node --test tests/install-isolation.test.cjs` | ✅ present | ✅ green |
| 55-04-02 | 04 | 4 | OPEN-BRAIN-06 | integration | `node --test tests/install-isolation.test.cjs tests/open-brain-degraded-mode.test.cjs` | ✅ present | ✅ green |
| 55-04-03 | 04 | 4 | OPEN-BRAIN-06 | regression | `node --check bin/install.js && node --check get-stuff-done/bin/gsd-tools.cjs && node --test tests/install-isolation.test.cjs tests/open-brain-degraded-mode.test.cjs && rg -n "get-shit-done/VERSION|dostuff/get-stuff-done/VERSION" get-stuff-done/workflows/update.md` | ✅ present | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/open-brain-schema.test.cjs` — schema bootstrap, graph-ready tables, and vector extension posture
- [x] `tests/open-brain-degraded-mode.test.cjs` — unavailable embedding/store paths degrade safely
- [x] `tests/open-brain-ingestion.test.cjs` — normalized artifact ingestion and promotion path
- [x] `tests/open-brain-retrieval.test.cjs` — bounded ranked retrieval behavior
- [x] `tests/open-brain-feedback.test.cjs` — recall-event persistence and ranking feedback loop
- [x] `tests/open-brain-context-integration.test.cjs` — planner/executor context integration stays bounded and optional
- [x] `tests/install-isolation.test.cjs` — installed Codex operator path repair and `brain open-status --raw` shim smoke coverage

**Wave 0 Note:** These tests are deliverables of Phase 55 execution and its additive gap closure. Planning is complete only when every planned behavior across Plans 55-01 through 55-04 has either automated coverage or an explicit manual review path.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirm Open Brain and Second Brain responsibilities remain distinct | OPEN-BRAIN-01, OPEN-BRAIN-06 | Requires architecture judgment across storage helpers and context assembly | Inspect `open-brain.cjs`, `second-brain.cjs`, and `context.cjs`; verify Open Brain never becomes execution truth |
| Confirm ingestion is curated rather than indiscriminate | OPEN-BRAIN-03 | Requires judgment about chosen candidate sources | Review ingestion rules and fixtures; verify summaries/resolutions/promoted artifacts are preferred over raw logs |
| Confirm planner/executor prompts receive bounded curated recall instead of raw rows | OPEN-BRAIN-04 | Prompt-surface correctness is best checked at rendered contract level | Inspect context payload shape and related prompt/template surfaces; verify no raw DB row dumps reach prompts |
| Confirm Open Brain outages do not change Firecrawl or Second Brain boundaries | OPEN-BRAIN-06 | Requires cross-surface behavioral review | Review degraded-mode code paths and smoke test context build with Open Brain disabled/unavailable |
| Confirm the installed Codex operator path matches the repo-local Open Brain status truth | OPEN-BRAIN-06 | Installed-path behavior depends on compatibility shim layout, not just repo-local tests | Run the installed shim smoke test and compare returned `schema`, `sidecar_only`, and `execution_truth_owner` fields with repo-local degraded-mode expectations |

---

## Validation Sign-Off

- [x] All tasks have automated verification or explicit manual review coverage
- [x] Sampling continuity avoids long unverified task runs
- [x] Degraded-mode behavior is called out as required coverage
- [x] Firecrawl and Second Brain boundary preservation is explicitly covered
- [x] Gap-closure Plan 55-04 is covered by automated install-path and degraded-mode verification
- [x] `nyquist_compliant: true` set after the green focused full-suite run on 2026-03-27

**Approval:** focused Phase 55 suite green on 2026-03-27

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Notes:
- The full focused Phase 55 suite passed on 2026-03-27: `node --test tests/open-brain-schema.test.cjs tests/open-brain-ingestion.test.cjs tests/open-brain-retrieval.test.cjs tests/open-brain-feedback.test.cjs tests/open-brain-context-integration.test.cjs tests/open-brain-degraded-mode.test.cjs tests/install-isolation.test.cjs`
- Validation is now aligned with the repaired installed Codex operator path and the green [55-UAT.md](/home/bamn/get-stuff-done/.planning/phases/55-open-brain-v1-foundations/55-UAT.md) artifact.
