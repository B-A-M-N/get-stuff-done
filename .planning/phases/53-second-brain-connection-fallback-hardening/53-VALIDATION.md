---
phase: 53
slug: second-brain-connection-fallback-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-26
updated: 2026-03-27
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` |
| **Config file** | none — `scripts/run-tests.cjs` enumerates `tests/**/*.test.cjs` |
| **Quick run command** | `node --test tests/second-brain-grant.test.cjs tests/checkpoint-plane-sync.test.cjs tests/summary-plane-sync.test.cjs tests/plane-health.test.cjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/second-brain-grant.test.cjs tests/checkpoint-plane-sync.test.cjs tests/summary-plane-sync.test.cjs tests/plane-health.test.cjs`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 0 | BRAIN-OPS-01 | unit | `node --test tests/second-brain-state.test.cjs` | ✅ present | ✅ green |
| 53-01-02 | 01 | 0 | BRAIN-OPS-02 | unit | `node --test tests/second-brain-lifecycle.test.cjs tests/checkpoint-plane-sync.test.cjs tests/summary-plane-sync.test.cjs` | ✅ present | ✅ green |
| 53-01-03 | 01 | 0 | BRAIN-OPS-03 | unit + CLI | `node --test tests/second-brain-status.test.cjs` | ✅ present | ✅ green |
| 53-01-04 | 01 | 0 | BRAIN-OPS-01, BRAIN-OPS-02 | integration | `GSD_TEST_POSTGRES=1 node --test tests/second-brain-postgres-optin.test.cjs` | ✅ present | ✅ gated |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/second-brain-state.test.cjs` — cover degraded reason classification, one-time warning emission, and reason-change re-emit behavior
- [x] `tests/second-brain-lifecycle.test.cjs` — cover idempotent close/reset and ended-pool non-reuse
- [x] `tests/second-brain-status.test.cjs` — cover `brain status`, `brain health`, and degraded runbook truth surfaces
- [x] `tests/second-brain-postgres-optin.test.cjs` — gate explicit Postgres integration behind `GSD_TEST_POSTGRES=1`
- [x] Test harness contract in setup/helpers — baseline runs scrub or ignore ambient `PG*` and `DATABASE_URL` unless `GSD_TEST_POSTGRES=1`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Degraded CLI messaging stays concise for a real operator run | BRAIN-OPS-01, BRAIN-OPS-03 | Automated tests can assert text and JSON, but not whether the overall operator experience is concise and non-spammy across a real command sequence | Run a normal CLI command with unreachable Postgres, then run `brain status` and `brain health`; confirm one concise degraded warning, truthful backend state, and short runbook/help output |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** focused Phase 53 suite green on 2026-03-27

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

Notes:
- Resolved a stale expectation in `tests/second-brain-status.test.cjs` after Phase 54 added `model_facing_memory` to the authoritative status surface.
- Focused verification now passes: `node --test tests/second-brain-state.test.cjs tests/second-brain-lifecycle.test.cjs tests/second-brain-status.test.cjs tests/checkpoint-plane-sync.test.cjs tests/summary-plane-sync.test.cjs`

<!-- GSD-AUTHORITY: 53-01-1:770ccd2974c3c404d6ca303970a272e82ca5f5ad5861a451c8b27ec9a46784ac -->
