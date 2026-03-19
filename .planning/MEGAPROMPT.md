# GSD System Contract — Enforcement Megaprompt

**Version:** 2026-03-19
**Purpose:** Canonical enforcement contract for all GSD agents and orchestrators. Every agent that reads this file must treat its invariants as hard constraints, not guidelines.

---

## PART 1 — SYSTEM INVARIANTS

These rules are never negotiable. Any agent that would violate one must stop and escalate instead.

### INV-01: Atomic Commits
Every completed task gets its own git commit **immediately** after completion. No batch commits. No "commit at end." If a task fails mid-execution, the commit for that task does not happen. Prior completed tasks keep their commits.

**Failure mode:** Committing multiple tasks in one commit, or deferring commits to summary time.

### INV-02: State.md is Always Current
STATE.md is updated **before** proceeding to the next task, not at the end of execution. If execution is interrupted, STATE.md reflects the last completed task, not a future state.

**Failure mode:** STATE.md left as "all tasks complete" when only 2 of 5 ran.

### INV-03: User Decisions Are Inviolable
Locked decisions in CONTEXT.md (under `## Decisions`) must be honored exactly. No agent — including the executor applying Deviation Rules 1-3 — may override a locked user decision without escalating to a checkpoint.

**This applies to Deviation Rule 3 specifically.** Before auto-fixing a blocking issue, the executor MUST check: does this fix contradict a locked decision? If yes → escalate to Rule 4 (user required). If no → auto-fix proceeds.

**Failure mode:** Executor adds `async/await` to fix a race condition when CONTEXT.md locked "use Promises only."

### INV-04: Blocked State Propagates
If STATE.md contains `clarification_status: blocked`, ALL of the following commands must refuse to proceed: plan-phase, execute-phase, autonomous. They must route to the unblock flow, not bypass it.

**Failure mode:** plan-phase runs on a blocked project because the flag wasn't checked.

### INV-05: Gates Are Not Optional
All mandatory verification gates (verify research-contract, verify checkpoint-response, plan-checker requirement traceability) must fire on every invocation of their respective commands. They cannot be skipped by flags, configuration, or "it's probably fine."

The only exception: `mode: yolo` in config.json explicitly acknowledges skipping non-safety gates. Safety gates (CONTEXT.md compliance, blocked-state check) are never skipped regardless of mode.

### INV-06: Checkpoints Are Opaque to Automation
A `checkpoint:human-verify` or `checkpoint:human-action` task means a human must respond. Auto-mode (`auto_chain_active: true`, `auto_advance: true`) may auto-approve `human-verify` checkpoints but NEVER `human-action` checkpoints. `human-action` = auth gate, external trigger, or irreversible real-world action.

### INV-07: No Phantom Features
No CHANGELOG entry may document a feature that is not implemented in at least one of: an agent file, a command workflow, a gsd-tools CLI command, or a test. Planned features are labeled `[planned]` not described as shipped.

---

## PART 2 — SUCCESS METRICS PER OPERATION

### discuss-phase SUCCESS
- [ ] Every gray area identified is **specific to this phase** — not recycled from a prior phase or generic category list
- [ ] Each gray area gets 3-5 questions, not a single yes/no
- [ ] Questions ask for the reasoning behind choices, not just the choice itself ("Why that layout?" not just "Which layout?")
- [ ] User decisions are recorded in three distinct buckets: Locked, Deferred, Discretion
- [ ] No gray area is skipped because "it's probably obvious" — obvious choices still get recorded as Locked so they're traceable

### plan-phase SUCCESS
- [ ] Every requirement ID in REQUIREMENTS.md relevant to this phase appears in at least one plan's `requirements` field
- [ ] Every locked decision from CONTEXT.md has a concrete task implementing it
- [ ] No deferred idea from CONTEXT.md appears in any task
- [ ] Plans are decomposed to 2-3 tasks each — single-task plans only for genuinely atomic work
- [ ] Wave assignments are based on actual data dependencies, not just "run these first"
- [ ] Research contract gate passed: research output doesn't carry forward guidance-only items as implementation requirements
- [ ] Plan-checker ran and returned PASS before plans are finalized

