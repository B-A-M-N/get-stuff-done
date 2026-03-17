# Phase 16: Checkpoint Artifact Lifecycle - Research

**Researched:** 2026-03-17
**Domain:** Workflow state persistence, CLI subcommand extension, multi-agent lifecycle management
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Write point — who writes CHECKPOINT.md**
- The **gsd-executor agent** writes CHECKPOINT.md before returning its checkpoint state to the orchestrator
- Written directly using the Write tool (no new gsd-tools CLI subcommand for the write itself)
- Location: phase directory — `.planning/phases/XX-name/CHECKPOINT.md` (one file per phase, overwritten on new checkpoint)
- Initial `status` field value when first written: `pending`
- The **orchestrator (execute-phase)** updates CHECKPOINT.md status to `awaiting-response` after presenting the checkpoint to the user
- The **orchestrator** marks CHECKPOINT.md status `resolved` and sets `resolved_at` after the continuation agent completes successfully

**STATE.md lifecycle field — CHECKPOINT-03**
- New dedicated frontmatter field: `checkpoint_status: pending | awaiting-response | resolved`
- New dedicated frontmatter field: `checkpoint_path:` — full relative path to the active CHECKPOINT.md
- When no checkpoint is active: both fields are absent/null from STATE.md frontmatter (not present)
- New gsd-tools subcommand: `state checkpoint --status <value> --path <file>` to update both fields atomically, consistent with other state.cjs update patterns
- Fields are cleared (set to null/removed) when a checkpoint resolves and CHECKPOINT.md is marked resolved

**Resume error behavior — CHECKPOINT-02**
- When `checkpoint_status` is `pending` or `awaiting-response` in STATE.md but CHECKPOINT.md is **missing or invalid**: fall back to last completed state (last completed task/plan in STATE.md) and prompt user to re-run the relevant command (`/gsd:execute-phase {phase}`) to get back to where they were — no hard error, recovery via re-execution
- When `checkpoint_status` is `awaiting-response` and CHECKPOINT.md is **valid**: show a brief summary of the checkpoint fields (type, why_blocked, choices) and instruct user to re-run `/gsd:execute-phase {phase}` to continue — resume-project does not inline the response
- When CHECKPOINT.md has `status: resolved`: ignore it and route normally as if no checkpoint exists

**Artifact cleanup**
- On resolve: **keep** CHECKPOINT.md as a resolved artifact in the phase directory (status: resolved, resolved_at set) — provides audit trail, does not interfere with future checkpoints since resume checks status field
- On new checkpoint firing in the same phase: **overwrite** CHECKPOINT.md — one active checkpoint per phase at a time; prior checkpoints are in git history
- **Commit at each lifecycle transition**: when written (pending), when updated to awaiting-response, and when resolved — consistent with how SUMMARY.md and STATE.md are committed

### Claude's Discretion
- Exact YAML frontmatter structure of CHECKPOINT.md body (markdown prose below frontmatter)
- Whether `state checkpoint` subcommand also writes to the `## Decisions` section of STATE.md body
- Internal implementation of frontmatter parsing/writing in state.cjs

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHECKPOINT-01 | Canonical CHECKPOINT.md written to phase directory on every blocking checkpoint | executor agent writes CHECKPOINT.md using Write tool before `checkpoint_return_for_orchestrator`; YAML frontmatter matches `checkpointArtifactSchema` |
| CHECKPOINT-02 | CHECKPOINT.md re-read and validated by resume-project before routing continuation | resume-project reads `checkpoint_path` from STATE.md frontmatter, calls `parseCheckpointArtifact`, routes on status field; graceful fallback on missing/invalid |
| CHECKPOINT-03 | Checkpoint lifecycle tracked in STATE.md (pending / awaiting-response / resolved) | new `state checkpoint` subcommand writes both `checkpoint_status` and `checkpoint_path` atomically to STATE.md frontmatter via `buildStateFrontmatter` sync path |
</phase_requirements>

## Summary

Phase 16 is purely an internal plumbing phase: it wires together assets that already exist (the `checkpointArtifactSchema` from Phase 15) with workflow files that already handle checkpoints (execute-plan, execute-phase, resume-project) by adding three targeted write/read/validate steps at defined points in those workflows, plus one new CLI subcommand to STATE.md for tracking lifecycle state.

