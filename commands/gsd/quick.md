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

**`--discuss` flag:** Lightweight discussion phase before planning. Uses ITL clarification checkpoints, locks in decisions, and captures them in CONTEXT.md. Use when the task has ambiguity worth resolving upfront.

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
## 0. Scope Probing Protocol (Dimension 4)
Before accepting the task and initiating execution, if the task is non-trivial, probe the scope:
1. **Complexity:** Does this require touching more than 2 files or introducing new logic patterns?
2. **Dependency:** Does this rely on unwritten features, or block another planned task?
3. **Reversibility:** If we merge this and it's wrong, is it a 10-minute revert or a 2-hour untangle?

If any answers are "Yes" or "2-hour untangle", politely refuse `quick` and direct the user to `/gsd:plan-phase`.

Execute the quick workflow from @/home/bamn/get-stuff-done/get-stuff-done/workflows/quick.md end-to-end.
Preserve all workflow gates (validation, task description, planning, execution, state updates, commits).
</process>
