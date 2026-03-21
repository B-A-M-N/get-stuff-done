---
phase: 28
slug: zero-bypass-workflow-enforcement
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-21
---

# Phase 28 Validation Strategy: Zero-Bypass Workflow Enforcement

**Goal:** Eliminate unvetted external data and manual workflow bypasses by hardening the execution contract and automating Second Brain lifecycle.

## Validation Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — scripts/run-tests.cjs auto-discovers *.test.cjs |
| **Quick run command** | `node --test tests/summary-contract.test.cjs tests/authority.test.cjs` |
| **Full suite command** | `node scripts/run-tests.cjs` |
| **Estimated runtime** | ~5 seconds (quick), ~45 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run associated test (e.g., `node --test tests/authority.test.cjs`)
- **After every plan wave:** Run full suite `node scripts/run-tests.cjs`
- **Before \`/gsd:verify-work\`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Dimension 8: Verification Matrix (Nyquist)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | ENFORCE-01 | search | `! grep -rE "WebSearch\|WebFetch\|cmdWebsearch" get-stuff-done/bin/ agents/ docs/` | ✅ existing | ⬜ pending |
| 28-01-02 | 01 | 1 | ENFORCE-02 | unit | `node --test tests/summary-contract.test.cjs` | ✅ existing | ⬜ pending |
| 28-02-01 | 02 | 2 | ENFORCE-03 | unit | `node --test tests/authority.test.cjs` | ⬜ missing | ⬜ pending |
| 28-02-02 | 02 | 2 | ENFORCE-04 | e2e | `gsd-tools verify-bypass src/sample.ts` | ⬜ missing | ⬜ pending |
| 28-03-01 | 03 | 3 | BRAIN-SERVER-LOCAL | infra | `gsd-tools brain health` | ⬜ missing | ⬜ pending |
| 28-03-02 | 03 | 3 | BRAIN-SERVER-LOCAL | integration | `gsd-tools verify-agent-connectivity` | ⬜ missing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/authority.test.cjs` — to be created by Plan 02, contains unit tests for SHA-256 authority envelope generation and verification.
- [ ] `get-stuff-done/bin/lib/authority.cjs` — to be created by Plan 02, core logic for signing and verification.

---

## Manual-Only Verifications

| Behavior | Manual Verification Steps | Expected Outcome |
|----------|---------------------------|------------------|
| Bypass Rejection | Manually edit a file without gsd-tools, then run `gsd-tools verify-bypass {file}` | The tool correctly identifies the bypass and returns a non-zero exit code. |
| Agent Self-Correction | Start a phase with Second Brain offline | The agent (planner/researcher) should attempt to auto-start the infrastructure or flag its absence immediately. |
| Artifact Lineage | Check a SUMMARY file for a completed task from Phase 28+ | The `context_artifact_ids` frontmatter field is populated with IDs from the artifact store. |
