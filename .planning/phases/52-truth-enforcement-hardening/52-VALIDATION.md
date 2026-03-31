---
phase: 52
slug: truth-enforcement-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node --test`) |
| **Config file** | `package.json` (test script) |
| **Quick run command** | `node --test tests/phase-52/*.test.cjs` |
| **Full suite command** | `npm test -- --include=tests/phase-52` |
| **Estimated runtime** | ~60 seconds (coverage + proof verification) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/phase-52/unit/*.test.cjs` (quick smoke)
- **After every plan wave:** Run full suite including proof validation
- **Before `/gsd:verify-work`:** Full suite must be green; truth audit report generated
- **Max feedback latency:** 120 seconds (proof verification can be heavy)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | QUALITY-01 (Coverage) | integration | `npm run test:coverage:phase52` | ✅ | ⬜ pending |
| 52-02-01 | 02 | 2 | QUALITY-02 (Secrets) | unit | `node --test tests/phase-52/unit/safelogger-secrets.test.cjs` | ✅ | ⬜ pending |
| 52-02-02 | 02 | 2 | QUALITY-02 (Integration) | integration | `node --test tests/phase-52/integration/safelogger-end-to-end.test.cjs` | ✅ | ⬜ pending |
| 52-03-01 | 03 | 3 | QUALITY-03 (Proof Harness) | unit | `node --test tests/phase-52/unit/proof-harness.test.cjs` | ✅ | ⬜ pending |
| 52-03-02 | 03 | 3 | QUALITY-03 (Adversarial) | integration | `node --test tests/phase-52/integration/adversarial-scenarios.test.cjs` | ✅ | ⬜ pending |
| 52-04-01 | 04 | 4 | QUALITY-04 (Audit Engine) | unit | `node --test tests/phase-52/unit/truth-audit-mapping.test.cjs` | ✅ | ⬜ pending |
| 52-04-02 | 04 | 4 | QUALITY-04 (Report) | integration | `node scripts/generate-truth-audit.js && test -f 52-TRUTH-AUDIT.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/phase-52/unit/safelogger-secrets.test.cjs` — SafeLogger blocks secrets
- [ ] `tests/phase-52/unit/proof-harness.test.cjs` — Proofs generated and validate
- [ ] `tests/phase-52/unit/truth-audit-mapping.test.cjs` — Manual mapping produces complete audit
- [ ] `tests/phase-52/integration/adversarial-scenarios.test.cjs` — Adversarial tests fail appropriately
- [ ] `scripts/generate-truth-audit.js` — Truth audit generator with Phase 51 verification
- [ ] `package.json` scripts for `test:coverage:phase52` and `test:proofs:phase52`

**Wave 0 Note:** All Wave 0 items are created during Phase 52 execution by the corresponding plans. They are not prerequisites; they are deliverables. The checker should verify that the plans commit to creating these items, not that they exist beforehand.

*If none: "Existing infrastructure covers all phase requirements."*

**In this case:** Wave 0 will create all test infrastructure as part of Plans 52-01 through 52-04. Tests are created alongside implementation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Review `52-TRUTH-AUDIT.md` for completeness | QUALITY-04 | Manual mapping verification requires human judgment on evidence quality | `cat 52-TRUTH-AUDIT.md` and verify all QUALITY-01 through QUALITY-04 requirements have evidence entries with code locations, test results, and traces |
| Validate SafeLogger does not block legitimate operations | QUALITY-02 | Requires sampling of production-like logs to confirm no false positives | Run smoke test suite with sample data; inspect logs for `***REDACTED***` patterns; confirm no critical operational failures |
| Confirm coverage threshold met for critical modules | QUALITY-01 | Coverage report must be reviewed to confirm ≥85% on correct modules | `cat coverage/phase-52-coverage.json` and check `ControlPlane`, `Execution`, `DecisionComposer`, `Verifier` modules |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter after first green build

**Approval:** pending (requires first successful full suite run)