### execute-phase SUCCESS
- [ ] Every task has a commit immediately after completion
- [ ] STATE.md reflects current position after each task
- [ ] No deviation was applied that contradicts CONTEXT.md locked decisions
- [ ] All architectural deviations (Rule 4) produced a checkpoint — user was consulted
- [ ] verify checkpoint-response gate passed before wave N+1 began
- [ ] SUMMARY.md validates against `executionSummarySchema` (one_liner, work_completed, key_files, verification, requirements_completed)
- [ ] SUMMARY.md requirements_completed field lists specific requirement IDs, not descriptions

### verify-work SUCCESS
- [ ] Every must-have from PLAN.md verification criteria is presented as a distinct test
- [ ] Tests are presented one at a time with expected outcome stated before asking for result
- [ ] Any failure triggers structured diagnosis: what failed, what was expected, what was observed
- [ ] Re-verification skips already-passed items (no redundant re-testing)
- [ ] Session persists across context resets — partially-verified state is resumable

### plan-checker SUCCESS
- [ ] Requirement coverage check is BLOCKING — any missing requirement ID = FAIL (not warning)
- [ ] CONTEXT.md compliance check is BLOCKING — any plan contradicting locked decision = FAIL
- [ ] Wave dependency check passes — no Plan A in wave 2 that reads output from Plan B also in wave 2
- [ ] Returns explicit PASS/FAIL with specific evidence for each dimension checked

### gsd-verifier SUCCESS
- [ ] Goal-backward analysis performed: phase goal → must-haves → evidence in code
- [ ] Re-verification mode: only failed items get full re-check; passed items get regression-only check
- [ ] VERIFICATION.md produced with explicit PASS/FAIL per must-have, not summary judgments

### debug SUCCESS
- [ ] Root cause identified, not just symptom suppressed
- [ ] Hypothesis tested against real system, not assumed
- [ ] Fix verified by reproducing then confirming the original failure condition no longer triggers
- [ ] Knowledge base entry written to `.planning/debug/knowledge-base.md` documenting: symptom, root cause, fix, prevention

---

## PART 3 — FAILURE CRITERIA (HARD BLOCKERS)

A hard blocker causes the command to STOP and surface the issue to the user. No workarounds.

### BLOCK-01: Blocked Clarification State
`clarification_status: blocked` in STATE.md → stop plan-phase, execute-phase, autonomous. Output: exactly what is blocked, what the user needs to resolve, how to resume.

### BLOCK-02: Missing Requirement Coverage
Plan-checker finds a REQUIREMENTS.md ID with no plan coverage → FAIL. Output: which requirement IDs are uncovered, which phase they belong to.

### BLOCK-03: CONTEXT.md Violation in Plan
Any task that contradicts a locked CONTEXT.md decision → FAIL. Output: which task, which decision, the exact contradiction.

### BLOCK-04: Failed Research Contract
Research output contains guidance-only items carried forward as implementation requirements, or silently drops an ambiguity that should have become a locked decision → FAIL. Output: the specific item that failed the contract.

### BLOCK-05: Invalid Checkpoint Response
Checkpoint response missing required fields (status, why_blocked, what_is_uncertain, resume_condition) or status="continue" with unresolved blocking conditions → wave cannot advance.

### BLOCK-06: SUMMARY.md Schema Failure
SUMMARY.md does not validate against executionSummarySchema after execution → FAIL. The phase is not "complete" until the schema passes.

### BLOCK-07: Orphaned Phase State
STATE.md shows a task as "in_progress" but no commit exists for it, AND the executor is not currently running → dead state. Resume-work must detect and surface this, not silently route to continue.

---

## PART 4 — GATE ENFORCEMENT SPECIFICATION

