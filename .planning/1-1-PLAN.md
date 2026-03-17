# PLAN: 1-1 - Global Rebrand to get-stuff-done

## Goal
Replace all instances of `get-stuff-done` with `get-stuff-done` across the entire codebase, including documentation, configuration, and source code, and verify that the test suite passes.

## Tasks
<task type="auto">
  <name>Global Search and Replace</name>
  <files>All repository files</files>
  <action>
    Use a recursive search-and-replace to change "get-stuff-done" to "get-stuff-done".
    Ensure case-sensitivity is handled (e.g., "GET-STUFF-DONE" -> "GET-STUFF-DONE").
    Update package.json name and dependencies if applicable.
  </action>
  <verify>grep -r "get-stuff-done" . should return no results (excluding .git).</verify>
</task>

<task type="auto">
  <name>Verify Test Suite</name>
  <files>tests/*.test.cjs</files>
  <action>
    Run the full test suite to ensure the renaming didn't break any internal paths or logic.
    Command: `npm test`
  </action>
  <verify>All tests pass.</verify>
</task>

## Verification
- `grep -r "get-stuff-done" .` returns zero results.
- `npm test` passes 100%.

---
*Status: Ready*
