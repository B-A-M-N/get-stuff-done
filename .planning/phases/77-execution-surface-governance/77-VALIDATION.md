---
phase: 77
slug: execution-surface-governance
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-28
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for canonical governance classes, deterministic route classification, warn-only operator access, recovery-only repair paths, and preserved hard gates on authoritative truth transitions.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node --test`) plus direct `gsd-tools` governance checks |
| **Quick run command** | `node --test tests/command-governance.test.cjs tests/command-governance-enforcement.test.cjs` |
| **Focused syntax checks** | `node --check get-stuff-done/bin/lib/command-governance.cjs && node --check get-stuff-done/bin/lib/context.cjs && node --check get-stuff-done/bin/lib/verify.cjs && node --check get-stuff-done/bin/gsd-tools.cjs` |
| **Artifact verification** | `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/77-execution-surface-governance/77-01-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/77-execution-surface-governance/77-02-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 77 --raw` |
| **Direct CLI proof** | `node get-stuff-done/bin/gsd-tools.cjs state json --raw`, `node get-stuff-done/bin/gsd-tools.cjs verify verification-artifact .planning/phases/74-state-reconciliation-layer/74-VERIFICATION.md`, `node get-stuff-done/bin/gsd-tools.cjs context build --workflow plan-phase --raw`, and `node get-stuff-done/bin/gsd-tools.cjs verify integrity --raw` |
| **Estimated runtime** | about 10 seconds for the focused Phase 77 baseline |

---

## Sampling Rate

- **After governance policy changes:** run the quick run command first.
- **After CLI consequence-routing changes:** rerun the quick run command plus `state json --raw`.
- **After planning or verification gate changes:** rerun the direct CLI proof for `context build --workflow plan-phase --raw` and `verify integrity --raw`.
- **Before milestone audit:** syntax checks, artifact verification, and governance CLI proof must all be current.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 77-01-01 | 01 | 1 | `TRUTH-DEGRADE-01`, `TRUTH-BYPASS-01`, `TRUTH-OPS-01` | governance map and deterministic route lookup | `node --test tests/command-governance.test.cjs` | ✅ present | ✅ green |
| 77-02-01 | 02 | 1 | `TRUTH-DEGRADE-01`, `TRUTH-BYPASS-01`, `TRUTH-OPS-01` | runtime recovery-only, warn-only, and hard-gated route behavior | `node --test tests/command-governance-enforcement.test.cjs && node get-stuff-done/bin/gsd-tools.cjs state json --raw && node get-stuff-done/bin/gsd-tools.cjs verify verification-artifact .planning/phases/74-state-reconciliation-layer/74-VERIFICATION.md` | ✅ present | ✅ green |
| 77-02-02 | 02 | 1 | `TRUTH-DEGRADE-01`, `TRUTH-CLAIM-01` | preserved hard gates on authoritative planning and integrity routes | `node --test tests/command-governance-enforcement.test.cjs && node get-stuff-done/bin/gsd-tools.cjs context build --workflow plan-phase --raw && node get-stuff-done/bin/gsd-tools.cjs verify integrity --raw` | ✅ present | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] [`tests/command-governance.test.cjs`](/home/bamn/get-stuff-done/tests/command-governance.test.cjs) — route normalization, policy lookup, hard-gated planning classification, `recovery_only`, and `warn_only` fallback
- [x] [`tests/command-governance-enforcement.test.cjs`](/home/bamn/get-stuff-done/tests/command-governance-enforcement.test.cjs) — runtime warn-only stderr payloads, recovery-only route availability, and hard-gated blocking under unsafe posture
- [x] [`tests/enforcement.test.cjs`](/home/bamn/get-stuff-done/tests/enforcement.test.cjs) — supporting coverage exists for planning and verification backstops, but the Nyquist gate uses direct `context build --workflow plan-phase --raw` and `verify integrity --raw` proof because the governance phase owns route consequence behavior rather than the full broader enforcement file

**Wave 0 Note:** Phase 77 is treated as Nyquist-compliant because the focused governance suites pass cleanly and the sanctioned CLI surfaces re-prove all three consequence classes from the current repo state: warn-only operator access, recovery-only verification/reconciliation access, and hard-gated truth transitions.

---

## Manual-Only Verifications

None.

---

## Validation Sign-Off

- [x] All Phase 77 tasks have automated verification coverage
- [x] Canonical governance-map classification is covered directly
- [x] Warn-only operator access is re-proved from the CLI
- [x] Recovery-only access remains available under unsafe posture
- [x] Hard-gated planning and integrity transitions remain blocked under unsafe posture
- [x] `nyquist_compliant: true` set after the green focused Phase 77 baseline on 2026-03-28

**Approval:** focused Phase 77 baseline green on 2026-03-28

## Validation Audit 2026-03-28

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Notes:
- Focused Phase 77 validation passed on 2026-03-28:
  - `node --check get-stuff-done/bin/lib/command-governance.cjs`
  - `node --check get-stuff-done/bin/lib/context.cjs`
  - `node --check get-stuff-done/bin/lib/verify.cjs`
  - `node --check get-stuff-done/bin/gsd-tools.cjs`
  - `node --test tests/command-governance.test.cjs tests/command-governance-enforcement.test.cjs`
  - `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/77-execution-surface-governance/77-01-SUMMARY.md`
  - `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/77-execution-surface-governance/77-02-SUMMARY.md`
  - `node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 77 --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs state json --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs verify verification-artifact .planning/phases/74-state-reconciliation-layer/74-VERIFICATION.md`
  - `node get-stuff-done/bin/gsd-tools.cjs context build --workflow plan-phase --raw`
  - `node get-stuff-done/bin/gsd-tools.cjs verify integrity --raw`

<!-- GSD-AUTHORITY: 77-00-0:nyquist-validation-phase-77 -->