Every integration point is already identified in the CONTEXT.md canonical references. No new technology is required. The entire phase is text/markdown edits to three workflow files, one CLI subcommand addition in state.cjs and gsd-tools.cjs, and one modification to `buildStateFrontmatter` to include the new frontmatter fields. The schema (checkpointArtifactSchema), the parse helper (parseCheckpointArtifact), the frontmatter infrastructure (extractFrontmatter/spliceFrontmatter), and the file-reading primitive (safeReadFile) are all already in the codebase and production-tested.

The biggest implementation risk is correct atomicity of the `state checkpoint` subcommand — both `checkpoint_status` and `checkpoint_path` must be written in a single `writeStateMd` call so the frontmatter sync does not leave the file in a half-updated state. The second risk is the resume-project routing logic correctly distinguishing the three status cases (missing/invalid, awaiting-response+valid, resolved) without silent fallthrough.

**Primary recommendation:** Build in four plans — (1) executor write, (2) orchestrator status transitions + resolved cleanup, (3) resume-project validation + routing, (4) state checkpoint CLI subcommand — so each plan can be tested and committed independently.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | ^4.3.6 (already installed) | Schema validation for CHECKPOINT.md frontmatter | Phase 15 shipped `checkpointArtifactSchema` — use directly |
| Node.js `fs` | built-in | File read/write for CHECKPOINT.md | All artifact writes in the codebase use fs directly |
| `js-yaml` / `gray-matter` | NOT used | YAML parsing | Project uses its own `extractFrontmatter` / `reconstructFrontmatter` in frontmatter.cjs — do NOT introduce new deps |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `safeReadFile` (core.cjs) | internal | Null-safe file reads | Use for reading CHECKPOINT.md in resume-project — returns null on missing instead of throwing |
| `extractFrontmatter` (frontmatter.cjs) | internal | YAML frontmatter parse to object | Use to parse CHECKPOINT.md frontmatter before Zod validation |
| `stateReplaceField` (state.cjs) | internal | Single-field update on STATE.md content string | Use in `cmdStateCheckpoint` for body-text fields |
| `writeStateMd` (state.cjs) | internal | Write STATE.md with synchronized frontmatter | ALL writes to STATE.md must go through this function — never raw writeFileSync |
| `buildStateFrontmatter` (state.cjs) | internal | Derive frontmatter object from STATE.md body | Needs to be extended to include `checkpoint_status` and `checkpoint_path` |

**Installation:** None required. All dependencies already present.

## Architecture Patterns

### CHECKPOINT.md File Structure

The file uses the same YAML frontmatter + markdown body pattern as STATE.md and SUMMARY.md, consistent with the established project convention.

```
---
status: pending
type: human-verify
why_blocked: "..."
what_is_uncertain: "..."
choices: "[option-a, option-b]"
allow_freeform: true
resume_condition: "..."
resolved_at: ~
---

## Checkpoint Summary

[Human-readable markdown prose about the checkpoint — at Claude's discretion]
```

The frontmatter fields are exactly what `checkpointArtifactSchema` validates:
- `status`: `pending | awaiting-response | resolved`
- `type`: string (e.g., "human-verify", "decision", "human-action")
- `why_blocked`: string min 1 char
- `what_is_uncertain`: string min 1 char
- `choices`: string min 1 char
- `allow_freeform`: boolean or "true"/"false"
- `resume_condition`: string min 1 char
- `resolved_at`: optional string (ISO timestamp when resolved)

### Pattern 1: Executor Write (CHECKPOINT-01)

The executor writes CHECKPOINT.md using the Write tool immediately before the `checkpoint_return_for_orchestrator` step in execute-plan.md.

**What:** Add a write step to execute-plan.md §checkpoint_return_for_orchestrator
**When to use:** Any time the executor hits a blocking checkpoint task
**Integration point:** `.planning/phases/XX-name/CHECKPOINT.md`

```markdown
<!-- Added to execute-plan.md §checkpoint_return_for_orchestrator, BEFORE the structured return -->

Write CHECKPOINT.md to the phase directory using the Write tool:
- Path: `{phase_dir}/CHECKPOINT.md`
- Status: `pending`
- Populate all required fields from the checkpoint payload

Then commit:
```bash
node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" commit \
  "chore({phase}-checkpoint): write checkpoint artifact" \
  --files {phase_dir}/CHECKPOINT.md
