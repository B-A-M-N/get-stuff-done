<purpose>
Reconstruct and display mission synthesis state.
</purpose>

<required_reading>
None
</required_reading>

<process>

<step name="replay">
```bash
# Call gsd-tools with --raw for machine-readable output
RESULT=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" replay-mission "$ARGUMENTS" --raw 2>&1)
EXIT_CODE=$?
```
</step>

<step name="handle_errors">
if [[ $EXIT_CODE -ne 0 ]]; then
  echo "❌ Replay failed (exit $EXIT_CODE)"
  echo "$RESULT"
  exit $EXIT_CODE
fi

# Parse JSON (if @file prefix, read the file)
if [[ "$RESULT" == @file:* ]]; then
  RESULT=$(cat "${RESULT#@file:}")
fi
</step>

<step name="display_summary">
# Pretty-print using jq if available, otherwise show raw
if command -v jq &>/dev/null && [[ -t 1 ]]; then
  # Extract summary fields for quick view
  echo "Mission: $ARGUMENTS"
  echo "Overall: $(echo "$RESULT" | jq -r '.overall_status')"
  echo "Artifacts: $(echo "$RESULT" | jq -r '.artifact_count')"
  echo "Total Atoms: $(echo "$RESULT" | jq -r '.total_atoms_unique')"
  echo ""
  echo "Artifacts:"
  echo "ID                                   Type               Created              Sections  Atoms  Citations  Status"
  echo "-----------------------------------  -----------------  -------------------  --------  -----  ---------  -------"
  echo "$RESULT" | jq -r '.artifacts[] | "\(.id)  \(.type)  \(.created_at)  \(.sections|tostring|ljust(8))  \(.atoms|tostring|ljust(5))  \(.citations|tostring|ljust(8))  \(.integrity)"' | column -t -s $'\t'
else
  # Fall back to raw JSON
  echo "$RESULT"
fi
</step>

</process>

<success_criteria>
- [ ] Command completed with exit code 0
- [ ] Summary table displayed clearly
- [ ] User can see per-artifact integrity status
</success_criteria>
