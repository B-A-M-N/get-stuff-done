---
name: gsd:verify-phase
description: Verify phase goal achievement and generate VERIFICATION.md
argument-hint: "<phase-number>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
---
<objective>
Verify phase goal achievement through goal-backward analysis. 
Check that the codebase delivers what the phase promised, not just that tasks completed.
Produces a VERIFICATION.md report.
</objective>

<execution_context>
@/home/bamn/get-stuff-done/get-stuff-done/workflows/lib/verify-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS (required)
</context>

<process>
Execute the verification workflow from @/home/bamn/get-stuff-done/get-stuff-done/workflows/lib/verify-phase.md end-to-end.
Preserve all workflow gates (context loading, must-have extraction, artifact/wiring verification, anti-pattern scanning, report generation).
</process>
