<purpose>
Verify a single synthesis artifact's integrity.
</purpose>

<required_reading>
None
</required_reading>

<process>

<step name="verify">
```bash
RESULT=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" verify-synthesis "$ARGUMENTS" --raw 2>&1)
EXIT_CODE=$?
```
</step>

<step name="handle_errors">
if [[ $EXIT_CODE -eq 2 ]]; then
  echo "❌ Artifact not found: $ARGUMENTS"
  exit 2
elif [[ $EXIT_CODE -eq 1 ]]; then
  echo "❌ Drift or integrity failure detected"
else
  echo "✅ Verified"
fi
```
</step>

<step name="display_details">
# Show detailed results even on failure
if command -v jq &>/dev/null && [[ -t 1 ]]; then
  echo ""
  echo "Details:"
  echo "$RESULT" | jq -r '
    "ID: \(.id)",
    "Type: \(.artifact_type // "unknown")",
    "Created: \(.created_at // "unknown")",
    "Checks:",
    "  Required fields: \(if .checks.has_required_fields then "✅" else "❌" end)",
    "  Content match: \(if .checks.content_match then "✅" else "❌" end)",
    "  Citations complete: \(if .checks.citations_complete then "✅" else "❌" end)",
    "  Missing citations: \(.checks.missing_citations | length) \(if .checks.missing_citations|length > 0 then " (\(.checks.missing_citations|join(", ")))" else "" end)",
    "Overall: \(.overall)"
  '
else
  echo "$RESULT"
fi
```
</step>

</process>

<success_criteria>
- [ ] Command executed
- [ ] Clear verdict (✅ verified or ❌ drift/missing)
- [ ] Detailed check breakdown shown
</success_criteria>
