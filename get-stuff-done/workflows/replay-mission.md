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
# Pretty-print using jq to extract fields, then printf for alignment
if command -v jq &>/dev/null && [[ -t 1 ]] && ! echo "$FLAGS" | grep -q -- '--raw'; then
  echo "Mission: $ARGUMENTS"
  echo "Overall: $(echo "$RESULT" | jq -r '.overall_status')"
  echo "Artifacts: $(echo "$RESULT" | jq -r '.artifact_count')"
  echo "Total Atoms: $(echo "$RESULT" | jq -r '.total_atoms_unique')"
  echo ""

  printf "%-35s %-20s %-20s %8s %5s %8s %-6s\n" \
    "ID" "Type" "Created" "Sections" "Atoms" "Citations" "Status"
  echo "-----------------------------------  -----------------  -------------------  --------  -----  ---------  -------"

  echo "$RESULT" | jq -r '.artifacts[] | "\(.id)\t\(.type)\t\(.created_at)\t\(.sections)\t\(.atoms)\t\(.citations)\t\(.integrity)"' | \
    while IFS=$'\t' read -r id type created sections atoms citations integrity; do
      printf "%-35s %-20s %-20s %8s %5s %8s %-6s\n" \
        "$id" "$type" "$created" "$sections" "$atoms" "$citations" "$integrity"
    done
else
  # Output raw JSON (from --raw flag or no jq)
  echo "$RESULT"
fi
</step>

</process>

<success_criteria>
- [ ] Command completed with exit code 0
- [ ] Summary table displayed clearly
- [ ] User can see per-artifact integrity status
</success_criteria>
