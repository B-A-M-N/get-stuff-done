---
phase: 78
slug: phase-truth-contracts
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-28
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for machine-authoritative per-phase truth derivation, direct `phase-truth generate` CLI generation, lifecycle regeneration hooks, and truthful backfill across phases 70 through 77.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node --test`) plus direct `gsd-tools` phase-truth commands |
| **Quick run command** | `node --test tests/phase-truth.test.cjs tests/phase-truth-cli.test.cjs tests/phase-truth-hooks.test.cjs` |
| **Focused syntax checks** | `node --check get-stuff-done/bin/lib/phase-truth.cjs && node --check get-stuff-done/bin/gsd-tools.cjs && node --check get-stuff-done/bin/lib/verify.cjs && node --check get-stuff-done/bin/lib/drift-reconcile.cjs && node --check get-stuff-done/bin/lib/phase.cjs` |
| **Artifact verification** | `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/78-phase-truth-contracts/78-01-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/78-phase-truth-contracts/78-02-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 78 --raw` |
| **Direct CLI proof** | `node get-stuff-done/bin/gsd-tools.cjs phase-truth generate 78 --raw` |
| **Estimated runtime** | about 10 seconds for the focused Phase 78 baseline |

---

## Sampling Rate

- **After derivation-logic changes:** run the quick run command first.
- **After CLI or hook changes:** rerun the quick run command plus direct `phase-truth generate 78 --raw`.
- **After verification or reconciliation hook changes:** rerun the hook suite and regenerate truth from the CLI once.
- **Before milestone audit:** syntax checks, artifact verification, and direct CLI proof must all be current.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 78-01-01 | 01 | 1 | `TRUTH-PHASE-01`, `TRUTH-VERIFY-01` | deterministic derivation, precedence, and verification-contract gating | `node --test tests/phase-truth.test.cjs` | ✅ present | ✅ green |
| 78-01-02 | 01 | 1 | `TRUTH-PHASE-01`, `TRUTH-VERIFY-01` | direct CLI generation and lifecycle hook regeneration | `node --test tests/phase-truth-cli.test.cjs tests/phase-truth-hooks.test.cjs && node get-stuff-done/bin/gsd-tools.cjs phase-truth generate 78 --raw` | ✅ present | ✅ green |
| 78-02-01 | 02 | 2 | `TRUTH-PHASE-01` | truthful backfill for phases 70-73 | `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/78-phase-truth-contracts/78-02-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs phase-truth generate 78 --raw` | ✅ present | ✅ green |
| 78-02-02 | 02 | 2 | `TRUTH-PHASE-01` | truthful backfill for phases 74-77 | `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/78-phase-truth-contracts/78-02-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs phase-truth generate 78 --raw` | ✅ present | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] [`tests/phase-truth.test.cjs`](/home/bamn/get-stuff-done/tests/phase-truth.test.cjs) — derivation precedence, degraded-state conditionality, missing-proof invalidation, and verification-contract gating
- [x] [`tests/phase-truth-cli.test.cjs`](/home/bamn/get-stuff-done/tests/phase-truth-cli.test.cjs) — direct `phase-truth generate` YAML/markdown persistence and reported final status
- [x] [`tests/phase-truth-hooks.test.cjs`](/home/bamn/get-stuff-done/tests/phase-truth-hooks.test.cjs) — regeneration after verification, reconciliation, phase completion, and invariant closure behavior
- [x] [`get-stuff-done/bin/lib/phase-truth.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/phase-truth.cjs) — central derivation, validation, rendering, and write helpers

**Wave 0 Note:** The current direct `phase-truth generate 78 --raw` run is governed as `warn_only` under degraded posture, but it still writes the authoritative artifact through the sanctioned CLI path. Phase 78’s current generated truth may be `CONDITIONAL` because of current degraded-state caveats, but that conditionality is part of the contract Phase 78 introduced rather than a coverage gap.

---

## Manual-Only Verifications

None.

---

## Validation Sign-Off

- [x] All Phase 78 tasks have automated verification coverage
- [x] Derivation precedence and verification-contract gating are covered directly
- [x] Direct CLI generation is covered directly
- [x] Lifecycle regeneration hooks are covered directly
- [x] Truthful backfill behavior is covered through summary verification plus direct generator proof
- [x] `nyquist_compliant: true` set after the green focused Phase 78 baseline on 2026-03-28

**Approval:** focused Phase 78 baseline green on 2026-03-28

## Validation Audit 2026-03-28

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Notes:
- Focused Phase 78 validation passed on 2026-03-28:
  - `node --check get-stuff-done/bin/lib/phase-truth.cjs`
  - `node --check get-stuff-done/bin/gsd-tools.cjs`
  - `node --check get-stuff-done/bin/lib/verify.cjs`
  - `node --check get-stuff-done/bin/lib/drift-reconcile.cjs`
  - `node --check get-stuff-done/bin/lib/phase.cjs`
  - `node --test tests/phase-truth.test.cjs tests/phase-truth-cli.test.cjs tests/phase-truth-hooks.test.cjs`
  - `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/78-phase-truth-contracts/78-01-SUMMARY.md`
  - `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/78-phase-truth-contracts/78-02-SUMMARY.md`
  - `node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 78 --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs phase-truth generate 78 --raw`

<!-- GSD-AUTHORITY: 78-00-0:nyquist-validation-phase-78 -->