### Gate: verify research-contract (plan-phase inline path)
**When:** plan-phase runs with research enabled (default or `--research`)
**Trigger:** After research agent returns, before planner agent runs
**Check:**
1. Research output must not contain phrases like "you should" or "consider using" as implementation directives — these are guidance, not requirements
2. Every ambiguity identified in discuss-phase ITL output must appear either as a resolved locked decision or as an explicit research finding
3. Research output must reference actual library versions, not just library names
**Pass:** All checks clear → planner proceeds
**Fail (BLOCK-04):** Any check fails → surface specific items to user before planning

### Gate: verify checkpoint-response (execute-phase wave boundary)
**When:** A checkpoint task in wave N completes, before wave N+1 begins
**Check:**
1. Checkpoint response contains: status, why_blocked, what_is_uncertain, choices (if decision type), allow_freeform, resume_condition
2. If status="continue", the resume_condition from the prior checkpoint must be demonstrably met
3. Response must not be "user approved" or "yes proceed" — must be substantive engagement with the checkpoint question
**Pass:** Response valid → wave N+1 proceeds
**Fail (BLOCK-05):** Surface malformed or insufficient response to user

### Gate: plan-checker requirement traceability (Dimension 1)
**When:** plan-phase verification loop, before plans are finalized
**Check:** Every requirement ID in REQUIREMENTS.md scoped to this phase has at least one plan entry in the `requirements:` field
**Pass:** All IDs covered
**Fail (BLOCK-02):** STOP. List uncovered IDs. Planner must add coverage before output is accepted.

### Gate: CONTEXT.md compliance in executor (Deviation Rules 1-3)
**When:** Executor is about to apply Deviation Rule 1, 2, or 3
**Check:** Does the proposed fix touch any behavior, library, pattern, or architecture item that a locked CONTEXT.md decision specifies?
**Pass:** No conflict → apply deviation automatically
**Fail (INV-03):** Escalate to Rule 4 checkpoint. Do not apply the fix.

### Gate: blocked-state check (plan-phase, execute-phase, autonomous entry)
**When:** Any of these commands is invoked
**Check:** `gsd-tools state-read` → `clarification_status` field
**Pass:** Field is absent or `resolved`
**Fail (BLOCK-01):** Output the block reason from STATE.md. Route user to resolve flow. Do not continue.

### Gate: SUMMARY.md schema validation (execute-phase completion)
**When:** Executor produces SUMMARY.md
**Check:** `cmdVerifySummary` validates against `executionSummarySchema`
**Pass:** Schema valid → phase marked complete
**Fail (BLOCK-06):** Surface specific schema violations. Executor must fix SUMMARY.md before completion is accepted.

### Gate: Cross-Plan Data Contract check (plan-checker Dimension 9)
**When:** plan-checker runs on a wave containing ≥2 parallel plans that share file targets
**Check:**
1. Identify output files written by Plan A in wave N
2. Identify input files read by Plan B in the same wave N
3. If A writes a file B reads → data race. This is a dependency that requires wave separation
4. Identify shared module exports: if Plan A adds a function `foo()` and Plan B calls `foo()`, they must be in different waves
**Pass:** No cross-plan data conflicts in same wave
**Fail:** Surface the specific file or export conflict. Require wave reassignment before proceeding.

---

## PART 5 — HUMAN INTERACTION PROTOCOL

### Core Principle
Every question must:
1. State WHY it matters — what decision it enables
2. State WHAT happens if we get it wrong — the cost of a bad answer
3. Offer concrete options when they exist, with a freeform fallback when they might not
4. Never ask a yes/no question when a nuanced answer would reveal more

### Language Rules
- Replace "gray areas" with "decisions we need to lock before building"
- Replace "requirements" with "what it must do"
- Replace "blocked clarification state" with "I'm stuck and need your answer before I can make a plan"
- Replace "deviation" with "I hit something unexpected"
- Replace "checkpoint" with "I need you to look at something before I continue"
- Replace "wave" with "batch of work that can run at the same time"
- Replace "autonomous mode" with "keep going without asking me"
- Replace "research contract" with "making sure the research actually found answers, not just suggestions"

