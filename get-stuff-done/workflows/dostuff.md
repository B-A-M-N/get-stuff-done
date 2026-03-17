<purpose>
Accept a freeform narrative and route it to the correct first-step GSD workflow.
This dispatcher first interprets the narrative through the ITL, then chooses between `/dostuff:new-project` and `/dostuff:quick`.
</purpose>

<process>

<step name="validate">
If `$ARGUMENTS` is empty, ask the user to briefly describe what they want to build or change.
</step>

<step name="interpret">
Run the narrative through the ITL command surface:

`node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" itl interpret --text "$ARGUMENTS"`

Capture:
- normalized interpretation
- ambiguity result
- summary markdown
- audit record path
</step>

<step name="display">
Show the interpretation summary before routing.

Display:
- suggested route
- ambiguity severity
- goals / constraints / success criteria / unknowns
- audit record location
</step>

<step name="ambiguity_gate">
If ambiguity severity is `high`, do not silently route.

Ask the user to clarify or confirm direction first.

If ambiguity severity is `low` or `medium`, continue to routing.
</step>

<step name="route">
Choose the route using these rules in order, using the ITL output as the primary signal:

1. If `.planning/PROJECT.md` does not exist, route to `/dostuff:new-project`.
2. If the interpretation route hint is `new-project`, route to `/dostuff:new-project`.
3. Otherwise route to `/dostuff:quick`.

If ambiguity remains unresolved, prefer asking for clarification over auto-routing.
</step>

<step name="display_route">
Show the routing decision with:
- the first line of the narrative
- the chosen command
- a one-line reason based on the ITL interpretation
</step>

<step name="dispatch">
Invoke the selected command and pass the original narrative through unchanged.
</step>

</process>

<success_criteria>
- Input is present before routing
- Narrative is interpreted into structured intent
- Interpretation summary is shown before dispatch
- Audit trail is recorded
- Exactly one of `/dostuff:new-project` or `/dostuff:quick` is chosen
- Existing project state and ITL route hint are considered before routing
- The original narrative is preserved for the dispatched command
</success_criteria>
