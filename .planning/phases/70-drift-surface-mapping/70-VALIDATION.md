---
phase: 70
slug: drift-surface-mapping
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
updated: 2026-03-27
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for machine-first drift mapping, deterministic classification, and derived hotspot reporting.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node --test`) plus direct Node script execution for authority regression |
| **Quick run command** | `node --test tests/drift-classifier.test.cjs tests/drift-catalog.test.cjs` |
| **Full suite command** | `node --test tests/core-safeWriteFile.test.cjs tests/drift-classifier.test.cjs tests/drift-catalog.test.cjs && node tests/authority.test.cjs` |
| **Syntax checks** | `node --check get-stuff-done/bin/lib/drift-catalog.cjs get-stuff-done/bin/lib/drift-classifier.cjs get-stuff-done/bin/gsd-tools.cjs get-stuff-done/bin/lib/authority.cjs` |
| **Estimated runtime** | under 1 minute for the full focused Phase 70 suite |

---

## Sampling Rate

- **After every task commit:** run the narrowest targeted command for the owned surface, with feedback latency under 30 seconds.
- **After every plan wave:** rerun the focused suite for the plan’s contract files.
- **Before phase verification:** the full Phase 70 focused suite must be green.
- **Max feedback latency:** 30 seconds at task level; full suite only at wave-end and verification time.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 70-01-01 | 01 | 1 | TRUTH-CLAIM-01, TRUTH-DRIFT-01 | unit/contract | `node --test tests/drift-catalog.test.cjs` | ✅ present | ✅ green |
| 70-01-02 | 01 | 1 | TRUTH-CLAIM-01, TRUTH-DRIFT-01 | integration | `node --test tests/drift-catalog.test.cjs && node get-stuff-done/bin/gsd-tools.cjs drift catalog --raw >/tmp/phase70-catalog.out` | ✅ present | ✅ green |
| 70-01-03 | 01 | 1 | TRUTH-CLAIM-01, TRUTH-DRIFT-01 | regression | `node --check get-stuff-done/bin/lib/drift-catalog.cjs && node --check get-stuff-done/bin/gsd-tools.cjs && node --test tests/drift-catalog.test.cjs && node tests/authority.test.cjs` | ✅ present | ✅ green |
| 70-02-01 | 02 | 2 | TRUTH-CLAIM-01, TRUTH-DRIFT-01 | unit/contract | `node --test tests/drift-classifier.test.cjs` | ✅ present | ✅ green |
| 70-02-02 | 02 | 2 | TRUTH-CLAIM-01, TRUTH-DRIFT-01 | integration | `node --test tests/drift-classifier.test.cjs tests/drift-catalog.test.cjs` | ✅ present | ✅ green |
| 70-02-03 | 02 | 2 | TRUTH-CLAIM-01, TRUTH-DRIFT-01 | regression | `node --check get-stuff-done/bin/lib/drift-classifier.cjs && node --check get-stuff-done/bin/lib/drift-catalog.cjs && node --test tests/drift-classifier.test.cjs tests/drift-catalog.test.cjs` | ✅ present | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/drift-catalog.test.cjs` — machine-first catalog contract, scope coverage, signed YAML writing, and derived summary behavior
- [x] `tests/drift-classifier.test.cjs` — impact/exploitability severity model, historical non-blocking classification, and memory-boundary rules
- [x] `tests/core-safeWriteFile.test.cjs` — YAML authority-envelope support in the core write path
- [x] `tests/authority.test.cjs` — direct YAML signing and verification regression coverage

**Wave 0 Note:** Phase 70 is validation-complete only when the catalog contract, classifier contract, signed YAML path, and derived summary layer all have automated coverage.

---

## Manual-Only Verifications

None — all planned behaviors in Phase 70 have automated coverage or deterministic artifact checks.

---

## Validation Sign-Off

- [x] All tasks have automated verification coverage
- [x] Machine-first artifact generation is covered directly
- [x] YAML authority-envelope behavior is covered directly
- [x] Classification and summary derivation are covered directly
- [x] `nyquist_compliant: true` set after the green focused full-suite run on 2026-03-27

**Approval:** focused Phase 70 suite green on 2026-03-27

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Notes:
- Full focused Phase 70 suite passed on 2026-03-27: `node --test tests/core-safeWriteFile.test.cjs tests/drift-classifier.test.cjs tests/drift-catalog.test.cjs && node tests/authority.test.cjs`
- Validation is aligned with the signed machine artifact in [drift_catalog.yaml](/home/bamn/get-stuff-done/.planning/phases/70-drift-surface-mapping/drift_catalog.yaml) and the derived human layer in [70-DRIFT-SUMMARY.md](/home/bamn/get-stuff-done/.planning/phases/70-drift-surface-mapping/70-DRIFT-SUMMARY.md).

<!-- GSD-AUTHORITY: 70-00-0:47e132846f9399cc5806dfb2a56ecfadbd6e9733d0783ee138f88af760602b23 -->
