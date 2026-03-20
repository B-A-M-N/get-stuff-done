<trigger>
Use this workflow when:
- Starting a new session on an existing project
- User says "continue", "what's next", "where were we", "resume"
- Any planning operation when .planning/ already exists
- User returns after time away from project
</trigger>

<purpose>
Instantly restore full project context so "Where were we?" has an immediate, complete answer.
</purpose>

<required_reading>
@$HOME/.claude/get-stuff-done/references/continuation-format.md
</required_reading>

<process>

<step name="initialize">
Load all context in one call:

```bash
INIT=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" init resume)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `state_exists`, `roadmap_exists`, `project_exists`, `planning_exists`, `has_interrupted_agent`, `interrupted_agent_id`, `commit_docs`.

**If `state_exists` is true:** Proceed to load_state
**If `state_exists` is false but `roadmap_exists` or `project_exists` is true:** Offer to reconstruct STATE.md
**If `planning_exists` is false:** This is a new project - route to /gsd:new-project
</step>

<step name="load_state">

Read and parse STATE.md, then PROJECT.md:

```bash
cat .planning/STATE.md
cat .planning/PROJECT.md
```

**From STATE.md extract:**

- **Project Reference**: Core value and current focus
- **Current Position**: Phase X of Y, Plan A of B, Status
- **Progress**: Visual progress bar
- **Recent Decisions**: Key decisions affecting current work
- **Pending Todos**: Ideas captured during sessions
- **Blockers/Concerns**: Issues carried forward
- **Session Continuity**: Where we left off, any resume files

**From PROJECT.md extract:**

- **What This Is**: Current accurate description
- **Requirements**: Validated, Active, Out of Scope
- **Key Decisions**: Full decision log with outcomes
- **Constraints**: Hard limits on implementation

</step>

<step name="check_checkpoint_artifact">
After reading STATE.md in load_state, check for an active checkpoint before proceeding:

```bash
# Read checkpoint fields from STATE.md frontmatter (machine-readable, not body text)
STATE_JSON=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" state json 2>/dev/null || echo '{}')
CLARIFICATION_STATUS=$(echo "$STATE_JSON" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try { const j=JSON.parse(d); process.stdout.write(j.clarification_status || ''); } catch { }")
LAST_CLARIFICATION_REASON=$(echo "$STATE_JSON" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try { const j=JSON.parse(d); process.stdout.write(j.last_clarification_reason || ''); } catch { }")

if [ "$CLARIFICATION_STATUS" == "blocked" ]; then
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  PROJECT BLOCKED: CLARIFICATION REQUIRED                     ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  if [ -n "$LAST_CLARIFICATION_REASON" ] && [ "$LAST_CLARIFICATION_REASON" != "None" ]; then
    echo "Reason: $LAST_CLARIFICATION_REASON"
  else
    echo "⚠ DEADLOCK DETECTED: Project is blocked but no reason was provided."
    echo "This usually happens when legacy state is imported or a session crashed."
  fi
  echo ""
  echo "To unblock, run:"
  echo "/gsd:discuss-phase {current_phase}"
  echo ""
  if [ -z "$LAST_CLARIFICATION_REASON" ] || [ "$LAST_CLARIFICATION_REASON" == "None" ]; then
    echo "Alternatively, if this is a ghost block, force unblock with:"
    echo "node \"$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs\" state record-session --clarification-status none"
  fi
  exit 0 # STOP
fi

CHECKPOINT_STATUS=$(echo "$STATE_JSON" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try { const j=JSON.parse(d); process.stdout.write(j.checkpoint_status || ''); } catch { }")
CHECKPOINT_PATH=$(echo "$STATE_JSON" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try { const j=JSON.parse(d); process.stdout.write(j.checkpoint_path || ''); } catch { }")
```

**Branch on CHECKPOINT_STATUS:**

**If empty/null or "resolved":** No active checkpoint. Proceed to `check_incomplete_work` step normally.

**If "pending" or "awaiting-response":**

```bash
# Step 1: Check if artifact file exists
if [ -z "$CHECKPOINT_PATH" ] || [ ! -f "$CHECKPOINT_PATH" ]; then
  # File missing — recovery path
  CURRENT_PLAN=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" state get "Current Plan" --raw 2>/dev/null || echo "unknown")
  echo "CHECKPOINT FILE MISSING"
  echo "Status in STATE.md: $CHECKPOINT_STATUS"
  echo "Expected artifact: ${CHECKPOINT_PATH:-not set}"
  echo ""
  echo "The session likely ended before the checkpoint artifact was fully written."
  echo "Last completed plan: $CURRENT_PLAN"
  echo ""
  echo "To get back to where you were, re-run: /gsd:execute-phase {phase}"
  # STOP — do not proceed to check_incomplete_work
fi

# Step 2: Validate the artifact against checkpointArtifactSchema
VALIDATION=$(node -e "
  const { checkpointArtifactSchema } = require(process.env.HOME + '/get-stuff-done/get-stuff-done/bin/lib/artifact-schema.cjs');
  const { extractFrontmatter } = require(process.env.HOME + '/get-stuff-done/get-stuff-done/bin/lib/frontmatter.cjs');
  const fs = require('fs');
  try {
    const content = fs.readFileSync('$CHECKPOINT_PATH', 'utf-8');
    const fm = extractFrontmatter(content);
    const result = checkpointArtifactSchema.safeParse(fm);
    console.log(JSON.stringify({
      valid: result.success,
      data: result.success ? result.data : null,
      errors: result.success ? [] : result.error.issues.map(i => i.message)
    }));
  } catch (e) {
    console.log(JSON.stringify({ valid: false, data: null, errors: [e.message] }));
  }
" 2>/dev/null)

VALID=$(echo "$VALIDATION" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); process.stdout.write(String(j.valid));}catch{process.stdout.write('false')}")

if [ "$VALID" != "true" ]; then
  # Invalid artifact — recovery path
  ERRORS=$(echo "$VALIDATION" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); process.stdout.write(j.errors.join(', '));}catch{}")
  CURRENT_PLAN=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" state get "Current Plan" --raw 2>/dev/null || echo "unknown")
  echo "CHECKPOINT FILE INVALID"
  echo "Artifact: $CHECKPOINT_PATH"
  echo "Validation errors: $ERRORS"
  echo "Last completed plan: $CURRENT_PLAN"
  echo ""
  echo "To get back to where you were, re-run: /gsd:execute-phase {phase}"
  # STOP — do not proceed to check_incomplete_work
fi

# Step 3: Valid artifact — present summary and route back to execute-phase
CHECKPOINT_DATA=$(echo "$VALIDATION" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); process.stdout.write(JSON.stringify(j.data));}catch{}")
TYPE=$(echo "$CHECKPOINT_DATA" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); process.stdout.write(j.type);}catch{}")
WHY=$(echo "$CHECKPOINT_DATA" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); process.stdout.write(j.why_blocked);}catch{}")
CHOICES=$(echo "$CHECKPOINT_DATA" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); process.stdout.write(j.choices);}catch{}")
RESUME=$(echo "$CHECKPOINT_DATA" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); process.stdout.write(j.resume_condition);}catch{}")

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  CHECKPOINT AWAITING RESPONSE                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Type:            $TYPE"
echo "Why blocked:     $WHY"
echo "Choices:         $CHOICES"
echo "Resume when:     $RESUME"
echo ""
echo "Resume: /gsd:execute-phase {phase}"
echo "(Re-run execute-phase to continue from this checkpoint — do not respond here)"
# STOP — do not proceed to check_incomplete_work or determine_next_action
```

**Key rule:** When any of the STOP branches fires, present the message to the user and end the resume-project workflow at this step. Do NOT route to check_incomplete_work, present_status, determine_next_action, or offer_options. The user's only path forward is re-running `/gsd:execute-phase`.
</step>

<step name="check_incomplete_work">
Look for incomplete work that needs attention:

```bash
# Check for continue-here files (mid-plan resumption)
ls .planning/phases/*/.continue-here*.md 2>/dev/null

# Check for plans without summaries (incomplete execution)
for plan in .planning/phases/*/*-PLAN.md; do
  summary="${plan/PLAN/SUMMARY}"
  if [ ! -f "$summary" ]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  BLOCK-07: Orphaned Phase State                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Incomplete: $plan"
    echo "STATE.md shows this plan as active but no completion summary exists."
  fi
