---
name: gsd:new-project
description: Initialize a new project with narrative-first intake, PROJECT.md, and roadmap scaffolding
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
---
<context>
**Flags:**
- `--auto` — Automatic mode. After config questions, interprets the provided document as the project narrative, then runs research → requirements → roadmap without further interaction.
</context>

<objective>
Initialize a new project through unified flow: narrative intake → research (optional) → requirements → roadmap.

**Creates:**
- `.planning/PROJECT.md` — project context
- `.planning/config.json` — workflow preferences
- `.planning/research/` — domain research (optional)
- `.planning/REQUIREMENTS.md` — scoped requirements
- `.planning/ROADMAP.md` — phase structure
- `.planning/STATE.md` — project memory

Behavior:
- Starts with freeform narrative intake instead of a rigid front-loaded questionnaire
- Uses ITL interpretation before writing artifacts
- Shows an interpretation summary and only asks bounded clarification when ambiguity is too high

**After this command:** Run `/dostuff:plan-phase 1` to start execution on the installed fork surface.
</objective>

<execution_context>
@~/.claude/get-stuff-done/workflows/new-project.md
@~/.claude/get-stuff-done/references/questioning.md
@~/.claude/get-stuff-done/references/ui-brand.md
@~/.claude/get-stuff-done/templates/project.md
@~/.claude/get-stuff-done/templates/requirements.md
</execution_context>

<process>
Execute the new-project workflow from @~/.claude/get-stuff-done/workflows/new-project.md end-to-end.
Preserve all workflow gates (validation, approvals, commits, routing).
</process>
