# Debug Subagent Prompt Template

Template for spawning gsd-debugger agent. The agent contains all debugging expertise - this template provides problem context only.

---

## Template

```markdown
<objective>
Investigate issue: {issue_id}

**Summary:** {issue_summary}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: {true_or_false}
goal: {find_root_cause_only | find_and_fix}
</mode>

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>
```

---

## Placeholders

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{issue_id}` | Orchestrator-assigned | `auth-screen-dark` |
| `{issue_summary}` | User description | `Auth screen is too dark` |
| `{expected}` | From symptoms | `See logo clearly` |
| `{actual}` | From symptoms | `Screen is dark` |
| `{errors}` | From symptoms | `None in console` |
| `{reproduction}` | From symptoms | `Open /auth page` |
| `{timeline}` | From symptoms | `After recent deploy` |
| `{goal}` | Orchestrator sets | `find_and_fix` |
| `{slug}` | Generated | `auth-screen-dark` |

---

## Usage

**From /gsd:debug:**
```python
Task(
  prompt=filled_template,
  subagent_type="gsd-debugger",
  description="Debug {slug}"
)
```

**From diagnose-issues (UAT):**
```python
Task(prompt=template, subagent_type="gsd-debugger", description="Debug UAT-001")
```

---

## Continuation

For checkpoints, spawn fresh agent with:

```markdown
<objective>
Continue debugging {slug}. Evidence is in the debug file.
</objective>

<prior_state>
Debug file: @.planning/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<checkpoint_contract>
Return checkpoint state in a structured, explicit shape.

- `status`: `continue` | `checkpoint` | `blocked`
- `why_blocked`: exact reason the agent cannot safely continue alone
- `what_is_uncertain`: the unresolved question, verification gap, or missing human action
- `choices`: concrete options when a decision is needed; otherwise empty
- `allow_freeform`: `true` when the human may respond in their own words
- `resume_condition`: what must happen before debugging can continue

Do not hide behind generic "needs input" language. State the blocker, the uncertainty, and the next valid responses.
</checkpoint_contract>

<mode>
goal: {goal}
</mode>
```