### discuss-phase — Question Protocol

**Opening (never skip this):**
> "I'm looking at Phase [N]: [phase goal]. Before I make a plan, I need to lock in some decisions — things where the wrong choice would cost real rework later. Let me walk through them one at a time."

**For each decision area:**
1. Explain what the area is in plain terms: "This is about how [X] will look/work/behave."
2. Explain why it matters: "If we get this wrong, [consequence] — and changing it later means [cost]."
3. Present 2-3 specific options with brief tradeoffs, not just option names
4. Ask which they prefer OR if none fit, ask them to describe what they want
5. Ask follow-up: "Is there anything about that choice that should definitely NOT be included?"
6. Confirm: "So I'll lock in: [their choice]. I'll make sure every task in this phase follows that. Sound right?"

**Questions to always ask (if not already locked from prior phases):**
- "Will any part of this phase need to run at the same time as another part? Or does everything need to happen in order?" (parallelization impact)
- "Does this phase need to hand off data or interfaces to a later phase? If so, what does that handoff look like?" (integration surface)
- "What would tell you this phase is done? Not done-enough — actually done." (acceptance bar)
- "Is there anything from a previous phase that this phase must not break?" (regression surface)

**Questions to NEVER ask:**
- "Any other considerations?" (too vague, always gets "no")
- "Does that sound good?" (leading)
- "Is this feature important?" (they're all important to someone)

### quick command — Scope Probing Protocol

Before executing a quick task, always establish scope with these three questions:

1. **Complexity check:** "Is this a change to one file, a few files, or does it touch how different parts connect?" (Single file → just do it. Multiple files → checkpoint at halfway. Architectural → suggest full plan-phase instead.)

2. **Dependency check:** "Does anything else depend on what you're asking me to change?" (No → proceed. Yes → name the dependents, ask if they need updating too.)

3. **Reversibility check:** "If this doesn't look right, how easy is it to undo?" (Easy → proceed. Hard → confirm before proceeding.)

If all three answers point to small/isolated/reversible → proceed immediately. If any answer flags complexity → say "This is bigger than a quick task. Do you want me to make a proper plan, or should I proceed knowing [the specific risk]?"

### debug command — Structured Diagnosis Protocol

Opening question (always):
> "Describe what's broken. Tell me: what you expected to happen, what actually happened, and when it started. The more specific the better — exact error messages, exact steps to reproduce."

Then before hypothesizing, ask:
1. "Has this ever worked? If yes, what changed between when it worked and when it broke?"
2. "Is it broken every time, or only sometimes? If sometimes — under what conditions?"
3. "Have you already tried anything to fix it? What happened?"

Hypothesis framing (before each attempt):
> "My hypothesis is [X]. I think this because [evidence]. To test it, I'll [action]. If I'm right, [expected result]. If I'm wrong, [what that tells us next]."

Never skip hypothesis → test → conclude cycle. Never suppress a symptom and call it fixed.

### new-project — Narrative Capture Protocol

Opening (always):
> "Tell me what you're trying to build. Don't worry about the technical details yet — just describe it like you'd tell a friend. What problem does it solve? Who uses it? What does success look like?"

After narrative capture, before interpreting:
> "Let me make sure I understood that right. You're building [restatement]. The main thing it needs to do is [core function]. The people using it are [users]. I'll use that as my starting point — does that sound right?"

Bounded clarification (only ask if blocking):
> "One thing I need to understand before I can make a good plan: [specific ambiguity]. This matters because [why it changes the approach]. Which of these fits better — [option A], [option B], or something else entirely?"

Stop clarifying when: the restatement is confirmed, core function is understood, users are identified. Do not ask about tech stack, hosting, or implementation details at intake — those come from research and discussion phases.

### verify-work — Test Presentation Protocol

For each test:
> "Here's what I built for [requirement]. **What you should be able to do:** [concrete action]. **What should happen:** [expected result]. Go ahead and try it — does it work as described?"

If they say no:
> "Tell me what happened instead. Be as specific as you can — what did you see, what did you click, what was the error? I'll use that to figure out what went wrong."

Never say "did verification pass?" — make them describe the actual experience.

---

## PART 6 — IMPLEMENTATION PRIORITIES (What Must Be Fixed)

Ordered by severity. Items 1-3 are CRITICAL (break core guarantees). Items 4-6 are HIGH (degrade quality).

### P1: Executor CONTEXT.md compliance check (INV-03, Gate)
**What:** Before applying Deviation Rules 1-3, check if the change contradicts a locked CONTEXT.md decision.
**Where:** `agents/gsd-executor.md` — add to `<deviation_rules>` section before "Shared process for Rules 1-3"
**Implementation:** Add step: "Before applying Rule 1, 2, or 3: scan CONTEXT.md `## Decisions` section. If proposed fix touches any locked decision, treat as Rule 4 regardless of fix type."

### P2: Cross-Plan Data Contract gate (Gate: Dimension 9)
**What:** plan-checker must detect when parallel plans in the same wave read/write the same files or depend on exports from each other.
**Where:** `agents/gsd-plan-checker.md` — add Dimension 9 section
**Implementation:** Add systematic check: (1) collect output files per plan per wave, (2) collect input files per plan per wave, (3) flag intersections as data race requiring wave separation.

### P3: Quick command scope probing (Human Interaction)
**What:** quick.md must ask three scope questions before executing non-trivial tasks.
**Where:** `commands/gsd/quick.md`
**Implementation:** Add pre-flight section with complexity/dependency/reversibility questions. Route based on answers.

### P4: verify-work auto-diagnosis (README accuracy + feature)
**What:** README claims debug agents are spawned on failure. Either implement it or correct the README.
**Where:** `commands/gsd/verify-work.md` (or `get-stuff-done/workflows/verify-work.md` equivalent), `README.md`
**Implementation:** On failure report → spawn gsd-debugger with failure context. Or: update README to say "Diagnoses failures through structured questions" instead of "Spawns debug agents."

### P5: debug command structured diagnosis (Human Interaction)
**What:** Debug command opens too wide — needs the structured hypothesis protocol.
**Where:** `commands/gsd/debug.md`
**Implementation:** Add the three opening questions and hypothesis framing protocol from Part 5.

### P6: CHANGELOG accuracy (INV-07)
**What:** Remove or label-as-planned: "Cross-Plan Data Contracts (Dimension 9)" and "Export-level spot check in verify-phase" — neither is implemented.
**Where:** `CHANGELOG.md`
**Implementation:** Mark both as `[planned - not yet implemented]` until their respective gates are live.

---

## PART 7 — VERIFICATION CHECKLIST FOR THIS MEGAPROMPT

This document is not complete until:

- [x] P1 (CONTEXT.md compliance in executor) is implemented and tested
- [x] P2 (Cross-Plan Data Contract gate) is implemented in plan-checker with at least one test
- [x] P3 (Quick scope probing) is implemented in quick.md command
- [x] P4 (verify-work auto-diagnosis OR README correction) is resolved — no undefined behavior
- [x] P5 (debug structured diagnosis) is implemented
- [x] P6 (CHANGELOG accuracy) is corrected
- [x] All gates in Part 4 have at least one test in `tests/` exercising the BLOCK path
- [x] All BLOCK codes (BLOCK-01 through BLOCK-07) surface plain-language error messages following Part 5 language rules

---

*This document is the authoritative source for enforcement behavior. When an agent prompt and this document conflict, this document wins. When this document and a locked CONTEXT.md decision conflict, CONTEXT.md wins.*
