---
phase: 75
slug: degraded-mode-enforcement
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-28
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for canonical degraded-policy synthesis, shared operator health readers, fail-closed truth-bearing route enforcement, and blocked model-facing memory under canonical Postgres outage posture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node --test`) plus direct `gsd-tools` command checks |
| **Quick run command** | `node --test tests/degraded-mode-policy.test.cjs tests/degraded-mode-enforcement.test.cjs tests/brain-mcp-degraded-mode.test.cjs tests/second-brain-status.test.cjs` |
| **Focused syntax checks** | `node --check get-stuff-done/bin/lib/degraded-mode.cjs && node --check get-stuff-done/bin/lib/brain-manager.cjs && node --check get-stuff-done/bin/lib/commands.cjs && node --check get-stuff-done/bin/lib/verify.cjs && node --check get-stuff-done/bin/gsd-tools.cjs` |
| **Artifact verification** | `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/75-degraded-mode-enforcement/75-01-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/75-degraded-mode-enforcement/75-02-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 75 --raw` |
| **Direct CLI proof** | `node get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw`, `node get-stuff-done/bin/gsd-tools.cjs brain status --raw`, `node get-stuff-done/bin/gsd-tools.cjs context build --workflow plan-phase --raw`, `node get-stuff-done/bin/gsd-tools.cjs context build --workflow execute-plan --raw`, and `node get-stuff-done/bin/gsd-tools.cjs verify integrity --raw` |
| **Estimated runtime** | about 15 seconds for the focused Phase 75 baseline, excluding optional broad cross-phase reruns |

---

## Sampling Rate

- **After degraded-policy logic changes:** run the quick run command first.
- **After operator health or reader-surface changes:** rerun the quick run command plus `health degraded-mode --raw` and `brain status --raw`.
- **After route-enforcement or verification changes:** rerun the quick run command plus the direct CLI proof commands for `context build` and `verify integrity`.
- **Before milestone audit:** syntax checks, artifact verification, and direct CLI proof must all be current.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 75-01-01 | 01 | 1 | `TRUTH-DEGRADE-01`, `TRUTH-OPS-01` | canonical degraded-policy normalization and blocked-workflow aggregation | `node --test tests/degraded-mode-policy.test.cjs` | ✅ present | ✅ green |
| 75-01-02 | 01 | 1 | `TRUTH-DEGRADE-01`, `TRUTH-OPS-01` | reader-surface alignment and non-blocking diagnostics | `node --test tests/degraded-mode-policy.test.cjs tests/degraded-mode-enforcement.test.cjs tests/brain-mcp-degraded-mode.test.cjs tests/second-brain-status.test.cjs && node get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw && node get-stuff-done/bin/gsd-tools.cjs brain status --raw` | ✅ present | ✅ green |
| 75-02-01 | 02 | 1 | `TRUTH-DEGRADE-01`, `TRUTH-MEMORY-01` | subsystem fail-closed memory enforcement | `node --test tests/brain-mcp-degraded-mode.test.cjs tests/second-brain-status.test.cjs && node get-stuff-done/bin/gsd-tools.cjs brain status --raw && node get-stuff-done/bin/gsd-tools.cjs context build --workflow plan-phase --raw && node get-stuff-done/bin/gsd-tools.cjs context build --workflow execute-plan --raw` | ✅ present | ✅ green |
| 75-02-02 | 02 | 1 | `TRUTH-DEGRADE-01`, `TRUTH-MEMORY-01`, `TRUTH-OPS-01` | top-level CLI fail-closed enforcement and structured blocked output | `node --test tests/degraded-mode-enforcement.test.cjs tests/brain-mcp-degraded-mode.test.cjs tests/second-brain-status.test.cjs && node get-stuff-done/bin/gsd-tools.cjs verify integrity --raw && node get-stuff-done/bin/gsd-tools.cjs context build --workflow plan-phase --raw` | ✅ present | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] [`tests/degraded-mode-policy.test.cjs`](/home/bamn/get-stuff-done/tests/degraded-mode-policy.test.cjs) — canonical vocabulary normalization, freshness evaluation, aggregate-state downgrade rules, and blocked-workflow policy
- [x] [`tests/degraded-mode-enforcement.test.cjs`](/home/bamn/get-stuff-done/tests/degraded-mode-enforcement.test.cjs) — route-level blocking for unsafe planning and verification workflows plus diagnostic allowances
- [x] [`tests/brain-mcp-degraded-mode.test.cjs`](/home/bamn/get-stuff-done/tests/brain-mcp-degraded-mode.test.cjs) — planner/executor model-facing memory fail-closed behavior
- [x] [`tests/second-brain-status.test.cjs`](/home/bamn/get-stuff-done/tests/second-brain-status.test.cjs) — operator status surfacing of blocked model-facing memory while degraded
- [x] [`tests/brain-health.test.cjs`](/home/bamn/get-stuff-done/tests/brain-health.test.cjs) — supporting coverage exists for operator health readers, but the Nyquist gate uses direct `health degraded-mode --raw` and `brain status --raw` proof because the broader cross-phase health suite is not required to prove Phase 75 ownership
- [x] [`tests/verify.test.cjs`](/home/bamn/get-stuff-done/tests/verify.test.cjs) — supporting coverage exists for verification flows, but the Nyquist gate uses direct `verify integrity --raw` proof because Phase 75 ownership is the fail-closed boundary, not the entire broader verification file

**Wave 0 Note:** The focused Phase 75 suite exposes all owned degraded-mode and model-memory subtests as green, but the broad combined runner can linger on open handles in this environment after the owned suites complete. Nyquist compliance is therefore grounded in the phase-owned degraded-mode tests plus the sanctioned CLI proof surfaces that re-prove blocked planning, blocked integrity verification, and blocked model-facing memory from the current repo state.

---

## Manual-Only Verifications

None.

---

## Validation Sign-Off

- [x] All Phase 75 tasks have automated verification coverage
- [x] Canonical degraded-policy normalization is covered directly
- [x] Operator degraded-state reader alignment is covered through direct CLI proof
- [x] Truth-bearing planning and integrity routes are re-proved as fail-closed
- [x] Model-facing memory blocking is re-proved from the same degraded posture across CLI and test surfaces
- [x] `nyquist_compliant: true` set after the green focused Phase 75 baseline on 2026-03-28

**Approval:** focused Phase 75 baseline green on 2026-03-28

## Validation Audit 2026-03-28

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Notes:
- Focused Phase 75 validation passed on 2026-03-28:
  - `node --check get-stuff-done/bin/lib/degraded-mode.cjs`
  - `node --check get-stuff-done/bin/lib/brain-manager.cjs`
  - `node --check get-stuff-done/bin/lib/commands.cjs`
  - `node --check get-stuff-done/bin/lib/verify.cjs`
  - `node --check get-stuff-done/bin/gsd-tools.cjs`
  - `node --test tests/degraded-mode-policy.test.cjs tests/degraded-mode-enforcement.test.cjs tests/brain-mcp-degraded-mode.test.cjs tests/second-brain-status.test.cjs`
  - `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/75-degraded-mode-enforcement/75-01-SUMMARY.md`
  - `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/75-degraded-mode-enforcement/75-02-SUMMARY.md`
  - `node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 75 --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs brain status --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs context build --workflow plan-phase --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs context build --workflow execute-plan --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs verify integrity --raw`

<!-- GSD-AUTHORITY: 75-00-0:nyquist-validation-phase-75 -->
