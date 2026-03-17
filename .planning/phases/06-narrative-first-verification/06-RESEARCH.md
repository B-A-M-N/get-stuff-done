# Phase 6 Research: Narrative-First Verification

## Objective
Research how to add ITL-backed narrative intake to the work verification workflow so `/dostuff:verify-work` can validate completed work against interpreted outcomes and success criteria, while preserving the existing UAT contract, gap diagnosis flow, and phase-boundary discipline.

Additional steering:
- The installed user-facing command surface is `/dostuff:*`.
- The canonical source files still live under `commands/gsd/` and `get-stuff-done/workflows/`.
- Phase 6 should build on the ITL primitives from Phases 2, 4, and 5 rather than inventing a second verification system.

## Standard Stack
- **Keep orchestration in the existing source command/workflow pair**
  - `commands/gsd/verify-work.md`
  - `get-stuff-done/workflows/verify-work.md`
- **Keep implementation logic in existing CommonJS modules**
  - `get-stuff-done/bin/gsd-tools.cjs`
  - `get-stuff-done/bin/lib/itl.cjs`
  - `get-stuff-done/bin/lib/itl-*.cjs`
  - existing `init verify-work` support in `get-stuff-done/bin/lib/init.cjs`
- **Keep output contract in UAT.md form**
  - downstream gap diagnosis and `plan-phase --gaps` should still consume a normal UAT artifact
- **Use the existing ITL SQLite audit store**
  - `.planning/itl/audit.sqlite`
- **Testing stack**
  - `node:test`
  - focused assertions in `tests/*.test.cjs`

## Architecture Patterns

### 1. Insert ITL before test presentation, not instead of UAT
The best integration point is after summaries are discovered and before the workflow starts presenting tests to the user.

Recommended order:
1. Validate phase and initialize verification context.
2. Read SUMMARY artifacts and extract observable deliverables.
3. Capture a short verification narrative from the user about what they tried, expected, or care about most.
4. Run ITL on that narrative.
5. Use the interpretation to prioritize tests and compare against extracted success criteria.
6. Run the normal UAT loop one test at a time.
7. Write a standard UAT.md with pass/issue outcomes and gaps.

This preserves the strongest parts of the current verify flow while improving the starting signal.

### 2. Modify the source `gsd:verify-work`, not a separate dostuff source command
As with Phases 4 and 5, the repo’s source-of-truth should stay in:
- `commands/gsd/verify-work.md`
- `get-stuff-done/workflows/verify-work.md`

Phase 3 already established that installed command surfaces can be rewritten into fork-owned `dostuff` commands. Phase 6 should rely on that rather than introducing a separate `commands/dostuff/` tree.

### 3. Use ITL to frame verification, not to replace user testing
The purpose of `verify-work` is still human UAT. ITL should improve:
- what outcomes the user most cares about validating,
- which success criteria should be surfaced explicitly,
- what ambiguous failure reports need bounded clarification,
- which tests should be prioritized first.

Recommended contract:
- ITL produces structured interpretation and ambiguity findings from a short verification narrative.
- The workflow maps that interpretation into test prioritization and expected-outcome framing.
- The user still confirms whether reality matches.
- The output remains a human-readable UAT.md that downstream diagnosis and gap-planning can consume.

### 4. Preserve the gap and diagnosis contract exactly
Phase 6 must not weaken the current UAT-to-gap-to-fix pipeline.

Recommended rule:
- ITL can refine expected behavior wording and prioritize tests.
- It must not bypass failed-test logging, severity inference, diagnosis handoff, or `plan-phase --gaps`.

### 5. Reuse bounded clarification patterns from Phases 4 and 5
Verification should stay lightweight.

Recommended behavior:
- capture a short narrative about what was tested or what matters most,
- interpret it,
- display a summary,
- only ask clarification questions when ambiguity would make test selection or expectation framing low quality,
- then continue into the standard UAT loop.

### 6. UAT.md remains the downstream contract
Do not let raw ITL output become the final verification artifact.

Recommended mapping:
- interpreted success criteria and goals help rank or phrase tests,
- user-confirmed outcomes remain pass/issue/skipped entries in UAT.md,
- unresolved mismatches become normal gaps,
- ITL output may be summarized in the UAT preamble or notes section if needed, but not as a replacement for test results.

### 7. Persist verification narratives in the audit trail
Phase 6 should reuse the same audit persistence established in Phase 2 and extended in Phases 4 and 5.

Persist:
- raw verification-start narrative,
- structured interpretation,
- ambiguity/confidence result,
- any clarification that materially changed the interpretation.

This creates traceability for why specific tests were prioritized or why certain expectations were emphasized.

## Don’t Hand-Roll
- Do not create a second verification engine outside `verify-work`; extend the existing workflow.
- Do not replace UAT.md with raw interpretation JSON or summary markdown.
- Do not bypass issue logging, severity inference, diagnosis, or gap planning.
- Do not weaken the one-test-at-a-time UAT interaction model.
- Do not invent a separate installed/source command tree split for verify-work.

## Common Pitfalls
- Letting narrative-first verification bypass the actual UAT loop
- Treating ITL output as verification truth before the user confirms behavior
- Losing the existing gap-diagnosis handoff because the narrative layer short-circuited test logging
- Updating docs to `/dostuff:verify-work` while leaving the source workflow logic unchanged
- Asking broad exploratory questions instead of bounded clarification when the verification narrative is vague

## Code Examples
- Current source command entry point: `commands/gsd/verify-work.md`
- Current source workflow: `get-stuff-done/workflows/verify-work.md`
- Existing ITL surface: `get-stuff-done/bin/lib/itl.cjs`
- Existing audit persistence: `get-stuff-done/bin/lib/itl-audit.cjs`
- Existing UAT contract: `get-stuff-done/templates/UAT.md`

## Prescriptive Recommendation
Implement Phase 6 as the smallest safe vertical slice:

1. Update `commands/gsd/verify-work.md` and `get-stuff-done/workflows/verify-work.md` so verification begins with a short freeform testing narrative after summaries are loaded.
2. Add one ITL-backed helper path for verification interpretation and bounded clarification.
3. Use the interpretation to rank or phrase tests and compare against success criteria, not to replace the user’s pass/fail confirmation.
4. Keep the normal UAT.md artifact, gap logging, and diagnosis pipeline intact.
5. Add focused tests/docs so installed `/dostuff:verify-work` behavior is clear.

That yields a real narrative-first verification workflow without weakening the human UAT contract or the gaps pipeline.
