# Research: Phase 17 — Runtime Gate Enforcement

**Goal:** Ensure that any workflow invocation against a project in `clarification_status: blocked` is rejected at runtime.

## 1. Technical Strategy: Blocked-State Detection

The source of truth for the blocked state is `.planning/STATE.md`. Phase 16 implemented synchronization between the body text and YAML frontmatter.

### Recommended Check Method
The most reliable way to check for a blocked state in a bash script (used by most workflows) is:

```bash
# Extract clarification_status from STATE.md frontmatter
STATUS=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" state json | jq -r '.clarification_status // "none"')

if [ "$STATUS" == "blocked" ]; then
  echo "ERROR: Project is currently BLOCKED due to unresolved clarification."
  echo "Run /gsd:resume-project to address the blocker."
  exit 1
fi
```

## 2. Target Integration Points

### ENFORCE-01 & ENFORCE-05: `plan-phase.md`
- **Entry Gate (ENFORCE-01):** Must be added in **Step 1: Initialize**. If blocked, the workflow must exit before spawning any agents.
- **Research Gate (ENFORCE-05):** In **Step 5: Handle Research**, after the `gsd-phase-researcher` returns, `verify research-contract` must be called. Currently, it's only called in the standalone `research-phase.md`.

### ENFORCE-01 & ENFORCE-02: `execute-phase.md`
- **Entry Gate (ENFORCE-01):** Must be added in **step: initialize**.
- **Checkpoint Gate (ENFORCE-02):** In **step: checkpoint_handling**, sub-step 3.5 already mentions `verify checkpoint-response`, but it needs to be confirmed as a *hard* gate that halts the wave if it fails (not just logs an error).

### ENFORCE-03: `resume-project.md`
- **Status-Aware Routing:** Currently, `resume-project.md` checks for `checkpoint_status`. It must be extended in **step: check_checkpoint_artifact** to also check `clarification_status`. If `blocked`, it should present the blocker details and only offer the unblock flow.

### ENFORCE-04: `autonomous.md`
- **Per-Phase Gate:** In `get-stuff-done/workflows/autonomous.md`, **Step 4: Iterate** already checks for blockers in the `Blockers/Concerns` section. It must be updated to explicitly check `clarification_status` from `STATE.md` at the start of each phase loop.

## 3. Mandatory Gate Commands

The following `gsd-tools.cjs` commands are required for enforcement:

| Requirement | Command |
|-------------|---------|
| ENFORCE-01, 04 | `node gsd-tools.cjs state json` (to check `.clarification_status`) |
| ENFORCE-02 | `node gsd-tools.cjs verify checkpoint-response <file>` |
| ENFORCE-05 | `node gsd-tools.cjs verify research-contract <context> --research <research>` |

## 4. Verification Requirements (Nyquist Wave 0)

To plan this phase well, the following must be true:
- `gsd-tools.cjs` must return exit code 1 when `verify` commands fail.
- All target workflows must use the `init` command which should be updated to include `clarification_status` in its JSON output for easier parsing.

## 5. Implementation Sequence

1. **Phase 17-01:** Update `gsd-tools.cjs` `init` commands to include `clarification_status` in the base initialization payload.
2. **Phase 17-02:** Insert entry gates into `plan-phase.md`, `execute-phase.md`, and `autonomous.md`.
3. **Phase 17-03:** Implement `verify research-contract` gate in `plan-phase.md`.
4. **Phase 17-04:** Update `resume-project.md` to handle `clarification_status: blocked` routing.
5. **Phase 17-05:** Harden `execute-phase.md` checkpoint response gate.
