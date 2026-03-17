# PLAN: 1-3 - Add dostuff command entry point

## Goal
Add a new `dostuff` command as a primary entry point for narrative-first interaction, routing users to existing GSD commands for now.

## Tasks
<task type="auto">
  <name>Create dostuff command file</name>
  <files>commands/gsd/dostuff.md, get-stuff-done/workflows/dostuff.md</files>
  <action>
    Create a new command markdown file for `dostuff`.
    Implement the initial workflow that accepts a freeform string and routes it to either `/gsd:new-project` or `/gsd:quick` depending on context.
  </action>
  <verify>New `dostuff` command is recognized by the system.</verify>
</task>

<task type="auto">
  <name>Implement Command Routing</name>
  <files>get-stuff-done/workflows/dostuff.md, get-stuff-done/bin/gsd-tools.cjs</files>
  <action>
    Add logic to route the `dostuff` input to the appropriate existing GSD command.
    Initially, this can be a simple prompt to the user or basic keyword detection.
  </action>
  <verify>`dostuff [narrative]` correctly triggers a GSD workflow.</verify>
</task>

<task type="auto">
  <name>Verify Command Integration</name>
  <files>tests/commands.test.cjs</files>
  <action>
    Add tests to ensure the new command functions as an entry point and routes correctly.
  </action>
  <verify>Tests for `dostuff` command pass.</verify>
</task>

## Verification
- `/gsd:dostuff "I want to build a marketplace"` triggers the appropriate workflow.
- Tests confirm routing and error handling.

---
*Status: Ready*
