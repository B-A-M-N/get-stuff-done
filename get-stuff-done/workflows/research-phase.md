<purpose>
Research how to implement a phase. Spawns gsd-phase-researcher with phase context.

Standalone research command. For most workflows, use `/gsd:plan-phase` which integrates research automatically.
</purpose>

<process>

## Step 0: Resolve Model Profile

@$HOME/.claude/get-stuff-done/references/model-profile-resolution.md

Resolve model for:
- `gsd-phase-researcher`

## Step 1: Normalize and Validate Phase

@$HOME/.claude/get-stuff-done/references/phase-argument-parsing.md

```bash
PHASE_INFO=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" roadmap get-phase "${PHASE}")
```

If `found` is false: Error and exit.

## Step 2: Check Existing Research

```bash
ls .planning/phases/${PHASE}-*/RESEARCH.md 2>/dev/null
```

If exists: Offer update/view/skip options.

## Step 3: Gather Phase Context

```bash
INIT=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
# Extract: phase_dir, padded_phase, phase_number, state_path, requirements_path, context_path
```

### Clarification Gate

```bash
BLOCKED=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" state get clarification_status --raw)
if [[ "$BLOCKED" == "blocked" ]]; then
  echo "ERROR: Project is currently BLOCKED. Use /gsd:discuss-phase to resolve ambiguities before researching."
  exit 1
fi
```

If `context_path` exists, use it in two layers:
- `Implementation Decisions` are locked user choices.
- `Narrative Intake Summary` and `Research Cues` are research guidance that should shape investigation without overriding explicit decisions.
- `Invariant Safety` cues mean inferred assumptions stay guidance-only until they pass the adversarial ambiguity gate.
- `Unresolved Ambiguities` are explicit no-assumption zones; research may investigate them, but must not quietly settle them as facts.

## Step 4: Spawn Researcher

```
Task(
  prompt="<objective>
Research implementation approach for Phase {phase}: {name}
</objective>

<files_to_read>
- {context_path} (USER DECISIONS plus narrative summary / research cues from /gsd:discuss-phase)
- {requirements_path} (Project requirements)
- {state_path} (Project decisions and history)
</files_to_read>

<additional_context>
Phase description: {description}

Treat CONTEXT.md carefully:
- `Implementation Decisions` are explicit user choices
- `Research Cues` are inferred guidance, not locked requirements
- `Narrative Intake Summary` preserves user framing and emphasis
- `Invariant Safety` means unresolved or non-lockable inferences must remain open questions during research, not be rewritten as settled facts
- `Unresolved Ambiguities` must remain labeled as unresolved in RESEARCH.md unless the user explicitly confirms them elsewhere
</additional_context>

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</output>",
  subagent_type="gsd-phase-researcher",
  model="{researcher_model}"
)
```

## Step 5: Handle Return

- `## RESEARCH COMPLETE` — run the research-contract validator before presenting the result:

```bash
node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" verify research-contract "$context_path" --research "$research_path"
```

If `workflow.adversarial_test_harness` is enabled and the result is invalid:
- show the issues clearly
- revise the research before treating it as ready for planning
- do not let unresolved ambiguity disappear through quiet research conclusions

If `workflow.adversarial_test_harness` is disabled:

```bash
node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" state add-decision --phase "$PHASE" --summary "Adversarial harness bypassed" --rationale "scope=research-phase-contract"
```

Skip this contract gate and report that the adversarial harness was bypassed for this run.

If the result is valid: display summary, offer: Plan/Dig deeper/Review/Done
- `## CHECKPOINT REACHED` — Present to user, spawn continuation
- `## RESEARCH INCONCLUSIVE` — Show attempts, offer: Add context/Try different mode/Manual

</process>
