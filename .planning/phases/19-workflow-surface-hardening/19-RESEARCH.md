# Phase 19 Research: Workflow Surface Hardening

## 1. Surface Gate Analysis (SURFACE-01, SURFACE-02)

### Current State
- `autonomous.md`: Already implements a `Clarification Gate` in Step 1 (Milestone init) and Step 3a (Phase init). It correctly halts if `clarification_status == "blocked"`.
- `research-phase.md`: Lacks a blocked-state check. It currently proceeds to spawn a researcher regardless of the project's clarification state.
- `validate-phase.md`: Lacks a blocked-state check. It proceeds to audit gaps even if the project is blocked.

### Hardening Strategy
- **`research-phase.md`**: Insert a `Clarification Gate` after Step 3 (Gather Phase Context). If `clarification_status` from `init phase-op` is `blocked`, exit with an error.
- **`validate-phase.md`**: Insert a `Clarification Gate` after Step 0 (Initialize). If `clarification_status` from `init phase-op` is `blocked`, exit with an error.
- **`autonomous.md`**: Ensure the existing gate provides a clear resume path (`/gsd:resume-project`) and explanation as per SURFACE-02. Current implementation already does this: `echo "Run /gsd:resume-project to address the blocker."`.

## 2. Orphaned Workflow Reconciliation (SURFACE-03)

### Audit Results
| Workflow | Status | Use Case / Wiring |
|----------|--------|-------------------|
| `diagnose-issues.md` | **Orphaned** | Contains logic for parallel `gsd-debugger` agents. High value but not called by any command. |
| `discovery-phase.md` | **Internal** | Called by `plan-phase.md` for Step 3 discovery. Not orphaned. |
| `node-repair.md` | **Internal** | Called by `execute-plan.md` for Step 4. Not orphaned. |
| `transition.md` | **Redundant** | Overlaps significantly with `gsd-tools phase complete` and `gsd:complete-milestone`. |
| `verify-phase.md` | **Internal** | Used as a subagent process for `execute-phase.md` Step 3d. Not orphaned. |

### Reconciliation Plan
1. **`diagnose-issues.md`**: Create a new command `commands/gsd/diagnose.md` (or wire to `debug.md`) to expose this parallel debugging capability.
2. **`transition.md`**: Remove this file. Its logic (ROADMAP/STATE updates) is now handled natively by `gsd-tools` and the `execute-phase` workflow.
3. **Internal files**: Move `discovery-phase.md`, `node-repair.md`, and `verify-phase.md` to a `get-stuff-done/workflows/lib/` or similar internal directory to clarify they are not entry-point commands, or leave them but ensure they are excluded from "orphaned" audits.

## 3. Schema Enforcement (SCHEMA-02, SCHEMA-03)

### Current State
- `artifact-schema.cjs`: `executionSummarySchema` is defined but not utilized by the verification command.
- `verify.cjs`: `cmdVerifySummary` uses manual regex and filesystem checks. It does not validate the structure of the SUMMARY.md frontmatter against a Zod schema.

### Implementation Strategy
- **Upgrade `cmdVerifySummary`**:
    1. Read the frontmatter of the target `SUMMARY.md`.
    2. Use `executionSummarySchema.safeParse(fm)` to validate required fields (`phase`, `plan`, `name`).
    3. If validation fails, report schema errors in the `checks` output.
    4. Keep existing behavior for "files created" and "commits exist" as they complement the schema.

## 4. Summary.md Schema Contract (SCHEMA-02)

The `executionSummarySchema` currently requires:
- `phase`: string
- `plan`: string
- `name`: string
- `requirements_completed`: array of strings (optional)

This matches the needs for Phase 19. No changes needed to the schema itself, only its application.

## 5. Next Steps for Planning
- Plan the surgical injection of gate checks into `research-phase.md` and `validate-phase.md`.
- Plan the creation of `gsd:diagnose` and the removal of `transition.md`.
- Plan the refactor of `verify.cjs` to incorporate `executionSummarySchema`.