```
```

### Pattern 2: Orchestrator Status Transitions (CHECKPOINT-03)

The orchestrator transitions CHECKPOINT.md status in execute-phase.md §checkpoint_handling.

**Transition 1 — awaiting-response** (after presenting checkpoint to user):
```bash
# Update STATE.md with checkpoint lifecycle fields
node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" state checkpoint \
  --status awaiting-response \
  --path "{phase_dir}/CHECKPOINT.md"

# Update CHECKPOINT.md status field using frontmatter set
node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" frontmatter set \
  "{phase_dir}/CHECKPOINT.md" --field status --value '"awaiting-response"'

node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" commit \
  "chore({phase}-checkpoint): update checkpoint to awaiting-response" \
  --files "{phase_dir}/CHECKPOINT.md" .planning/STATE.md
```

**Transition 2 — resolved** (after continuation agent completes):
```bash
# Set resolved_at timestamp and status
RESOLVED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" frontmatter set \
  "{phase_dir}/CHECKPOINT.md" --field status --value '"resolved"'
node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" frontmatter set \
  "{phase_dir}/CHECKPOINT.md" --field resolved_at --value "\"$RESOLVED_AT\""

# Clear checkpoint fields from STATE.md
node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" state checkpoint \
  --status resolved --path ""

node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" commit \
  "chore({phase}-checkpoint): resolve checkpoint" \
  --files "{phase_dir}/CHECKPOINT.md" .planning/STATE.md
```

### Pattern 3: Resume Routing (CHECKPOINT-02)

Added to resume-project.md after `load_state` step, before `determine_next_action`.

```
// Source: resume-project.md §load_state extension

1. Read checkpoint_status from STATE.md frontmatter
2. If checkpoint_status is null/absent → skip checkpoint routing, proceed normally
3. If checkpoint_status is "resolved" → skip (treat as no active checkpoint)
4. If checkpoint_status is "pending" or "awaiting-response":
   a. Read checkpoint_path from STATE.md frontmatter
   b. Read file at checkpoint_path using safeReadFile
   c. If file is null (missing):
      → present fallback: "Checkpoint file missing. Re-run /gsd:execute-phase {phase}"
      → include last completed plan info from STATE.md
      → STOP routing here
   d. Parse frontmatter with extractFrontmatter(content)
   e. Validate with checkpointArtifactSchema.safeParse(frontmatter)
   f. If validation fails:
      → present fallback: "Checkpoint file invalid. Re-run /gsd:execute-phase {phase}"
      → include validation errors + last completed plan info
      → STOP routing here
   g. If valid and status is "awaiting-response":
      → present checkpoint summary (type, why_blocked, choices)
      → instruct: "Re-run /gsd:execute-phase {phase} to continue"
      → STOP routing here
   h. If valid and status is "pending":
      → same as awaiting-response (executor may have been interrupted before orchestrator updated status)
      → instruct: "Re-run /gsd:execute-phase {phase} to continue"
      → STOP routing here
```

### Pattern 4: `state checkpoint` Subcommand

**In state.cjs:**
```javascript
// Source: existing stateReplaceField pattern in state.cjs

function cmdStateCheckpoint(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const { status, checkpointPath } = options;

  // Both fields updated atomically before single writeStateMd call
  // Use stateReplaceField for body text (checkpoint_status / checkpoint_path body lines if present)
  // buildStateFrontmatter picks up the values from the body on next sync

  // Insert/update checkpoint_status and checkpoint_path in SESSION CONTINUITY section
  // or as standalone fields in the ## Current Position section
  // Then call writeStateMd once to sync frontmatter

  writeStateMd(statePath, content, cwd);
  output({ updated: true, checkpoint_status: status, checkpoint_path: checkpointPath || null }, raw, 'true');
}
```

**In buildStateFrontmatter (state.cjs):**

`buildStateFrontmatter` needs to extract `checkpoint_status` and `checkpoint_path` from the STATE.md body and include them in the frontmatter object so they appear in the YAML header and are machine-readable via `state json`.

