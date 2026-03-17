# Concerns & Technical Debt Audit

**Source:** gsd-codebase-mapper agent output

## High Risk

1. **`mode`/`granularity` config fields written but never read** — `new-project.md` writes them to `config.json` but `loadConfig()` in `core.cjs` never returns them. Any behavioral branching on these values is silently absent.

2. **`stateExtractField` defined twice** in `state.cjs` (lines 12 and 184) — first definition is dead code. If they diverge in a future edit, state reads silently use the wrong one.

3. **`verify research-contract` gate absent from inline research path** in `plan-phase.md` — only the standalone `/gsd:research-phase` workflow invokes it. Research artifacts from `plan-phase` inline researcher are never contract-validated.

4. **ITL lockability signal never persisted** — the planner has no machine-readable record of which constraints were flagged guidance-only vs implementation decisions. This context is permanently lost after discuss-phase session ends.

5. **`_auto_chain_active` flag reset is text-instruction only** — a skipped reset causes stale auto-advance behavior with no mechanical enforcement.

## Medium Risk

- **`adversarial_test_harness` key in `config.json`** has no implementation and is not in `VALID_CONFIG_KEYS` — either unfinished feature or stale config entry
- **Two incompatible "checkpoint" schemas coexist** — the ITL clarification checkpoint schema (`clarificationCheckpointSchema`) and the agent return contract checkpoint (`verify checkpoint-response`) have no cross-reference or shared type
- **`deferred_ideas` and `out_of_scope` in `discussionSeedSchema`** always populated from same source (`anti_requirements`), producing duplicate data in the seed output
- **`workflow.auto_advance` not in `loadConfig()`** — requires a separate CLI call; new workflows silently default to false
- **`Performance Metrics` table written by `cmdStateRecordMetric`** but never parsed by `parseStateSnapshot` — metrics are write-only, never readable by orchestrators
- **`.continue-here` file write contract is undocumented** — resume workflow assumes these files exist but there is no spec for their format or lifecycle

## Low Risk

- `cmdStateUpdate` and `cmdStatePatch` duplicate identical regex logic
- `lockabilityFindingSchema` uses a single-value enum `['blocker']` — no room to add severity gradations without a breaking change
- ITL audit records accumulate in SQLite with no workflow consuming them for context restoration

## Risk Ranking Summary

| Item | Risk | Impact |
|------|------|--------|
| mode/granularity never read | High | Silent config drift |
| stateExtractField duplicate | High | Silent state corruption on divergence |
| verify research-contract missing from plan-phase inline path | High | Research artifacts unvalidated |
| ITL lockability not persisted | High | Planning context permanently lost |
| _auto_chain_active reset text-only | Medium | Stale auto-advance in edge cases |
| Two checkpoint schemas no cross-ref | Medium | Schema drift between ITL and agent contract |
| adversarial_test_harness stale key | Low | Config noise |
