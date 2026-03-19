---
phase: 15
slug: schema-foundation
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-17
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — scripts/run-tests.cjs auto-discovers *.test.cjs |
| **Quick run command** | `node --test tests/checkpoint-validator.test.cjs` |
| **Full suite command** | `node scripts/run-tests.cjs` |
| **Estimated runtime** | ~5 seconds (quick), ~30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/checkpoint-validator.test.cjs`
- **After every plan wave:** Run `node scripts/run-tests.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | SCHEMA-01, CHECKPOINT-04 | unit + export check | `node -e "require('./get-stuff-done/bin/lib/artifact-schema.cjs')" && node --test tests/checkpoint-validator.test.cjs` | ❌ W0 (new file) | ⬜ pending |
| 15-02-01 | 02 | 1 | SCHEMA-05 | unit + export check | `node -e "const s=require('./get-stuff-done/bin/lib/itl-schema.cjs'); ['interpretationSchema','ambiguitySchema','lockabilitySchema','clarificationCheckpointSchema','clarificationPromptSchema'].forEach(k=>{if(!s[k])throw new Error(k+' missing')})" && node --test tests/itl.test.cjs` | ✅ existing | ⬜ pending |
| 15-03-01 | 03 | 2 | SCHEMA-04 | unit (regression) | `node --test tests/checkpoint-validator.test.cjs` | ✅ existing | ⬜ pending |
| 15-03-02 | 03 | 2 | SCHEMA-04, SCHEMA-05 | unit (new assertions) | `node --test tests/checkpoint-validator.test.cjs && node --test tests/itl.test.cjs` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/checkpoint-validator.test.cjs` — exists, covers checkpointResponseSchema validation
- [x] `tests/itl.test.cjs` — exists, covers ITL sub-schema exports
- [ ] `get-stuff-done/bin/lib/artifact-schema.cjs` — new file created by Plan 01 Task 1 (Wave 0 gap closed by Plan 01)

*Plan 01 Task 1 creates the new file — no pre-existing stubs needed. Tests already exist.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (4 tasks, all verified)
- [x] Wave 0 covers all MISSING references (artifact-schema.cjs created in Plan 01)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (all commands ~2-5s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-17