```javascript
// Added to buildStateFrontmatter() in state.cjs
const checkpointStatus = stateExtractField(bodyContent, 'Checkpoint Status');
const checkpointPath = stateExtractField(bodyContent, 'Checkpoint Path');

// Later in the fm object construction:
if (checkpointStatus) fm.checkpoint_status = checkpointStatus;
if (checkpointPath) fm.checkpoint_path = checkpointPath;
```

**In gsd-tools.cjs (CLI router):**
```javascript
// Source: existing record-session pattern in gsd-tools.cjs

} else if (subcommand === 'checkpoint') {
  const statusIdx = args.indexOf('--status');
  const pathIdx = args.indexOf('--path');
  state.cmdStateCheckpoint(cwd, {
    status: statusIdx !== -1 ? args[statusIdx + 1] : null,
    checkpointPath: pathIdx !== -1 ? args[pathIdx + 1] : null,
  }, raw);
}
```

### Recommended Plan Structure

Four plans, each independently testable:

| Plan | Scope | Key files |
|------|-------|-----------|
| 16-01 | Executor write — CHECKPOINT.md on block | execute-plan.md, CHECKPOINT.md format doc |
| 16-02 | Orchestrator transitions — awaiting-response + resolved | execute-phase.md |
| 16-03 | Resume routing — read + validate + route | resume-project.md |
| 16-04 | `state checkpoint` CLI subcommand | state.cjs, gsd-tools.cjs |

Plans 16-01 and 16-04 can be in the same wave (no dependency between them). Plans 16-02 and 16-03 depend on 16-01 and 16-04 respectively.

### Anti-Patterns to Avoid

- **Writing STATE.md directly with fs.writeFileSync:** Always use `writeStateMd(statePath, content, cwd)` — it syncs the YAML frontmatter header atomically.
- **Two separate `stateReplaceField` calls with separate `writeStateMd` calls:** `checkpoint_status` and `checkpoint_path` must be written in a single `writeStateMd` invocation to maintain atomicity.
- **Parsing CHECKPOINT.md frontmatter with raw string regex:** Use `extractFrontmatter` from frontmatter.cjs, then pass result to `checkpointArtifactSchema.safeParse`.
- **Resuming from CHECKPOINT.md directly in resume-project:** Resume does NOT inline the continuation response — it surfaces summary info and tells user to re-run `/gsd:execute-phase`.
- **Adding a hard `process.exit(1)` on invalid CHECKPOINT.md in resume:** The decision is graceful fallback with recovery path, not hard error.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML parse of CHECKPOINT.md frontmatter | Custom regex parser | `extractFrontmatter` (frontmatter.cjs) | Already handles nested objects, arrays, inline arrays, quoting edge cases |
| CHECKPOINT.md schema validation | Manual field-by-field checks | `checkpointArtifactSchema.safeParse` (artifact-schema.cjs) | Phase 15 shipped this exactly for this purpose; result.error.issues gives structured errors |
| Writing STATE.md frontmatter | Direct YAML construction | `writeStateMd` + `buildStateFrontmatter` pattern | Handles frontmatter sync, normalizeMd, field extraction from body |
| Null-safe file reading | try/catch fs.readFileSync | `safeReadFile` (core.cjs) | Returns null on missing; avoids scattered try/catch in workflow code |
| Frontmatter field update | String replacement | `frontmatter set` CLI subcommand | Handles YAML quoting, preserves other fields, tested |

**Key insight:** Every primitive needed for this phase already exists and is tested. The work is wiring, not building.

## Common Pitfalls

### Pitfall 1: `buildStateFrontmatter` not extended — checkpoint fields lost after write
**What goes wrong:** `state checkpoint` subcommand writes body fields but `buildStateFrontmatter` does not extract them, so the frontmatter sync step overwrites them to null on every `writeStateMd` call.
**Why it happens:** `buildStateFrontmatter` derives frontmatter from body text fields — any field not extracted there will not appear in the YAML header.
**How to avoid:** When implementing `cmdStateCheckpoint`, also add `stateExtractField(bodyContent, 'Checkpoint Status')` and `stateExtractField(bodyContent, 'Checkpoint Path')` extraction to `buildStateFrontmatter`.
**Warning signs:** `state json` output shows no `checkpoint_status` field after `state checkpoint --status pending` is called.

