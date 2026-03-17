# Phase 16: Checkpoint Artifact Lifecycle - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Write CHECKPOINT.md to the phase directory on every blocking checkpoint, re-read and validate it in resume-project before routing, and track checkpoint lifecycle state in STATE.md. No user-facing UX changes — this is runtime plumbing that makes checkpoints persistent across session boundaries.

</domain>

<decisions>
## Implementation Decisions

### Write point — who writes CHECKPOINT.md
- The **gsd-executor agent** writes CHECKPOINT.md before returning its checkpoint state to the orchestrator
- Written directly using the Write tool (no new gsd-tools CLI subcommand for the write itself)
- Location: phase directory — `.planning/phases/XX-name/CHECKPOINT.md` (one file per phase, overwritten on new checkpoint)
- Initial `status` field value when first written: `pending`
- The **orchestrator (execute-phase)** updates CHECKPOINT.md status to `awaiting-response` after presenting the checkpoint to the user
- The **orchestrator** marks CHECKPOINT.md status `resolved` and sets `resolved_at` after the continuation agent completes successfully

### STATE.md lifecycle field — CHECKPOINT-03
- New dedicated frontmatter field: `checkpoint_status: pending | awaiting-response | resolved`
- New dedicated frontmatter field: `checkpoint_path:` — full relative path to the active CHECKPOINT.md
- When no checkpoint is active: both fields are absent/null from STATE.md frontmatter (not present)
- New gsd-tools subcommand: `state checkpoint --status <value> --path <file>` to update both fields atomically, consistent with other state.cjs update patterns
- Fields are cleared (set to null/removed) when a checkpoint resolves and CHECKPOINT.md is marked resolved

### Resume error behavior — CHECKPOINT-02
- When `checkpoint_status` is `pending` or `awaiting-response` in STATE.md but CHECKPOINT.md is **missing or invalid**: fall back to last completed state (last completed task/plan in STATE.md) and prompt the user to re-run the relevant command (`/gsd:execute-phase {phase}`) to get back to where they were — no hard error, recovery via re-execution
- When `checkpoint_status` is `awaiting-response` and CHECKPOINT.md is **valid**: show a brief summary of the checkpoint fields (type, why_blocked, choices) and instruct user to re-run `/gsd:execute-phase {phase}` to continue — resume-project does not inline the response
- When CHECKPOINT.md has `status: resolved`: ignore it and route normally as if no checkpoint exists

### Artifact cleanup
- On resolve: **keep** CHECKPOINT.md as a resolved artifact in the phase directory (status: resolved, resolved_at set) — provides audit trail, does not interfere with future checkpoints since resume checks status field
- On new checkpoint firing in the same phase: **overwrite** CHECKPOINT.md — one active checkpoint per phase at a time; prior checkpoints are in git history
- **Commit at each lifecycle transition**: when written (pending), when updated to awaiting-response, and when resolved — consistent with how SUMMARY.md and STATE.md are committed

### Claude's Discretion
- Exact YAML frontmatter structure of CHECKPOINT.md body (markdown prose below frontmatter)
- Whether `state checkpoint` subcommand also writes to the `## Decisions` section of STATE.md body
- Internal implementation of frontmatter parsing/writing in state.cjs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema layer (Phase 15 — complete)
- `get-stuff-done/bin/lib/artifact-schema.cjs` — `checkpointArtifactSchema` defines the canonical shape of CHECKPOINT.md frontmatter; `parseCheckpointArtifact` is the parse helper

### Agent checkpoint contract
- `get-stuff-done/references/checkpoints.md` — Agent checkpoint return contract (required fields: status, type, why_blocked, what_is_uncertain, choices, allow_freeform, resume_condition); checkpoint types and their handling rules

### Executor workflow — where CHECKPOINT.md write goes
- `get-stuff-done/workflows/execute-plan.md` §checkpoint_protocol and §checkpoint_return_for_orchestrator — existing checkpoint handling that the executor currently uses; CHECKPOINT.md write is added here

### Orchestrator workflow — where status transitions go
- `get-stuff-done/workflows/execute-phase.md` §checkpoint_handling — existing orchestrator checkpoint handler that presents to user; awaiting-response and resolved transitions added here

### Resume routing — where CHECKPOINT.md validation goes
- `get-stuff-done/workflows/resume-project.md` — current resume routing logic; CHECKPOINT.md read + validate + route changes are added here

### STATE.md management
- `get-stuff-done/bin/lib/state.cjs` — existing state field update patterns (`stateReplaceField`, `updateState`); new `state checkpoint` subcommand follows same patterns
- `.planning/STATE.md` — current frontmatter structure; `checkpoint_status` and `checkpoint_path` fields added here

### Requirements
- `.planning/REQUIREMENTS.md` — CHECKPOINT-01 (write on block), CHECKPOINT-02 (re-read on resume), CHECKPOINT-03 (lifecycle in STATE.md)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `artifact-schema.cjs`: `checkpointArtifactSchema`, `parseCheckpointArtifact` — ready to use for validation in resume-project
- `state.cjs`: `stateReplaceField` helper, `updateState` function — follow this pattern for the new `state checkpoint` subcommand
- `gsd-tools.cjs`: existing `state record-session` subcommand — model the new `state checkpoint` subcommand on this pattern
- `core.cjs`: `safeReadFile` — use for reading CHECKPOINT.md in resume-project

### Established Patterns
- All STATE.md updates go through `state.cjs` functions, not direct file writes — new subcommand must follow this
- All gsd-tools subcommands follow the `subcommand → handler function` routing pattern in gsd-tools.cjs
- CHECKPOINT.md write uses YAML frontmatter + markdown body — same as STATE.md format (established in Phase 15 CONTEXT.md)
- All artifact writes are committed via `node gsd-tools.cjs commit "message" --files path` — same pattern for CHECKPOINT.md commits

### Integration Points
- **gsd-executor → CHECKPOINT.md**: executor writes CHECKPOINT.md (Write tool) before the `checkpoint_return_for_orchestrator` step
- **execute-phase → STATE.md**: orchestrator calls `gsd-tools state checkpoint --status awaiting-response --path {path}` after presenting to user
- **execute-phase → CHECKPOINT.md**: orchestrator updates status to resolved (Write/Edit tool) after continuation completes
- **resume-project → CHECKPOINT.md**: resume reads `checkpoint_path` from STATE.md frontmatter, validates with `checkpointArtifactSchema`, routes based on status

</code_context>

<specifics>
## Specific Ideas

- The `state checkpoint` subcommand should update both `checkpoint_status` and `checkpoint_path` atomically in STATE.md frontmatter — same transaction, not two separate field writes
- When falling back on missing/invalid CHECKPOINT.md in resume, include the last completed plan/task info so the user knows exactly where to re-run from

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-checkpoint-artifact-lifecycle*
*Context gathered: 2026-03-17*
