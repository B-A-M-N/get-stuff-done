# Phase 51: Enforcement Boundary Restoration & Persistence

**Phase Number:** 51 (Inserted as urgent work after Phase 48/49)
**Milestone:** v0.4.0 Critical Infrastructure & Security Hardening
**Status:** Planned
**Priority:** P0 (Critical - system guarantees compromised)

---

## GOAL

Restore the enforcement boundary's integrity by making all critical gates mandatory, persisting cross-session context, and eliminating bypass vectors that allow silent workflow violations.

---

## Requirements

### ENFORCE-09: Pre-condition Checking
- Add `state assert` command that validates project state before workflow execution
- Validate: PROJECT.md exists, STATE.md is parseable, no stale gates, no pending checkpoints requiring action
- Wire `state assert` into every workflow's initialization step as mandatory pre-check (exit 1 on failure)

### ENFORCE-10: Phase Completeness Gate
- Implement `verify phase-completeness` check that does **live disk scan** for SUMMARY.md files
- Compare summary count vs plan count by reading `.planning/phases/` directly (not from STATE.md counters)
- Call this verification **before** `verify_phase_goal` in `execute-phase` workflow
- Fail the phase if summaries are missing, even if counters say otherwise

### ENFORCE-11: Research Contract Mandatory
- Remove `ADVERSARIAL_TEST_HARNESS_ENABLED` gate from `plan-phase.md` research contract verification
- Make `verify research-contract` **always run** after researcher returns, regardless of config
- Keep the skip option in the user prompt, but the check itself is non-optional

### ENFORCE-12: ITL Context Persistence
- Modify `discuss-phase` to persist ITL output to `{phase_dir}/{padded_phase}-ITL.json`
- Include fields: `ambiguity`, `lockability`, `interpretation`, `summary`
- Update `plan-phase` to read this file if present and use it for constraint validation
- Display warning if ITL data shows `ambiguity.severity = high` but no persisted file exists

### ENFORCE-13: Auto-Chain Scope Restriction
- Modify `core.cjs` or appropriate gate logic to restrict `_auto_chain_active` to:
  - Only `gsd-executor` agents
  - Only `checkpoint:progress` type (exclude `checkpoint:human-action`)
- Add code check: if checkpoint type is `human-action`, ignore auto-chain flag and present to user
- Add audit log entry when auto-chain bypass is attempted on human checkpoint

### STATE-01: Deduplication
- Add deduplication to `cmdStateAddDecision` based on decision text (case-insensitive hash)
- Prevent duplicate entries from multiple runs of the same command

### STATE-02: Explicit Pause/Resume
- Implement `cmdStatePause(cwd, reason)` that:
  - Writes a canonical `.continue-here` file with structured JSON
  - Updates STATE.md with `status: paused` and `paused_at` timestamp
  - Clears any `_auto_chain_active` flag (to prevent strange behavior after resume)
- Implement `cmdStateResume(cwd)` that:
  - Reads `.continue-here` and displays context
  - Clears paused status
  - Option: can pass `--clear` to delete the continue file after successful resume
- Replace heuristic string matching for "paused"/"stopped" with explicit state flag

### CONFIG-01: Dead Config Removal
- Remove `mode` and `granularity` from `new-project.md` writes (they're never read)
- Remove `adversarial_test_harness` from VALID_CONFIG_KEYS or implement it properly
- Add `workflow.auto_advance` to `loadConfig()` return value
- Document all config keys with their actual usage locations

### METRICS-01: Performance Metrics Parsing
- Add parser for `Performance Metrics` table in STATE.md (currently write-only)
- Expose via `gsd:progress` command output
- Add `cmdStateGetMetrics` CLI command to query metrics by phase/plan

---

## Phase Structure

3 Plans (01-03), each targeting a subset of requirements:

**Plan 01 (3 tasks):** Pre-condition checking and phase completeness gate
**Plan 02 (4 tasks):** Research contract, ITL persistence, auto-chain restriction
**Plan 03 (4 tasks):** State improvements, config cleanup, metrics, observability

---

## Out of Scope

- Full ADR process creation (that's for a later documentation phase)
- Major architectural refactoring (we're patching enforcement, not redesigning)
- Fixing all config drift (only the ones causing functional issues)
- Complete rewrite of state machine (explicit pause/resume is additive)

---

## Success Criteria

- `gsd-tools state assert` exists and returns exit 1 on any violation
- Every workflow's first step is `state assert` (verified by workflow grep)
- `verify phase-completeness` reads filesystem, not STATE.md counters
- `plan-phase` runs `verify research-contract` unconditionally after researcher
- ITL ambiguity/lockability persisted to `<phase>-ITL.json` in phase directory
- Duplicate decisions in STATE.md are prevented
- `gsd:pause-work` and `gsd:resume-work` use explicit state (not string heuristics)
- `_auto_chain_active` cannot bypass `checkpoint:human-action`
- Dead config keys removed or implemented
- Performance Metrics can be queried via command

---

## Risks

- **Risk:** Adding `state assert` to all workflows may break existing automations that rely on bypass.
  - **Mitigation:** Make the assert check minimally restrictive (only truly invalid states), test thoroughly.

- **Risk:** Live disk check for summaries could be slow on large projects.
  - **Mitigation:** Use `findPhaseInternal` which already does this; cache results if needed.

- **Risk:** Making research contract mandatory might cause research agent failures to be treated as hard blockers.
  - **Mitigation:** The existing user prompt already offers "skip" option; just remove the config gate that hides it.

- **Risk:** ITL persistence file could become stale if phase re-run.
  - **Mitigation:** Overwrite on each `discuss-phase` run; include timestamp to detect age.

---

## Blockers

- None (all self-contained in GSD codebase)

---

## Notes

This phase addresses the P0 gaps identified in `.planning/audit/ARCHITECTURAL-DRIFT-ASSESSMENT-2026-03-25.md` and `.planning/audit/arch-enforcement.md`. It does NOT require architectural documentation updates (that's separate Phase 52+).

The focus is on **closing the enforcement loop** so that guarantees are once again mechanically enforced rather than relying on LLM compliance.
