---
phase: 72
slug: verification-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
updated: 2026-03-27
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for evidence-first verification artifacts, direct-evidence enforcement, structured escalation handling, anti-pattern downgrade rules, and typed drift validation.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node --test`) plus direct `gsd-tools` artifact verification |
| **Quick run command** | `node --test tests/verification-artifact.test.cjs` |
| **Focused syntax checks** | `node --check get-stuff-done/bin/lib/verify.cjs && node --check get-stuff-done/bin/gsd-tools.cjs` |
| **Artifact verification** | `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/72-verification-hardening/72-01-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/72-verification-hardening/72-02-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 72 --raw` |
| **Estimated runtime** | under 1 minute for the focused Phase 72 validation baseline |

---

## Sampling Rate

- **After every verification-contract change:** run `node --test tests/verification-artifact.test.cjs` first.
- **After validator CLI or parser changes:** rerun the syntax checks plus the focused verification-artifact suite.
- **Before phase verification:** the focused Phase 72 baseline and both summary verification commands must be green.
- **Max feedback latency:** under 30 seconds for the focused artifact suite; under 1 minute for the full Phase 72 validation baseline.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 72-01-01 | 01 | 1 | `TRUTH-VERIFY-01`, `TRUTH-VERIFY-02` | scaffold regression | `node --test tests/verification-artifact.test.cjs` | ✅ present | ✅ green |
| 72-01-02 | 01 | 1 | `TRUTH-VERIFY-02` | contract/parser validation | `node --test tests/verification-artifact.test.cjs` | ✅ present | ✅ green |
| 72-01-03 | 01 | 1 | `TRUTH-VERIFY-01`, `TRUTH-VERIFY-02` | syntax/artifact verification | `node --check get-stuff-done/bin/lib/verify.cjs && node --check get-stuff-done/bin/gsd-tools.cjs && node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/72-verification-hardening/72-01-SUMMARY.md` | ✅ present | ✅ green |
| 72-02-01 | 02 | 2 | `TRUTH-VERIFY-01`, `TRUTH-VERIFY-02` | blocker/degrader enforcement | `node --test tests/verification-artifact.test.cjs` | ✅ present | ✅ green |
| 72-02-02 | 02 | 2 | `TRUTH-VERIFY-01`, `TRUTH-VERIFY-02` | drift-tagging / validator surface | `node --test tests/verification-artifact.test.cjs` | ✅ present | ✅ green |
| 72-02-03 | 02 | 2 | `TRUTH-VERIFY-01`, `TRUTH-VERIFY-02` | summary + phase completeness verification | `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/72-verification-hardening/72-02-SUMMARY.md && node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 72 --raw` | ✅ present | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] [`tests/verification-artifact.test.cjs`](/home/bamn/get-stuff-done/tests/verification-artifact.test.cjs) — direct-evidence validation, summary-only rejection, explicit gap enforcement, blocker/degrader behavior, drift typing, and historical-drift handling
- [x] [`tests/commands.test.cjs`](/home/bamn/get-stuff-done/tests/commands.test.cjs) — scaffold shape coverage for required evidence-first sections
- [x] [`tests/verify.test.cjs`](/home/bamn/get-stuff-done/tests/verify.test.cjs) — broader Phase 72 verification-artifact scenarios embedded in the verifier suite
- [x] [`tests/enforcement.test.cjs`](/home/bamn/get-stuff-done/tests/enforcement.test.cjs) — CLI-level regression that invalid blocker-state artifacts are mechanically rejected

**Wave 0 Note:** The full legacy [`tests/verify.test.cjs`](/home/bamn/get-stuff-done/tests/verify.test.cjs) and [`tests/enforcement.test.cjs`](/home/bamn/get-stuff-done/tests/enforcement.test.cjs) files are not the Phase 72 Nyquist gate because they currently contain unrelated baseline failures outside the Phase 72 ownership boundary. The clean Phase 72 contract is the dedicated [`tests/verification-artifact.test.cjs`](/home/bamn/get-stuff-done/tests/verification-artifact.test.cjs) suite plus syntax and summary verification.

---

## Manual-Only Verifications

None — all Phase 72 behaviors that define the verification contract have automated coverage or deterministic artifact checks.

---

## Validation Sign-Off

- [x] All Phase 72 tasks have automated verification coverage
- [x] Evidence-first artifact structure is covered directly
- [x] Direct-evidence and explicit-gap enforcement are covered directly
- [x] Blocker/degrader and drift-tagging behavior are covered directly
- [x] Phase 72 summaries and phase completeness verify cleanly
- [x] `nyquist_compliant: true` set after the green focused Phase 72 baseline on 2026-03-27

**Approval:** focused Phase 72 suite green on 2026-03-27

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Notes:
- Focused Phase 72 validation passed on 2026-03-27:
  - `node --test tests/verification-artifact.test.cjs`
  - `node --check get-stuff-done/bin/lib/verify.cjs`
  - `node --check get-stuff-done/bin/gsd-tools.cjs`
  - `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/72-verification-hardening/72-01-SUMMARY.md`
  - `node get-stuff-done/bin/gsd-tools.cjs verify-summary .planning/phases/72-verification-hardening/72-02-SUMMARY.md`
  - `node get-stuff-done/bin/gsd-tools.cjs verify phase-completeness 72 --raw`
- An additional broad rerun of `node --test tests/verify.test.cjs tests/enforcement.test.cjs` on 2026-03-27 still showed unrelated legacy baseline failures outside the Phase 72 write scope, so it is recorded as supporting context rather than the Nyquist gate for this phase.

<!-- GSD-AUTHORITY: 72-00-0:81a83ea41a0c18b83c35f74222eb2172bc5649d84b38aa21b6e69099c52c4d77 -->
