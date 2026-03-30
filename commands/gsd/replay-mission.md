---
name: gsd:replay-mission
description: Reconstruct mission synthesis state and integrity
argument-hint: "<mission_id>"
allowed-tools:
  - Read
  - Bash
  - Task
---

<objective>
Reconstruct the complete synthesis state for a mission, showing artifact timeline and overall integrity status (intact/degraded).
</objective>

<execution_context>
@/home/bamn/get-stuff-done/get-stuff-done/workflows/replay-mission.md
</execution_context>

<context>
Arguments:
- mission_id: The mission identifier (e.g., "52-truth-enforcement-hardening")

The command replays all synthesis artifacts for the mission and reports:
- Overall status (intact if all artifacts match their sections, else degraded)
- Artifact count, total sections, unique atoms
- Per-artifact details: ID, type, created_at, sections, atoms, citations, integrity
</context>

<process>
Execute the replay-mission workflow end-to-end.
</process>

<success_criteria>
- [ ] Mission ID is valid and artifacts are found
- [ ] Integrity status is clearly displayed
- [ ] Artifact timeline is shown in a readable table
- [ ] JSON output available via --raw (used by scripts)
</success_criteria>
