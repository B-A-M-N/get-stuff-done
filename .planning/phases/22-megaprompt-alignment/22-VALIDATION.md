---
phase: 22
slug: megaprompt-alignment
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-19
---

# Phase 22 Validation Strategy: Megaprompt Alignment

**Goal:** Verify all agents and workflows honor the invariants and protocols defined in `MEGAPROMPT.md`.

## Validation Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test |
| **Test Suite** | `tests/megaprompt-compliance.test.cjs` |
| **Coverage Gate** | 100% line coverage for ITL package |

## Audit Matrix

| P-ID | Requirement | Test Type | Automated Command | Status |
|------|-------------|-----------|-------------------|--------|
| P1 | Executor Context Compliance | instruction | `grep "CONTEXT.md" agents/gsd-executor.md` | ⬜ pending |
| P2 | Cross-Plan Data Gate | unit | `node --test tests/plan-checker.test.cjs` | ⬜ pending |
| P3 | Quick Scope Probing | interaction | `grep "Complexity check" commands/gsd/quick.md` | ⬜ pending |
| P4 | verify-work Auto-Diagnosis | workflow | `grep "gsd-debugger" get-stuff-done/workflows/verify-work.md` | ⬜ pending |
| P5 | debug Structured Diagnosis | interaction | `grep "hypothesis" commands/gsd/debug.md` | ⬜ pending |
| P6 | CHANGELOG Accuracy | doc | `grep "planned" CHANGELOG.md` | ⬜ pending |

## Success Criteria

- [ ] All P1-P6 priorities implemented.
- [ ] No un-implemented features described as shipped in CHANGELOG.md.
- [ ] All workflows mention the `MEGAPROMPT.md` if they spawn agents.
- [ ] 100% coverage maintained.