done 2>/dev/null

# Check for interrupted agents (use has_interrupted_agent and interrupted_agent_id from init)
if [ "$has_interrupted_agent" = "true" ]; then
  echo "Interrupted agent: $interrupted_agent_id"
fi
```

**If .continue-here file exists:**

- This is a mid-plan resumption point
- Read the file for specific resumption context
- Flag: "Found mid-plan checkpoint"

**If PLAN without SUMMARY exists:**

- Execution was started but not completed
- Flag: "Found incomplete plan execution"

**If interrupted agent found:**

- Subagent was spawned but session ended before completion
- Read agent-history.json for task details
- Flag: "Found interrupted agent"
  </step>

<step name="present_status">
Present complete project status to user:

```
╔══════════════════════════════════════════════════════════════╗
║  PROJECT STATUS                                               ║
╠══════════════════════════════════════════════════════════════╣
║  Building: [one-liner from PROJECT.md "What This Is"]         ║
║                                                               ║
║  Phase: [X] of [Y] - [Phase name]                            ║
║  Plan:  [A] of [B] - [Status]                                ║
║  Progress: [██████░░░░] XX%                                  ║
║                                                               ║
║  Last activity: [date] - [what happened]                     ║
╚══════════════════════════════════════════════════════════════╝

[If incomplete work found:]
⚠️  Incomplete work detected:
    - [.continue-here file or incomplete plan]

[If interrupted agent found:]
⚠️  Interrupted agent detected:
    Agent ID: [id]
    Task: [task description from agent-history.json]
    Interrupted: [timestamp]

    Resume with: Task tool (resume parameter with agent ID)