### Pitfall 2: Resume reads stale `checkpoint_status` from STATE.md body, not frontmatter
**What goes wrong:** Resume reads `checkpoint_status` from the markdown body section using `stateExtractField` but the frontmatter is updated by a separate process — reading the body directly creates a race condition or divergence.
**Why it happens:** STATE.md has both a YAML frontmatter header and a markdown body. Some consumers read the frontmatter (via `extractFrontmatter`), others read the body (via `stateExtractField`).
**How to avoid:** In resume-project, read the STATE.md frontmatter via `state json` (or `extractFrontmatter`) to get `checkpoint_status` and `checkpoint_path` — these are machine-readable canonical values.
**Warning signs:** Resume reports no active checkpoint even though CHECKPOINT.md exists with `status: awaiting-response`.

### Pitfall 3: Overwriting CHECKPOINT.md without re-checking status first
**What goes wrong:** The executor overwrites CHECKPOINT.md even when the previous checkpoint has `status: awaiting-response` (user has not yet responded), losing the original blocking context.
**Why it happens:** Execute-plan does not check whether an existing CHECKPOINT.md is already in flight before writing.
**How to avoid:** Document that overwrite is intentional and always correct — the user decision was: "one active checkpoint per phase at a time; prior checkpoints are in git history". The executor always overwrites.
**Warning signs:** Not a bug — overwrite is the specified behavior. Do not add a guard check.

### Pitfall 4: `frontmatter set` quoting breaks YAML parse
**What goes wrong:** Calling `frontmatter set ... --value "resolved"` writes `status: resolved` correctly, but `--value "2026-03-17T13:00:00Z"` writes `status: 2026-03-17T13:00:00Z` which the YAML parser interprets as a date, not a string.
**Why it happens:** `frontmatter.cjs`'s `reconstructFrontmatter` only wraps values in quotes when they contain `:`, `#`, `[`, or `{`. ISO timestamps contain `:`, so they will be quoted — this is fine. But plan is to pass the value wrapped in quotes anyway in shell: `--value "\"$RESOLVED_AT\""`.
**How to avoid:** When setting `resolved_at` via the CLI, wrap the value in escaped quotes so it passes as a JSON string: `--value '"2026-03-17T13:00:00Z"'`. The `cmdFrontmatterSet` handler does `JSON.parse(value)` first if possible.
**Warning signs:** `parseCheckpointArtifact` fails on a CHECKPOINT.md that the frontmatter CLI wrote — validate with `frontmatter get` immediately after any `frontmatter set` call.

### Pitfall 5: Stale `checkpoint_status` in STATE.md after resolve transition
**What goes wrong:** After marking CHECKPOINT.md as resolved, the orchestrator does not call `state checkpoint --status resolved --path ""` to clear STATE.md fields, so `resume-project` sees a stale `awaiting-response` status and routes incorrectly on next resume.
**Why it happens:** The orchestrator step that marks CHECKPOINT.md resolved is at the end of the continuation agent flow — easy to omit the paired STATE.md update.
**How to avoid:** Include the `state checkpoint --status resolved --path ""` call in the same code block that writes `status: resolved` to CHECKPOINT.md. Commit both files together.
**Warning signs:** After a plan completes normally, `state json` still shows `checkpoint_status: awaiting-response`.

## Code Examples

Verified patterns from project source (all HIGH confidence — read from source files):

### Reading checkpoint_status from STATE.md frontmatter
```javascript
// Source: state.cjs cmdStateJson / extractFrontmatter
const content = fs.readFileSync(statePath, 'utf-8');
const fm = extractFrontmatter(content);
const checkpointStatus = fm.checkpoint_status || null;
const checkpointPath = fm.checkpoint_path || null;
```

### Validating CHECKPOINT.md with existing schema
```javascript
// Source: artifact-schema.cjs checkpointArtifactSchema
const { checkpointArtifactSchema } = require('./artifact-schema.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { safeReadFile } = require('./core.cjs');

const raw = safeReadFile(checkpointPath);
if (!raw) {
  // file missing — fallback path
}
const fm = extractFrontmatter(raw);
const result = checkpointArtifactSchema.safeParse(fm);
if (!result.success) {
  // result.error.issues — validation errors
  // fallback path
}
const checkpoint = result.data;
// checkpoint.status: 'pending' | 'awaiting-response' | 'resolved'
// checkpoint.type, checkpoint.why_blocked, checkpoint.choices etc.
```

