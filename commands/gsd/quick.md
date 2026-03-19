---
name: gsd:quick
description: Execute a quick task with GSD guarantees (atomic commits, state tracking) but skip optional agents
argument-hint: "[--full] [--discuss] [--research]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---
<objective>
Execute small, ad-hoc tasks with GSD guarantees (atomic commits, STATE.md tracking).

Quick mode is the same system with a shorter path:
- Spawns gsd-planner (quick mode) + gsd-executor(s)
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md "Quick Tasks Completed" table (NOT ROADMAP.md)

**Default:** Skips research, discussion, plan-checker, verifier. Use when you know exactly what to do.

**`--discuss` flag:** Lightweight discussion phase before planning. Uses ITL clarification checkpoints, surfaces assumptions, clarifies gray areas, and captures decisions in CONTEXT.md. Use when the task has ambiguity worth resolving upfront.

**`--full` flag:** Enables plan-checking (max 2 iterations) and post-execution verification. Use when you want quality guarantees without full milestone ceremony.

**`--research` flag:** Spawns a focused research agent before planning. Investigates implementation approaches, library options, and pitfalls for the task. Use when you're unsure of the best approach.

Flags are composable: `--discuss --research --full` gives discussion + research + plan-checking + verification.
</objective>

<execution_context>
@/home/bamn/get-stuff-done/get-stuff-done/workflows/quick.md
</execution_context>

<context>
$ARGUMENTS

Context files are resolved inside the workflow (`init quick`) and delegated via `<files_to_read>` blocks.
</context>

<process>
**Step 0: Scope Probing (P3)**
Before starting, assess the scope of the task by asking the user:
1. **Complexity check:** "Is this a change to one file, a few files, or does it touch how different parts connect?"
2. **Dependency check:** "Does anything else depend on what you're asking me to change?"
3. **Reversibility check:** "If this doesn't look right, how easy is it to undo?"

**Routing Rule:**
- If all three answers point to small/isolated/reversible → proceed immediately.
- If any answer flags complexity (multiple files, architectural touch, dependents found, or hard to undo) → say "This is bigger than a quick task. Do you want me to make a proper plan, or should I proceed knowing [the specific risk]?"

Execute the quick workflow from @/home/bamn/get-stuff-done/get-stuff-done/workflows/quick.md end-to-end.
Preserve all workflow gates (validation, task description, planning, execution, state updates, commits).
</process>
