---
name: gsd:diagnose
description: Systematic diagnosis of UAT gaps using parallel debugging agents
argument-hint: [gap description]
allowed-tools:
  - Read
  - Bash
  - Task
  - AskUserQuestion
---

<objective>
Diagnose UAT gaps and verification failures using parallel debugging agents.

**Orchestrator role:** Gather gap details, follow the diagnose-issues workflow, and manage subagent returns.
</objective>

<execution_context>
@get-stuff-done/workflows/lib/diagnose-issues.md
</execution_context>

<process>
Follow the diagnose-issues workflow from get-stuff-done/workflows/lib/diagnose-issues.md end-to-end.
</process>

<success_criteria>
- [ ] Gap symptoms gathered
- [ ] Parallel diagnosis agents spawned
- [ ] Root causes for gaps identified
- [ ] Resolution paths proposed
</success_criteria>
