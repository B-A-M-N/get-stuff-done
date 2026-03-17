---
phase: 16
slug: checkpoint-artifact-lifecycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (Node.js) |
| **Config file** | package.json (jest config) |
| **Quick run command** | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="checkpoint"` |
| **Full suite command** | `node --experimental-vm-modules node_modules/.bin/jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="checkpoint"`
- **After every plan wave:** Run `node --experimental-vm-modules node_modules/.bin/jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | CHECKPOINT-01 | unit | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="checkpoint-contract"` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | CHECKPOINT-01 | integration | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="checkpoint-contract"` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | CHECKPOINT-02 | unit | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="state"` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 2 | CHECKPOINT-02 | integration | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="state"` | ✅ | ⬜ pending |
| 16-03-01 | 03 | 3 | CHECKPOINT-03 | integration | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="dostuff"` | ✅ | ⬜ pending |
| 16-03-02 | 03 | 3 | CHECKPOINT-03 | integration | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="dostuff"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/checkpoint-contract.test.cjs` — stubs for CHECKPOINT-01 (executor writes CHECKPOINT.md, validates required fields)
- [ ] Existing `tests/state.test.cjs` — extended for CHECKPOINT-02 (lifecycle state transitions)
- [ ] Existing `tests/dostuff.test.cjs` — extended for CHECKPOINT-03 (resume-project reads/validates CHECKPOINT.md)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CHECKPOINT.md written at correct phase directory path | CHECKPOINT-01 | Requires live executor run | Trigger a blocking checkpoint, verify file at `.planning/phases/{phase}/CHECKPOINT.md` |
| resume-project surfaces error for missing CHECKPOINT.md | CHECKPOINT-02 | Requires STATE.md in checkpoint state with missing file | Set STATE.md `checkpoint_status: awaiting-response`, delete CHECKPOINT.md, run `/gsd:resume-work` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
