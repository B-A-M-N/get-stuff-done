# Phase 7 Research: Research Context Integration

## Objective
Research how to feed ITL outputs into the research and context workflows so phase research is informed by interpreted user intent, constraints, and assumptions without replacing the existing CONTEXT.md and RESEARCH.md contracts.

Additional steering:
- The installed user-facing command surface is `/dostuff:*`.
- The canonical source files still live under `commands/gsd/` and `get-stuff-done/workflows/`.
- Phase 7 should build on the ITL primitives from Phases 2 through 6 rather than inventing a separate context model.

## Standard Stack
- **Keep orchestration in the existing source command/workflow pairs**
  - `commands/gsd/discuss-phase.md`
  - `get-stuff-done/workflows/discuss-phase.md`
  - `commands/gsd/research-phase.md`
  - `get-stuff-done/workflows/research-phase.md`
- **Keep implementation logic in existing CommonJS modules**
  - `get-stuff-done/bin/gsd-tools.cjs`
  - `get-stuff-done/bin/lib/itl.cjs`
  - `get-stuff-done/bin/lib/itl-*.cjs`
  - existing `init phase-op` support in `get-stuff-done/bin/lib/init.cjs`
- **Keep output contracts unchanged**
  - `CONTEXT.md` remains the discuss artifact
  - `RESEARCH.md` remains the researcher artifact
- **Use the existing ITL SQLite audit store**
  - `.planning/itl/audit.sqlite`
- **Testing stack**
  - `node:test`
  - focused assertions in `tests/*.test.cjs`

## Architecture Patterns

### 1. Treat ITL outputs as context enrichers, not replacement artifacts
The best integration point is to let ITL-derived signals enrich:
- what `discuss-phase` highlights in context,
- what `research-phase` tells the researcher to focus on,
- what assumptions and unknowns are carried into research.

Recommended rule:
- ITL output may add structured hints, priorities, and assumptions.
- CONTEXT.md and RESEARCH.md remain the authoritative downstream files.

### 2. Modify the source workflows, not installed-only surfaces
The repo’s source-of-truth should stay in:
- `commands/gsd/discuss-phase.md`
- `get-stuff-done/workflows/discuss-phase.md`
- `commands/gsd/research-phase.md`
- `get-stuff-done/workflows/research-phase.md`

Installed `/dostuff:*` projections should remain Phase 3’s responsibility.

### 3. Use ITL to improve researcher handoff quality
The main value of Phase 7 is better researcher context.

Recommended behavior:
- `discuss-phase` should preserve a concise narrative-intake summary in CONTEXT.md.
- `research-phase` should explicitly load that richer context and any relevant ITL-derived assumptions.
- Research prompts should call out interpreted goals, constraints, risks, and open questions so the researcher investigates the right edges.

### 4. Preserve phase scope and explicit user decisions
ITL-derived assumptions are useful, but they are not equivalent to user-locked decisions.

Recommended rule:
- User-confirmed choices stay in the decisions sections.
- ITL-derived assumptions and unknowns are marked as guidance for research, not settled policy.
- Scope guardrails from `discuss-phase` remain unchanged.

### 5. Reuse the same bounded-clarification philosophy
Phase 7 should not introduce another long interview loop.

Recommended behavior:
- Use the already-captured narrative interpretation from earlier workflow stages when available.
- Only introduce new clarification when the research handoff would otherwise be low quality.
- Prefer enriching handoff files and prompts over adding new conversational overhead.

### 6. Preserve subagent research ergonomics
`research-phase` exists because the researcher agent needs a clean context window.

Recommended rule:
- Keep the researcher prompt concise but more specific.
- Pass richer context through files and short structured additions, not huge inline dumps.
- Avoid bloating orchestrator context with raw ITL payloads.

### 7. Persist interpreted context in the audit trail
Phase 7 should continue using the same audit persistence established in earlier phases.

Persist:
- any new research-oriented interpretation summaries,
- clarified assumptions that materially change research direction,
- links between raw narrative and research handoff emphasis.

This gives traceability for why research emphasized a given stack, pitfall, or architecture concern.

## Don’t Hand-Roll
- Do not create a parallel research artifact outside `RESEARCH.md`.
- Do not replace CONTEXT.md decisions with raw interpretation JSON.
- Do not treat inferred assumptions as locked user requirements.
- Do not move the research source-of-truth into installed-only `/dostuff:*` files.
- Do not add a heavy new interview layer just to enrich research handoff.

## Common Pitfalls
- Letting ITL assumptions silently override explicit user decisions
- Passing raw ITL blobs into researcher prompts instead of concise structured guidance
- Updating docs or prompts without actually improving the source workflow handoff
- Weakening the distinction between confirmed decisions and inferred assumptions
- Duplicating context between CONTEXT.md and RESEARCH.md in a way that drifts

## Code Examples
- Current source discuss entry point: `commands/gsd/discuss-phase.md`
- Current source discuss workflow: `get-stuff-done/workflows/discuss-phase.md`
- Current source research entry point: `commands/gsd/research-phase.md`
- Current source research workflow: `get-stuff-done/workflows/research-phase.md`
- Existing ITL surface: `get-stuff-done/bin/lib/itl.cjs`
- Existing audit persistence: `get-stuff-done/bin/lib/itl-audit.cjs`

## Prescriptive Recommendation
Implement Phase 7 as the smallest safe vertical slice:

1. Extend the context workflow so narrative-intake summaries and inferred assumptions are preserved in a clearly labeled, downstream-safe form.
2. Update `research-phase` so the researcher prompt explicitly uses that richer context and calls out interpreted goals, constraints, and unknowns.
3. Keep the final contracts unchanged: CONTEXT.md and RESEARCH.md remain the artifacts.
4. Add focused tests/docs proving that research handoff is enriched without collapsing the distinction between decisions and assumptions.

That yields better research direction from ITL without weakening the current workflow boundaries.
