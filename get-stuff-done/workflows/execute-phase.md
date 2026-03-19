<purpose>
Execute all plans in a phase using wave-based parallel execution. Orchestrator stays lean — delegates plan execution to subagents.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. Each subagent loads the full execute-plan context. Orchestrator: discover plans → analyze deps → group waves → spawn agents → handle checkpoints → collect results.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
</required_reading>

<process>

<step name="initialize" priority="first">
Load all context in one call:

```bash
INIT=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" init execute-phase "${PHASE_ARG}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `executor_model`, `verifier_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `state_exists`, `roadmap_exists`, `phase_req_ids`, `clarification_status`.

**Clarification Gate (BLOCK-01):**
```bash
CLARIFICATION_STATUS=$(printf '%s\n' "$INIT" | jq -r '.clarification_status // "none"')
if [ "$CLARIFICATION_STATUS" == "blocked" ]; then
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  BLOCK-01: I'm stuck and need your answer before I can build ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "I cannot proceed with execution because the project is currently BLOCKED."
  echo "Run /gsd:resume-project to address the blocker."
  exit 1
fi
```

**If `phase_found` is false:** Error — phase directory not found.
**If `plan_count` is 0:** Error — no plans found in phase.
**If `state_exists` is false but `.planning/` exists:** Offer reconstruct or continue.

**Orphaned Execution Gate (BLOCK-07):**
```bash
ORPHAN_CHECK=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" verify orphaned-state "${PHASE_ARG}" --raw 2>/dev/null)
ORPHANED=$(printf '%s\n' "$ORPHAN_CHECK" | jq -r '.orphaned // "false"')
if [ "$ORPHANED" == "true" ]; then
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  BLOCK-07: Execution stopped mid-run — incomplete plans found ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  printf '%s\n' "$ORPHAN_CHECK" | jq -r '.message'
  echo ""
  echo "Run /gsd:execute-phase ${PHASE_ARG} again to resume from the last completed plan."
fi
```

Note: BLOCK-07 is advisory, not a hard stop — re-running execute-phase automatically skips completed plans (those with SUMMARY.md) and resumes from the first incomplete one. The block message surfaces the state clearly so the user knows what happened.

When `parallelization` is false, plans within a wave execute sequentially.

**REQUIRED — Sync chain flag with intent.** If user invoked manually (no `--auto`), clear the ephemeral chain flag from any previous interrupted `--auto` chain. This prevents stale `_auto_chain_active: true` from causing unwanted auto-advance. This does NOT touch `workflow.auto_advance` (the user's persistent settings preference). You MUST execute this bash block before any config reads:
```bash
# REQUIRED: prevents stale auto-chain from previous --auto runs
if [[ ! "$ARGUMENTS" =~ --auto ]]; then
  node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" config-set workflow._auto_chain_active false 2>/dev/null
fi
```
</step>

<step name="handle_branching">
Check `branching_strategy` from init:

**"none":** Skip, continue on current branch.

**"phase" or "milestone":** Use pre-computed `branch_name` from init:
```bash
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

All subsequent commits go to this branch. User handles merging.
</step>

<step name="validate_phase">
From init JSON: `phase_dir`, `plan_count`, `incomplete_count`.

Report: "Found {plan_count} plans in {phase_dir} ({incomplete_count} incomplete)"

**Update STATE.md for phase start:**
```bash
node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" state begin-phase --phase "${PHASE_NUMBER}" --name "${PHASE_NAME}" --plans "${PLAN_COUNT}"
```
This updates Status, Last Activity, Current focus, Current Position, and plan counts in STATE.md so frontmatter and body text reflect the active phase immediately.
</step>

<step name="discover_and_group_plans">
Load plan inventory with wave grouping in one call:

```bash
PLAN_INDEX=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" phase-plan-index "${PHASE_NUMBER}")
```

Parse JSON for: `phase`, `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `files_modified`, `task_count`, `has_summary`), `waves` (map of wave number → plan IDs), `incomplete`, `has_checkpoints`.

**Filtering:** Skip plans where `has_summary: true`. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete plans" → exit.

