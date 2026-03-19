# Phase 18: Context Enrichment — Research Report

**Goal:** Before escalating clarification to the user, the system harvests ambient project state and either auto-resolves or narrows the question using that context.

## What do I need to know to PLAN this phase well?

### 1. Context Harvesting Strategy (CONTEXT-01)

To fulfill **CONTEXT-01**, the system must systematically gather data from multiple sources.

**Sources identified:**
- `.planning/STATE.md`: Provides `current_focus`, `clarification_status`, `decisions`, and `blockers`.
- `.planning/PROJECT.md`: Provides high-level vision, non-negotiables, and user preferences.
- `.planning/REQUIREMENTS.md`: Provides project-wide acceptance criteria and constraints.
- `{phase_dir}/{padded_phase}-CONTEXT.md`: Provides decisions already made in the current phase.
- `{phase_dir}/*-PLAN.md`: Provides the intended steps and tasks (if they exist).

**Implementation Path:**
- Add `harvestAmbientContext(cwd, phaseNumber)` to `get-stuff-done/bin/lib/state.cjs`. This function should return a structured JSON object combining data from the files above.
- Add a corresponding command `state harvest-context --phase {N}` to `gsd-tools.cjs`.

---

### 2. Clarification Enrichment (CONTEXT-02 & 03)

Harvested context should be used to improve the ITL "seeds" and clarification prompts.

**Workflow Integration:**
- **CONTEXT-03**: `itl.cjs` functions (`buildDiscussPhaseSeed`, `buildInitializationSeed`, etc.) should be updated to accept `ambient_context` in their `options` object.
- **CONTEXT-02**: `buildClarificationPrompt(finding)` in `itl.cjs` should be upgraded to `buildClarificationPrompt(finding, ambientContext)`.

**Auto-Resolution Logic:**
- If ITL detects a `missing-goal` but `ambientContext.project_goals` contains relevant items, the prompt should change from "What is your goal?" to "Your project goal is [X]. Does this apply to this phase, or do you have a specific phase-level outcome in mind?".
- If `vague-language` is detected regarding a term defined in `PROJECT.md` or a prior decision in `STATE.md`, the prompt should reference that definition/decision to narrow the user's choices.

---

### 3. ITL Output Persistence (CONTEXT-04)

Currently, ITL results are ephemeral or buried in a SQLite audit log. **CONTEXT-04** requires persistent, phase-specific JSON.

**Implementation Path:**
- Create `persistItlOutput(cwd, phaseNumber, itlResult)` in `get-stuff-done/bin/lib/itl.cjs`.
- Target path: `.planning/phases/{phase_dir}/{padded_phase}-ITL.json`.
- This file should store the full `interpretationResultSchema` output, including `ambiguity` scores and `lockability` status.
- **Workflow Hook:** Call this function at the end of `itl discuss-seed` and `itl init-seed`.

---

### 4. Target Integration Points

**`discuss-phase.md`**:
- The `capture_narrative` step should invoke the new `state harvest-context` command.
- The resulting JSON should be passed to `itl discuss-seed` via the `--context` flag (which needs to be added to `gsd-tools.cjs`).

**`plan-phase.md`**:
- The `Initialize` step already checks `clarification_status`. It should be enhanced to read the `{phase}-ITL.json` to understand the *why* behind a block before spawning the researcher.

---

### 5. Identified Risks & Guardrails

- **Context Inflation:** Passing the entire `STATE.md` and `REQUIREMENTS.md` into every LLM call might bloat the prompt. We should only pass "Relevant" sections (e.g., Decisions and current requirements).
- **Stale State:** If a user manually edits `STATE.md` but `ITL.json` remains, there might be drift. The system should prioritize the freshest source or re-run ITL if it detects a mismatch.
- **Contradiction Handling:** If the user narrative contradicts `STATE.md`, the ITL engine should flag this as a `priority-conflict` or `scope-contradiction` rather than silently "auto-resolving" it.

## Requirement Traceability

| ID | Requirement | Research Outcome |
|----|-------------|-------------------|
| CONTEXT-01 | Harvest STATE/CONTEXT/PLAN | New `state harvest-context` command proposed. |
| CONTEXT-02 | Include state in prompts | `buildClarificationPrompt` to be updated with ambient context. |
| CONTEXT-03 | `discuss-seed` context | `buildDiscussPhaseSeed` to receive harvested context. |
| CONTEXT-04 | Persist ITL JSON | New `{phase}-ITL.json` artifact defined. |

---
*Research completed: 2026-03-17*