### Adding a new `state` subcommand following the record-session pattern
```javascript
// Source: gsd-tools.cjs lines 247-261 (record-session pattern)
} else if (subcommand === 'checkpoint') {
  const statusIdx = args.indexOf('--status');
  const pathIdx = args.indexOf('--path');
  state.cmdStateCheckpoint(cwd, {
    status: statusIdx !== -1 ? args[statusIdx + 1] : null,
    checkpointPath: pathIdx !== -1 ? args[pathIdx + 1] : null,
  }, raw);
}
```

### Atomic STATE.md body update using stateReplaceField
```javascript
// Source: state.cjs stateReplaceField + writeStateMd pattern

function cmdStateCheckpoint(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const updated = [];

  let result = stateReplaceField(content, 'Checkpoint Status', options.status || '');
  if (result) { content = result; updated.push('Checkpoint Status'); }

  const pathValue = options.checkpointPath || '';
  result = stateReplaceField(content, 'Checkpoint Path', pathValue);
  if (result) { content = result; updated.push('Checkpoint Path'); }

  // Single writeStateMd call — both fields updated before frontmatter sync
  if (updated.length > 0) {
    writeStateMd(statePath, content, cwd);
  }

  output({ updated, checkpoint_status: options.status, checkpoint_path: options.checkpointPath || null }, raw, 'true');
}
```

Note: `stateReplaceField` returns `null` when the field is not found. If STATE.md does not yet contain `Checkpoint Status:` and `Checkpoint Path:` lines in its body, the `cmdStateCheckpoint` implementation will need to append them rather than replace. The `stateReplaceField` approach requires the field to pre-exist in the body. Two options: (a) ensure the STATE.md template includes those fields with placeholder values, or (b) append lines to the `## Session Continuity` section when field is not found. This is within Claude's discretion.

### Writing CHECKPOINT.md (executor pattern)
```markdown
<!-- In execute-plan.md, before checkpoint_return_for_orchestrator -->

Write CHECKPOINT.md to the phase directory using the Write tool with YAML frontmatter:

Path: `{phase_dir}/CHECKPOINT.md`

Content:
---
status: pending
type: {checkpoint_type}
why_blocked: "{why_blocked}"
what_is_uncertain: "{what_is_uncertain}"
choices: "{choices}"
allow_freeform: {allow_freeform}
resume_condition: "{resume_condition}"
resolved_at: ~
---

## Checkpoint Details

**Type:** {checkpoint_type}
**Blocked at:** Task {task_number} — {task_name}

[Human-readable summary of what caused the block and what the user needs to do]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Checkpoint payload validated in-flight, discarded | CHECKPOINT.md persisted with lifecycle tracking | Phase 16 (this phase) | Resume-project can now route correctly across session boundaries |
| No STATE.md fields for checkpoint lifecycle | `checkpoint_status` + `checkpoint_path` in frontmatter | Phase 16 (this phase) | Machine-readable checkpoint state for programmatic routing |
| CHECKPOINT-04 (schema) defined but unused at persistence layer | `checkpointArtifactSchema` wired to CHECKPOINT.md writes and reads | Phase 16 (this phase) | Schema validated disk artifact |

**Previously in scope, now complete:**
- `checkpointArtifactSchema` (CHECKPOINT-04 / Phase 15): ships in artifact-schema.cjs, production-ready

## Open Questions

1. **Where in STATE.md body to store `Checkpoint Status` and `Checkpoint Path` fields**
   - What we know: `stateReplaceField` requires the field to already exist in the body for replacement to work
   - What's unclear: Whether to add these fields to the `## Session Continuity` section (co-located with session state) or as standalone fields under `## Current Position`
   - Recommendation: Place them in the `## Session Continuity` section alongside `Stopped at:` and `Resume file:` — conceptually they serve the same purpose (session state for next resume). Add with `~` (null YAML) as initial placeholder. This keeps `stateReplaceField` working without append logic.

