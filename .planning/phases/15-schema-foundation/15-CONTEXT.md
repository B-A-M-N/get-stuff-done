# Phase 15: Schema Foundation - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the canonical Zod schema layer that all v0.2.0 artifact enforcement depends on. This phase is pure schema + infrastructure: new file `artifact-schema.cjs`, individual sub-schema exports from `itl-schema.cjs`, and `checkpointResponseSchema` replacing manual field checking in `cmdVerifyCheckpointResponse`. No user-facing behavior changes in this phase.

</domain>

<decisions>
## Implementation Decisions

### Schema file organization
- New file: `get-stuff-done/bin/lib/artifact-schema.cjs`
- This file owns all disk-persistence artifact schemas — distinct domain from ITL interpretation schemas
- Contains: `checkpointArtifactSchema`, `checkpointResponseSchema`, `executionSummarySchema`
- `executionSummarySchema` defined here now (even though SCHEMA-02 is Phase 19) — `artifact-schema.cjs` is the right home and Phase 19 just imports it

### CHECKPOINT.md artifact format
- YAML frontmatter + markdown body — matches STATE.md and other GSD artifacts
- Zod schema validates the frontmatter fields
- Required frontmatter fields (from SCHEMA-01): `status`, `type`, `why_blocked`, `what_is_uncertain`, `choices`, `allow_freeform`, `resume_condition`, `resolved_at`
- Body contains human-readable context/explanation

### executionSummarySchema format (from SCHEMA-02)
- Validates SUMMARY.md frontmatter fields
- Required fields: `phase`, `plan`, `name` (from existing SUMMARY.md frontmatter pattern)
- Body sections validated: one_liner present, work_completed present, key_files present, verification present

### checkpointResponseSchema
- Replaces manual regex/string field checking in `cmdVerifyCheckpointResponse` (verify.cjs line 211)
- Validates the agent checkpoint return format (plain key:value text, not YAML — this is the *agent return* format, not the persisted artifact format)
- Required fields match current: `status`, `why_blocked`, `what_is_uncertain`, `choices`, `allow_freeform`, `resume_condition`
- Zod preprocessor handles the text→object parsing
- `cmdVerifyCheckpointResponse` updated to use schema parse instead of manual field loops

### ITL sub-schema decomposition
- **Additive only — no breaking changes**
- All existing exports in `itl-schema.cjs` remain identical
- Add individual named exports for each sub-schema alongside the existing `schemas.{}` namespace object
- New individual exports: `interpretationSchema`, `ambiguitySchema`, `lockabilitySchema`, `clarificationCheckpointSchema`, `clarificationPromptSchema` (already exported via `schemas.{}`, now also exported directly)
- Zero importer updates needed — existing destructuring continues to work

### Claude's Discretion
- Exact Zod preprocessor implementation for text-format checkpoint response parsing
- Whether to use `z.object().passthrough()` or strict shape for artifact schemas
- Internal helper functions within `artifact-schema.cjs`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing schema patterns
- `get-stuff-done/bin/lib/itl-schema.cjs` — Established Zod schema patterns, `interpretationResultSchema`, `baseSeedSchema`, all seed types, existing export conventions
- `get-stuff-done/bin/lib/verify.cjs` lines 211-263 — `cmdVerifyCheckpointResponse` manual field checking that `checkpointResponseSchema` replaces

### Requirements
- `.planning/REQUIREMENTS.md` — SCHEMA-01 (checkpointArtifactSchema fields), SCHEMA-02 (executionSummarySchema fields), SCHEMA-04 (checkpointResponseSchema), SCHEMA-05 (ITL decomposition)

### Existing artifact formats to match
- `.planning/STATE.md` — YAML frontmatter + markdown body pattern to follow for CHECKPOINT.md
- `.planning/phases/01-foundational-rebrand-fixes/01-01-SUMMARY.md` — Existing SUMMARY.md frontmatter fields (phase, plan, name) that executionSummarySchema must validate

### Audit context
- `.planning/audit/arch-enforcement.md` — Enforcement gaps this schema layer addresses
- `.planning/audit/brownfield-audit.md` — Full artifact lifecycle gap table

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `itl-schema.cjs`: `z`, `stringListField`, `normalizeStringList`, `buildMetadata` — all importable and reusable in `artifact-schema.cjs`
- `core.cjs`: `output`, `error` helpers — same output pattern used by verify.cjs validators
- `verify.cjs`: `safeReadFile`, existing validator pattern — `cmdVerifyCheckpointResponse` update follows this pattern exactly

### Established Patterns
- All Zod schemas use `.min(1)` on required strings, `.optional()` on nullable fields
- `module.exports` at bottom of file with named exports
- Test files use `captureJson()` helper from `helpers.cjs` to test validator output
- Schema files export both schemas and parse functions (e.g., `parseInterpretation`, `parseAmbiguity`)

### Integration Points
- `verify.cjs` imports from `itl-schema.cjs` — `artifact-schema.cjs` follows same import pattern
- `gsd-tools.cjs` routes `verify checkpoint-response` to `cmdVerifyCheckpointResponse` — function signature unchanged
- `tests/checkpoint-validator.test.cjs` imports `cmdVerifyCheckpointResponse` directly — test file updated when schema replaces manual checking

</code_context>

<specifics>
## Specific Ideas

- `artifact-schema.cjs` should export parse functions alongside schemas: `parseCheckpointArtifact`, `parseCheckpointResponse`, `parseExecutionSummary` — consistent with itl-schema.cjs pattern
- For CHECKPOINT.md frontmatter parsing, consider a `parseFrontmatter` utility if one doesn't already exist (STATE.md parsing in state.cjs may have one to reuse)

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-schema-foundation*
*Context gathered: 2026-03-17*
