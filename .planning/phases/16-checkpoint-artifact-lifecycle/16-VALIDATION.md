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
| **Framework** | node:test (Node.js built-in test runner) |
| **Config file** | none — uses `node --test` directly |
| **Quick run command** | `node --test tests/checkpoint-lifecycle.test.cjs` |
| **Full suite command** | `node --test tests/*.test.cjs` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/checkpoint-lifecycle.test.cjs`
- **After every plan wave:** Run `node --test tests/*.test.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-T1 | 01 | 1 | CHECKPOINT-03 | unit | `node -e "const s = require('./get-stuff-done/bin/lib/state.cjs'); console.log(typeof s.cmdStateCheckpoint)"` | ✅ | ⬜ pending |
| 16-01-T2 | 01 | 1 | CHECKPOINT-03 | integration | `node get-stuff-done/bin/gsd-tools.cjs state checkpoint --status pending --path ".planning/phases/16-checkpoint-artifact-lifecycle/CHECKPOINT.md" 2>&1` | ✅ | ⬜ pending |
| 16-02-T1 | 02 | 1 | CHECKPOINT-01 | unit | `node --test tests/checkpoint-lifecycle.test.cjs 2>&1 \| grep -E "(FAIL\|fail\|Error\|TODO)" \| head -10` | ❌ W0 | ⬜ pending |
| 16-03-T1 | 03 | 2 | CHECKPOINT-01 | grep | `grep -n "CHECKPOINT.md" get-stuff-done/workflows/execute-plan.md \| head -10` | ✅ | ⬜ pending |
| 16-03-T2 | 03 | 2 | CHECKPOINT-03 | grep | `grep -n "awaiting-response\|resolved_at\|state checkpoint" get-stuff-done/workflows/execute-phase.md \| head -15` | ✅ | ⬜ pending |
| 16-04-T1 | 04 | 2 | CHECKPOINT-02 | grep | `grep -n "check_checkpoint_artifact\|checkpointArtifactSchema\|CHECKPOINT AWAITING\|CHECKPOINT FILE" get-stuff-done/workflows/resume-project.md \| head -15` | ✅ | ⬜ pending |
| 16-04-T2 | 04 | 2 | CHECKPOINT-01/02/03 | integration | `node --test tests/checkpoint-lifecycle.test.cjs 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/checkpoint-lifecycle.test.cjs` — stubs for CHECKPOINT-01/02/03 (created by plan 16-02)

*Wave 0 is plan 16-02 (wave 1). Plan 16-04 task 2 depends on this file existing.*

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
