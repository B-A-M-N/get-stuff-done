---
phase: 48
slug: plane-checkpoint-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `get-stuff-done/jest.config.js` |
| **Quick run command** | `npm test -- --testPathPattern=48` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=48`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | PLANE-VISIBILITY-03 | unit | `npm test -- --testNamePattern=checkpoint-plane-sync` | ⬜ pending | ⬜ pending |
| 48-01-02 | 01 | 1 | PLANE-SYNC-03 | unit | `npm test -- --testNamePattern=summary-plane-sync` | ⬜ pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/48-plane-checkpoint-sync.test.cjs` — stubs for PLANE-VISIBILITY-03, PLANE-SYNC-03
- [ ] `tests/conftest.cjs` — shared fixtures (mock plane-client, mock checkpoint files)
- [ ] Framework already installed (jest)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Verify checkpoint comment appears on Plane issue | PLANE-VISIBILITY-03 | Needs real Plane API to confirm comment threading | 1. Create checkpoint via `gsd:checkpoint` 2. Check Plane issue for new comment 3. Verify content includes checkpoint summary and artifact links |
| Verify summary comment appears on Plane issue | PLANE-SYNC-03 | Orchestrator flow validation | 1. Complete phase 2. Run summary sync 3. Check Plane issue for summary comment with artifact links |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