Report:
```
## Execution Plan

**Phase {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="execute_waves">
Execute each wave in sequence. Within a wave: parallel if `PARALLELIZATION=true`, sequential if `false`.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each plan's `<objective>`. Extract what's being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

2. **Spawn executor agents:**

   Pass paths only — executors read files themselves with their fresh 200k context.
   This keeps orchestrator context lean (~10-15%).

   ```
   Task(
     subagent_type="gsd-executor",
     model="{executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md and ROADMAP.md.
       </objective>

       <execution_context>
       @/home/bamn/get-stuff-done/get-stuff-done/workflows/execute-plan.md
       @/home/bamn/get-stuff-done/get-stuff-done/templates/summary.md
       @/home/bamn/get-stuff-done/get-stuff-done/references/checkpoints.md
       @/home/bamn/get-stuff-done/get-stuff-done/references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - {phase_dir}/{plan_file} (Plan)
       - .planning/STATE.md (State)
       - .planning/config.json (Config, if exists)
       - ./CLAUDE.md (Project instructions, if exists — follow project-specific guidelines and coding conventions)
       - .claude/skills/ or .agents/skills/ (Project skills, if either exists — list skills, read SKILL.md for each, follow relevant rules during implementation)
       </files_to_read>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] SUMMARY.md created in plan directory
       - [ ] STATE.md updated with position and decisions
       - [ ] ROADMAP.md updated with plan progress (via `roadmap update-plan-progress`)
       </success_criteria>
     "
   )
   ```

3. **Wait for all agents in wave to complete.**

4. **Report completion — verify artifacts and schema (BLOCK-06):**

   For each SUMMARY.md:
   - **Schema Validation (BLOCK-06):**
     ```bash
     VERIFY_RESULT=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" verify verify-summary "{phase_dir}/{plan}-SUMMARY.md" --raw)
     if [ "$(echo "$VERIFY_RESULT" | jq -r '.passed')" != "true" ]; then
       echo "The plan finished but its completion record is missing required fields."
       echo "I can't mark this plan as done until the record is complete."
       node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" verify verify-summary "{phase_dir}/{plan}-SUMMARY.md"
       # Route to failure handler
     fi
   - Verify first 2 files from `key-files.created` exist on disk
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns ≥1 commit
   - Check for `## Self-Check: FAILED` marker

   If ANY spot-check fails: report which plan failed, route to failure handler — ask "Retry plan?" or "Continue with remaining waves?"

   If pass:
   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

   - Bad: "Wave 2 complete. Proceeding to Wave 3."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