[If pending todos exist:]
📋 [N] pending todos — /gsd:check-todos to review

[If blockers exist:]
⚠️  Carried concerns:
    - [blocker 1]
    - [blocker 2]

[If alignment is not ✓:]
⚠️  Brief alignment: [status] - [assessment]
```

</step>

<step name="determine_next_action">
Based on project state, determine the most logical next action:

**If interrupted agent exists:**
→ Primary: Resume interrupted agent (Task tool with resume parameter)
→ Option: Start fresh (abandon agent work)

**If .continue-here file exists:**
→ Primary: Resume from checkpoint
→ Option: Start fresh on current plan

**If incomplete plan (PLAN without SUMMARY):**
→ Primary: Complete the incomplete plan
→ Option: Abandon and move on

**If phase in progress, all plans complete:**
→ Primary: Transition to next phase
→ Option: Review completed work

**If phase ready to plan:**
→ Check if CONTEXT.md exists for this phase:

- If CONTEXT.md missing:
  → Primary: Discuss phase vision (how user imagines it working)
  → Secondary: Plan directly (skip context gathering)
- If CONTEXT.md exists:
  → Primary: Plan the phase
  → Option: Review roadmap

**If phase ready to execute:**
→ Primary: Execute next plan
→ Option: Review the plan first
</step>

<step name="offer_options">
Present contextual options based on project state:

```
What would you like to do?

[Primary action based on state - e.g.:]
1. Resume interrupted agent [if interrupted agent found]
   OR
1. Execute phase (/gsd:execute-phase {phase})
   OR
1. Discuss Phase 3 context (/gsd:discuss-phase 3) [if CONTEXT.md missing]
   OR
1. Plan Phase 3 (/gsd:plan-phase 3) [if CONTEXT.md exists or discuss option declined]

[Secondary options:]
2. Review current phase status
3. Check pending todos ([N] pending)
4. Review brief alignment
5. Something else
```

**Note:** When offering phase planning, check for CONTEXT.md existence first:

```bash
ls .planning/phases/XX-name/*-CONTEXT.md 2>/dev/null
```

If missing, suggest discuss-phase before plan. If exists, offer plan directly.

Wait for user selection.
</step>

<step name="route_to_workflow">
Based on user selection, route to appropriate workflow:

- **Execute plan** → Show command for user to run after clearing:
  ```
  ---

  ## ▶ Next Up

  **{phase}-{plan}: [Plan Name]** — [objective from PLAN.md]

  `/gsd:execute-phase {phase}`

  <sub>`/clear` first → fresh context window</sub>

  ---
  ```
- **Plan phase** → Show command for user to run after clearing:
  ```
  ---

  ## ▶ Next Up

  **Phase [N]: [Name]** — [Goal from ROADMAP.md]

  `/gsd:plan-phase [phase-number]`

  <sub>`/clear` first → fresh context window</sub>

  ---

  **Also available:**
  - `/gsd:discuss-phase [N]` — gather context first
  - `/gsd:research-phase [N]` — investigate unknowns

  ---
  ```
- **Transition** → ./transition.md
- **Check todos** → Read .planning/todos/pending/, present summary
- **Review alignment** → Read PROJECT.md, compare to current state
- **Something else** → Ask what they need
</step>

<step name="update_session">
Before proceeding to routed workflow, update session continuity:

Update STATE.md:

```markdown
## Session Continuity

Last session: [now]
Stopped at: Session resumed, proceeding to [action]
Resume file: [updated if applicable]
Clarification Status: [none / pending / resolved / deferred / blocked]
Clarification Rounds: [N]
Last Clarification Reason: [Most recent checkpoint reason or None]
Resume Requires User Input: [true / false]
```

This ensures if session ends unexpectedly, next resume knows the state.
</step>

</process>

<reconstruction>
If STATE.md is missing but other artifacts exist:

"STATE.md missing. Reconstructing from artifacts..."

1. Read PROJECT.md → Extract "What This Is" and Core Value
2. Read ROADMAP.md → Determine phases, find current position
3. Scan \*-SUMMARY.md files → Extract decisions, concerns
4. Count pending todos in .planning/todos/pending/
5. Check for .continue-here files → Session continuity

Reconstruct and write STATE.md, then proceed normally.

This handles cases where:

- Project predates STATE.md introduction
- File was accidentally deleted
- Cloning repo without full .planning/ state
  </reconstruction>

<quick_resume>
If user says "continue" or "go":
- Load state silently
- Determine primary action
- Execute immediately without presenting options

"Continuing from [state]... [action]"
</quick_resume>

<success_criteria>
Resume is complete when:

- [ ] STATE.md loaded (or reconstructed)
- [ ] Incomplete work detected and flagged
- [ ] Clear status presented to user
- [ ] Contextual next actions offered
- [ ] User knows exactly where project stands
- [ ] Session continuity updated
      </success_criteria>
