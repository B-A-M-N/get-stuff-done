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
if [[ "$ARGUMENTS" =~ --(raw|limit) ]]; then
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
if command -v jq &>/dev/null && [[ -t 1 ]] && ! echo "$FLAGS" | grep -q -- '--raw'; then
  echo "Mission: $MISSION_ID"
  echo "Total artifacts: $(echo "$RESULT" | jq -r '.total')"
  echo ""

  printf "%-20s %7s %6s %8s %-14s %-20s\n" \
    "ID" "Score" "Atoms" "Sections" "Type" "Created"
  echo "--------------------  -------  ------  --------  --------------  -------------------"

  echo "$RESULT" | jq -r '.ranked[] | "\(.id)\t\(.score)\t\(.atoms)\t\(.sections)\t\(.type)\t\(.created_at)"' | \
    while IFS=$'\t' read -r id score atoms sections type created; do
      printf "%-20s %7.3f %6s %8s %-14s %-20s\n" \
        "$id" "$score" "$atoms" "$sections" "$type" "$created"
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