5. **Handle failures:**

   **Known Claude Code bug (classifyHandoffIfNeeded):** If an agent reports "failed" with error containing `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a GSD or agent issue. The error fires in the completion handler AFTER all tool calls finish. In this case: run the same spot-checks as step 4 (SUMMARY.md exists, git commits present, no Self-Check: FAILED). If spot-checks PASS → treat as **successful**. If spot-checks FAIL → treat as real failure below.

   For real failures: report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.

5b. **Pre-wave dependency check (waves 2+ only):**

    Before spawning wave N+1, for each plan in the upcoming wave:
    ```bash
    node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" verify key-links {phase_dir}/{plan}-PLAN.md
    ```

    If any key-link from a PRIOR wave's artifact fails verification:

    ## Cross-Plan Wiring Gap

    | Plan | Link | From | Expected Pattern | Status |
    |------|------|------|-----------------|--------|
    | {plan} | {via} | {from} | {pattern} | NOT FOUND |

    Wave {N} artifacts may not be properly wired. Options:
    1. Investigate and fix before continuing
    2. Continue (may cause cascading failures in wave {N+1})

    Key-links referencing files in the CURRENT (upcoming) wave are skipped.

6. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

7. **Proceed to next wave.**
</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Auto-mode checkpoint handling:**

Read auto-advance config (chain flag + user preference):
```bash
AUTO_CHAIN=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" config-get workflow._auto_chain_active 2>/dev/null || echo "false")
AUTO_CFG=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" config-get workflow.auto_advance 2>/dev/null || echo "false")
```

When executor returns a checkpoint AND (`AUTO_CHAIN` is `"true"` OR `AUTO_CFG` is `"true"`):
- **human-verify** → Auto-spawn continuation agent with `{user_response}` = `"approved"`. Log `⚡ Auto-approved checkpoint`.
- **decision** → Auto-spawn continuation agent with `{user_response}` = first option from checkpoint details. Log `⚡ Auto-selected: [option]`.
- **human-action** → Present to user (existing behavior below). Auth gates cannot be automated.

**Standard flow (not auto-mode, or human-action type):**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate → returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited, plus explicit checkpoint fields: `status`, `why_blocked`, `what_is_uncertain`, `choices`, `allow_freeform`, and `resume_condition`
3.5. **Hard Gate: Validate the checkpoint payload (ENFORCE-02 / BLOCK-05)** before showing it to the user:

First, write the checkpoint fields from the executor's return to disk so the gate can validate them:
```bash
CHECKPOINT_FILE="{phase_dir}/CHECKPOINT.md"
```

Use the Write tool to create `$CHECKPOINT_FILE` with YAML frontmatter containing the fields extracted from the executor's output:
```yaml
---
status: checkpoint
why_blocked: "{extracted from executor output}"
what_is_uncertain: "{extracted from executor output}"
choices: ["{extracted from executor output, as array}"]
allow_freeform: true
resume_condition: "{extracted from executor output}"
---
# Checkpoint
```

Then validate:
```bash
node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" verify checkpoint-response "$CHECKPOINT_FILE"
if [ $? -ne 0 ]; then
  echo "The work stopped but the pause message was incomplete — some fields I need"
  echo "to present the decision to you are missing. I can't ask you the right"
  echo "question until this is fixed. Details above."
  exit 1
