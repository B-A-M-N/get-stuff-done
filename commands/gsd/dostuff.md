---
name: gsd:dostuff
description: Narrative-first entry point with interpretation summary, ambiguity checks, and audit trail
argument-hint: "<what you want to build or change>"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---
<objective>
Accept a freeform narrative and route it to the best GSD starting point.

This is a narrative-first entry point for people who want to describe what they want
without choosing a workflow first.

Behavior:
- Interprets multi-paragraph narrative input into structured intent
- Produces an interpretation summary before routing
- Uses explicit clarification checkpoints before routing risky input
- Records an audit trail under `.planning/itl/`
- Routes to `/dostuff:new-project` or `/dostuff:quick` after interpretation
</objective>

<execution_context>
@~/.claude/get-stuff-done/workflows/dostuff.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the dostuff workflow from @~/.claude/get-stuff-done/workflows/dostuff.md end-to-end.
Interpret the narrative, handle ambiguity safely, then route to `/dostuff:new-project` or `/dostuff:quick`.
</process>
