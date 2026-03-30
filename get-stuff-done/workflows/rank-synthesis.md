<purpose>
Display ranked synthesis artifacts for a mission.
</purpose>

<required_reading>
None
</required_reading>

<process>

<step name="rank">
```bash
# Pass through flags after mission ID
FLAGS=""
if [[ "$ARGUMENTS" =~ --(json|limit) ]]; then
  FLAGS=" $ARGUMENTS"
  MISSION_ID="${ARGUMENTS%% *}"
else
  MISSION_ID="$ARGUMENTS"
fi

RESULT=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" rank-synthesis "$MISSION_ID" $FLAGS --raw 2>&1)
EXIT_CODE=$?
```
</step>

<step name="handle_errors">
if [[ $EXIT_CODE -ne 0 ]]; then
  echo "❌ Ranking failed (exit $EXIT_CODE)"
  echo "$RESULT"
  exit $EXIT_CODE
fi

if [[ "$RESULT" == @file:* ]]; then
  RESULT=$(cat "${RESULT#@file:}")
fi
```
</step>

<step name="display_table">
if command -v jq &>/dev/null && [[ -t 1 ]] && ! echo "$FLAGS" | grep -q -- '--json'; then
  # Format as table
  echo "Mission: $MISSION_ID"
  echo "Total artifacts: $(echo "$RESULT" | jq -r '.total')"
  echo ""

  printf "%-20s %-12s %-8s %-8s %-10s %-12s\n" "ID" "Type" "Score" "Atoms" "Sections" "Created"
  echo "--------------------  ------------  --------  --------  ----------  -------------------"

  echo "$RESULT" | jq -r '.ranked[] | "\(.id)  \(.type|ljust(12))  \(.score|sprintf("%.3f"))  \(.atoms|tostring|ljust(7))  \(.sections|tostring|ljust(9))  \(.created_at)"' | while IFS= read -r line; do
    printf "%-20s %-12s %-8s %-8s %-10s %-12s\n" "${line%%$'\t'*}" ...
  done
else
  # Output raw JSON
  echo "$RESULT"
fi
```
</step>

</process>

<success_criteria>
- [ ] Ranking computed successfully
- [ ] Table displayed with ID, Type, Score, Atoms, Sections, Created
- [ ] Sorted by score descending
</success_criteria>