fi
```
If malformed, the workflow halts. The agent must produce a valid checkpoint artifact to proceed.

4. **Present to user** — plain language, from the checkpoint fields:
   ```
   ## I need your input to continue

   **What's been built so far ({plan_id}: {plan_name}):**
   {completed_tasks_table from checkpoint — what tasks are done}

   **Why I've stopped:**
   {why_blocked — in the agent's own words, already plain}

   **What I'm uncertain about:**
   {what_is_uncertain}

   {If choices exist:}
   **Your options:**
   {choices, one per line}

   {If allow_freeform is true:}
   You can also describe what you want in your own words.

   **Once you respond, I'll:**
   {resume_condition — what picking an option unlocks}
   ```

   Bad: "Checkpoint: human-verify. Progress: 2/3."
   Good: "I've built the data model and API endpoints. I've stopped because I need you to check the layout before I wire up the frontend — the visual alignment is something only you can judge. Go to localhost:3000/dashboard and tell me if it looks right."

4.5. **Transition CHECKPOINT.md and STATE.md to awaiting-response** (after presenting to user, before waiting for response):
   ```bash
   # Update STATE.md checkpoint lifecycle fields atomically
   node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" state checkpoint \
     --status awaiting-response \
     --path "{phase_dir}/CHECKPOINT.md"

   # Update CHECKPOINT.md status field
   node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" frontmatter set \
     "{phase_dir}/CHECKPOINT.md" --field status --value '"awaiting-response"'

   # Commit both files together
   node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" commit \
     "chore({phase}-checkpoint): update checkpoint to awaiting-response" \
     --files "{phase_dir}/CHECKPOINT.md" .planning/STATE.md
   ```

5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops

8.5. **Transition CHECKPOINT.md and STATE.md to resolved** (after continuation agent completes successfully):
   ```bash
   RESOLVED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

   # Mark CHECKPOINT.md resolved with timestamp
   node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" frontmatter set \
     "{phase_dir}/CHECKPOINT.md" --field status --value '"resolved"'
   node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" frontmatter set \
     "{phase_dir}/CHECKPOINT.md" --field resolved_at --value "\"$RESOLVED_AT\""

   # Clear checkpoint fields from STATE.md (empty values excluded from frontmatter by falsy guard)
   node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" state checkpoint \
     --status "" --path ""

   # Commit both files together
   node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" commit \
     "chore({phase}-checkpoint): resolve checkpoint" \
     --files "{phase_dir}/CHECKPOINT.md" .planning/STATE.md
   ```

   Note: CHECKPOINT.md is kept in the phase directory as a resolved audit artifact (status: resolved, resolved_at set). It does not interfere with future checkpoints because resume-project checks the status field, not file presence.

**Why fresh agent, not resume:** Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable.

**Checkpoints in parallel waves:** Agent pauses and returns while other parallel agents may complete. Present checkpoint, spawn continuation, wait for all before next wave.
</step>

<step name="aggregate_results">
After all waves, produce a completion summary that leads with what was actually built — not just that it's done:

```markdown
## Phase {X}: {Name} — Done

[2-3 sentences in plain English: what this phase delivered, what is now possible that wasn't before, and what it connects to next. Read the SUMMARY.md one-liners to construct this. Example: "The authentication system is now live — users can sign up, log in, and reset passwords. Sessions persist across page reloads. The dashboard phase can now build on top of authenticated routes."]

**{M}/{total} plans complete across {N} waves**

| Wave | Plans | What was built |
|------|-------|----------------|
| 1 | plan-01, plan-02 | [from SUMMARY.md one-liners] |
| CP | plan-03 | ✓ Verified |
| 2 | plan-04 | [from SUMMARY.md one-liner] |

### Issues Encountered
[Aggregate from SUMMARYs, or "None"]
```
</step>

<step name="close_parent_artifacts">
**For decimal/polish phases only (X.Y pattern):** Close the feedback loop by resolving parent UAT and debug artifacts.

**Skip if** phase number has no decimal (e.g., `3`, `04`) — only applies to gap-closure phases like `4.1`, `03.1`.

**1. Detect decimal phase and derive parent:**
```bash
# Check if phase_number contains a decimal
if [[ "$PHASE_NUMBER" == *.* ]]; then
  PARENT_PHASE="${PHASE_NUMBER%%.*}"
fi
```

**2. Find parent UAT file:**
```bash
PARENT_INFO=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" find-phase "${PARENT_PHASE}" --raw)
# Extract directory from PARENT_INFO JSON, then find UAT file in that directory
```

**If no parent UAT found:** Skip this step (gap-closure may have been triggered by VERIFICATION.md instead).

**3. Update UAT gap statuses:**

Read the parent UAT file's `## Gaps` section. For each gap entry with `status: failed`:
- Update to `status: resolved`

**4. Update UAT frontmatter:**

If all gaps now have `status: resolved`:
- Update frontmatter `status: diagnosed` → `status: resolved`
- Update frontmatter `updated:` timestamp

**5. Resolve referenced debug sessions:**

For each gap that has a `debug_session:` field:
- Read the debug session file
- Update frontmatter `status:` → `resolved`
- Update frontmatter `updated:` timestamp
- Move to resolved directory:
```bash
mkdir -p .planning/debug/resolved
mv .planning/debug/{slug}.md .planning/debug/resolved/
```

**6. Commit updated artifacts:**
```bash
node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" commit "docs(phase-${PARENT_PHASE}): resolve UAT gaps and debug sessions after ${PHASE_NUMBER} gap closure" --files .planning/phases/*${PARENT_PHASE}*/*-UAT.md .planning/debug/resolved/*.md
```
</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed tasks.

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}
Phase requirement IDs: {phase_req_ids}
Check must_haves against actual codebase.
Cross-reference requirement IDs from PLAN frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
Create VERIFICATION.md.",
  subagent_type="gsd-verifier",
  model="{verifier_model}"
)
```

Read status:
```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/gsd:plan-phase {phase} --gaps` |

**If human_needed:**
```
## ✓ Phase {X}: {Name} — Human Verification Required

All automated checks passed. {N} items need human testing:

{From VERIFICATION.md human_verification section}

"approved" → continue | Report issues → gap closure
```

**If gaps_found:**
```
## ⚠ Phase {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** {phase_dir}/{phase_num}-VERIFICATION.md

### What's Missing
{Gap summaries from VERIFICATION.md}

---
## ▶ Next Up

`/gsd:plan-phase {X} --gaps`

