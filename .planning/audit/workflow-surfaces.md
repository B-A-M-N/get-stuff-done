# Workflow Surface Completeness Audit

**Source:** gsd-codebase-mapper agent (returned summary only — full analysis pending file write permission at time of run)

## Surface Inventory

### Tier 1 — Full Discipline
discuss-phase, execute-phase, execute-plan, new-project, quick, verify-work, resume-project

### Tier 2 — Partial (missing blocked-state gate at entry)
- `plan-phase` — no clarification_status gate check before starting
- `new-milestone` — no blocked-state handling, no gate check
- `research-phase` — no gate check

### Tier 3 — Thin / Admin (intentionally simple, no enforcement needed)
add-phase, add-tests, add-todo, check-todos, cleanup, complete-milestone, health, insert-phase, list-phase-assumptions, map-codebase, note, pause-work, plan-milestone-gaps, profile-user, remove-phase, settings, stats, update

### Tier 4 — Critical Gap (execution-scoped, missing enforcement)
- `autonomous` — runs all phases without per-phase or per-loop clarification state check
- `validate-phase` — post-execution audit, no blocked-state gate

## Orphaned Workflows (in workflows/ but NOT in commands/gsd/)
- `diagnose-issues.md` — no command entry point
- `discovery-phase.md` — no command entry point
- `node-repair.md` — no command entry point
- `transition.md` — no command entry point (possibly deprecated)
- `verify-phase.md` — no command entry point

## Missing Workflows (in commands/gsd/ but NOT in workflows/)
- `debug` — has skill, no workflow
- `join-discord` — static, no workflow needed
- `reapply-patches` — has skill
- `resume-work` — has skill, maps to resume-project.md (naming mismatch)
- `set-profile` — has skill

## Command/Workflow Naming Mismatches
- `commands/gsd/resume-work.md` → `workflows/resume-project.md` (different names for same operation)

## Consistency Gaps
- Clarification blocking: only discuss-phase and quick have the full loop; plan-phase skips entirely
- Checkpoint validation: execute-phase/execute-plan describe it; all other execution surfaces skip it
- State gate check: no workflow performs `state assert` at init; each relies on convention

## Resume/Handoff Gaps
- `resume-project.md` routing (lines 144-173) checks for incomplete plans but NOT `Clarification Status: blocked`
- `.continue-here` handoff files assumed to exist but no enforcement on write contract
- No detection of stranded ITL clarification checkpoints from previous sessions