2. **Whether `state checkpoint` should also clear the fields when `--path ""` is passed**
   - What we know: on resolve, the intent is to clear both fields from STATE.md frontmatter
   - What's unclear: `stateReplaceField` sets to empty string, not removes the field; `buildStateFrontmatter` uses `if (checkpointStatus) fm.checkpoint_status = checkpointStatus` — an empty string is falsy, so it would be excluded from frontmatter naturally
   - Recommendation: Passing `--status ""` (or `--status resolved`) and `--path ""` will result in empty strings in the body. `buildStateFrontmatter`'s `if (checkpointStatus)` guard naturally excludes empty strings from the frontmatter object. The fields will be absent from frontmatter after resolve — which is the specified behavior. Document this in the subcommand.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (node:test) |
| Config file | `scripts/run-tests.cjs` (custom runner) |
| Quick run command | `node --test tests/checkpoint-contract.test.cjs` |
| Full suite command | `node scripts/run-tests.cjs` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHECKPOINT-01 | CHECKPOINT.md exists with all required fields after executor block | unit (contract) | `node --test tests/checkpoint-contract.test.cjs` | ✅ (extends existing) |
| CHECKPOINT-02 | resume-project routes correctly for missing/invalid/valid checkpoint | integration (state machine behavior) | `node --test tests/state.test.cjs` | ✅ (new describe block) |
| CHECKPOINT-03 | `state checkpoint` subcommand updates both fields atomically in STATE.md | unit | `node --test tests/state.test.cjs` | ✅ (new test case) |

### Sampling Rate
- **Per task commit:** `node --test tests/checkpoint-contract.test.cjs`
- **Per wave merge:** `node scripts/run-tests.cjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/checkpoint-lifecycle.test.cjs` — new file for CHECKPOINT-01/02/03 behavioral coverage
  - Test: `cmdStateCheckpoint` writes and clears `checkpoint_status` + `checkpoint_path` atomically
  - Test: `buildStateFrontmatter` includes `checkpoint_status` when body has the field
  - Test: `checkpointArtifactSchema.safeParse` correctly rejects malformed CHECKPOINT.md frontmatter
  - Test: resume routing logic: missing file → fallback message, invalid → fallback+errors, valid awaiting-response → summary+re-run instruction, resolved → skip

*(Existing `tests/checkpoint-contract.test.cjs` tests the agent protocol requirements — this new file tests the persistence layer.)*

## Sources

### Primary (HIGH confidence)
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/artifact-schema.cjs` — checkpointArtifactSchema fields and safeParse behavior
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/state.cjs` — stateReplaceField, writeStateMd, buildStateFrontmatter, cmdStateRecordSession pattern
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/frontmatter.cjs` — extractFrontmatter, reconstructFrontmatter, spliceFrontmatter, cmdFrontmatterSet
- `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/core.cjs` — safeReadFile
- `/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs` — subcommand routing pattern (state/record-session, state/begin-phase)
- `/home/bamn/get-stuff-done/get-stuff-done/workflows/execute-plan.md` — checkpoint_return_for_orchestrator, checkpoint_protocol steps
- `/home/bamn/get-stuff-done/get-stuff-done/workflows/execute-phase.md` — checkpoint_handling step, orchestrator continuation flow
- `/home/bamn/get-stuff-done/get-stuff-done/workflows/resume-project.md` — load_state, check_incomplete_work, determine_next_action steps
- `/home/bamn/get-stuff-done/get-stuff-done/references/checkpoints.md` — agent checkpoint return contract (required fields)
- `/home/bamn/get-stuff-done/.planning/phases/16-checkpoint-artifact-lifecycle/16-CONTEXT.md` — locked decisions and integration points

### Secondary (MEDIUM confidence)
- `/home/bamn/get-stuff-done/.planning/REQUIREMENTS.md` — CHECKPOINT-01/02/03 requirement definitions
- `/home/bamn/get-stuff-done/tests/checkpoint-contract.test.cjs` — existing test coverage baseline
- `/home/bamn/get-stuff-done/tests/state.test.cjs` — existing state test patterns to follow

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries read directly from source files
- Architecture patterns: HIGH — all integration points read from canonical workflow files
- Pitfalls: HIGH — derived from reading actual implementation code (stateReplaceField behavior, buildStateFrontmatter field exclusion logic, frontmatter quoting rules)
- Test map: HIGH — test runner and existing test structure verified from source

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable internal tooling — low drift risk)