<sub>`/clear` first → fresh context window</sub>

Also: `cat {phase_dir}/{phase_num}-VERIFICATION.md` — full report
Also: `/gsd:verify-work {X}` — manual testing first
```

Gap closure cycle: `/gsd:plan-phase {X} --gaps` reads VERIFICATION.md → creates gap plans with `gap_closure: true` → user runs `/gsd:execute-phase {X} --gaps-only` → verifier re-runs.
</step>

<step name="update_roadmap">
**Mark phase complete and update all tracking files:**

```bash
COMPLETION=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" phase complete "${PHASE_NUMBER}")
```

The CLI handles:
- Marking phase checkbox `[x]` with completion date
- Updating Progress table (Status → Complete, date)
- Updating plan count to final
- Advancing STATE.md to next phase
- Updating REQUIREMENTS.md traceability

Extract from result: `next_phase`, `next_phase_name`, `is_last_phase`.

```bash
node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```
</step>

<step name="offer_next">

**Exception:** If `gaps_found`, the `verify_phase_goal` step already presents the gap-closure path (`/gsd:plan-phase {X} --gaps`). No additional routing needed — skip auto-advance.

**No-transition check (spawned by auto-advance chain):**

Parse `--no-transition` flag from $ARGUMENTS.

**If `--no-transition` flag present:**

Execute-phase was spawned by plan-phase's auto-advance. Do NOT run transition.md.
After verification passes and roadmap is updated, return completion status to parent:

```
## PHASE COMPLETE

Phase: ${PHASE_NUMBER} - ${PHASE_NAME}
Plans: ${completed_count}/${total_count}
Verification: {Passed | Gaps Found}

[Include aggregate_results output]
```

STOP. Do not proceed to auto-advance or transition.

**If `--no-transition` flag is NOT present:**

**Auto-advance detection:**

1. Parse `--auto` flag from $ARGUMENTS
2. Read both the chain flag and user preference (chain flag already synced in init step):
   ```bash
   AUTO_CHAIN=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" config-get workflow._auto_chain_active 2>/dev/null || echo "false")
   AUTO_CFG=$(node "/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs" config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CHAIN` is true OR `AUTO_CFG` is true (AND verification passed with no gaps):**

```
╔══════════════════════════════════════════╗
║  AUTO-ADVANCING → TRANSITION             ║
║  Phase {X} verified, continuing chain    ║
╚══════════════════════════════════════════╝
```

Execute the transition workflow inline (do NOT use Task — orchestrator context is ~10-15%, transition needs phase completion data already in context):

Read and follow `~/.claude/get-stuff-done/workflows/lib/transition.md`, passing through the `--auto` flag so it propagates to the next phase invocation.

**If none of `--auto`, `AUTO_CHAIN`, or `AUTO_CFG` is true:**

**STOP. Do not auto-advance. Do not execute transition. Do not plan next phase. Present options to the user and wait.**

```
## ✓ Phase {X}: {Name} Complete

/gsd:progress — see updated roadmap
/gsd:discuss-phase {next} — discuss next phase before planning
/gsd:plan-phase {next} — plan next phase
/gsd:execute-phase {next} — execute next phase
```
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context. Subagents: fresh 200k each. No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
- **classifyHandoffIfNeeded false failure:** Agent reports "failed" but error is `classifyHandoffIfNeeded is not defined` → Claude Code bug, not GSD. Spot-check (SUMMARY exists, commits present) → if pass, treat as success
- **Agent fails mid-plan:** Missing SUMMARY.md → report, ask user how to proceed
- **Dependency chain breaks:** Wave 1 fails → Wave 2 dependents likely fail → user chooses attempt or skip
- **All agents in wave fail:** Systemic issue → stop, report for investigation
- **Checkpoint unresolvable:** "Skip this plan?" or "Abort phase execution?" → record partial progress in STATE.md
</failure_handling>

<resumption>
Re-run `/gsd:execute-phase {phase}` → discover_plans finds completed SUMMARYs → skips them → resumes from first incomplete plan → continues wave execution.

STATE.md tracks: last completed plan, current wave, pending checkpoints.
</resumption>
