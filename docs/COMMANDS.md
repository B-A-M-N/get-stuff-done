# GSD Command Reference

> Complete command syntax, flags, options, and examples. For feature details, see [Feature Reference](FEATURES.md). For workflow walkthroughs, see [User Guide](USER-GUIDE.md).

---

## Command Syntax

- **Claude Code / Gemini / Copilot:** `/gsd:command-name [args]`
- **OpenCode:** `/gsd-command-name [args]`
- **Codex:** `$gsd-command-name [args]`

---

## Core Workflow Commands

### `/dostuff:new-project`

Initialize a new project with narrative-first intake and ITL-backed interpretation.

| Flag | Description |
|------|-------------|
| `--auto @file.md` | Auto-extract from document, skip interactive questions |

**Prerequisites:** No existing `.planning/PROJECT.md`
**Produces:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `research/`
**Behavior:** narrative-first intake, interpretation preview, explicit clarification checkpoints when ambiguity would corrupt planning artifacts, then project scaffolding

```bash
/dostuff:new-project                    # Interactive mode
/dostuff:new-project --auto @prd.md     # Auto-extract from PRD
```

---

### `/dostuff:discuss-phase`

Capture implementation decisions before planning.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

| Flag | Description |
|------|-------------|
| `--auto` | Auto-select recommended defaults only when ambiguity is not blocking |
| `--batch` | Group questions for batch intake instead of one-by-one |

**Prerequisites:** `.planning/ROADMAP.md` exists
**Produces:** `{phase}-CONTEXT.md`
**Behavior:** narrative-first intake, ITL interpretation preview, explicit clarification checkpoints with choices plus freeform fallback, then selective gray-area discussion

```bash
/dostuff:discuss-phase 1                # Interactive discussion for phase 1
/dostuff:discuss-phase 3 --auto         # Auto-select defaults for phase 3
/dostuff:discuss-phase --batch          # Batch mode for current phase
```

---

### `/gsd:ui-phase`

Generate UI design contract for frontend phases.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

**Prerequisites:** `.planning/ROADMAP.md` exists, phase has frontend/UI work
**Produces:** `{phase}-UI-SPEC.md`

```bash
/gsd:ui-phase 2                     # Design contract for phase 2
```

---

### `/gsd:research-phase`

Comprehensive ecosystem research for niche/complex domains.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

**Prerequisites:** `.planning/ROADMAP.md` exists
**Produces:** `{phase}-RESEARCH.md`
**Behavior:** consumes richer CONTEXT guidance from narrative-first discuss flows when available, while keeping RESEARCH.md as the output contract

```bash
/gsd:research-phase 3
```

---

### `/gsd:plan-phase`

Research, plan, and verify a phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to next unplanned phase) |

| Flag | Description |
|------|-------------|
| `--auto` | Skip interactive confirmations |
| `--skip-research` | Skip domain research step |
| `--skip-verify` | Skip plan checker verification loop |

**Prerequisites:** `.planning/ROADMAP.md` exists
**Produces:** `{phase}-RESEARCH.md`, `{phase}-{N}-PLAN.md`, `{phase}-VALIDATION.md`
**Behavior:** consumes richer CONTEXT and research guidance when available, runs a context-contract gate before the broader plan checker, and keeps PLAN.md and validation as the planning contracts

This means the planner gets richer narrative/context handoff while still keeping PLAN.md and validation as the planning contracts.

Invariant safety note: inferred constraints remain guidance until they pass the adversarial ambiguity gate; they are not automatically promoted to locked invariants.
Audit note: plan-phase now runs the immediate research/context contract gates before broader plan checking, but full downstream workflow-by-workflow lockability enforcement is still being audited and tightened. full downstream workflow enforcement is not claimed yet. Disable `workflow.adversarial_test_harness` only if you intentionally want to bypass the local gate.

```bash
/gsd:plan-phase 1                   # Research + plan + verify phase 1
/gsd:plan-phase 3 --skip-research   # Plan without research (familiar domain)
/gsd:plan-phase --auto              # Non-interactive planning
```

---

### `/gsd:execute-phase`

Execute all plans in a phase with wave-based parallelization.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number to execute |

**Prerequisites:** Phase has PLAN.md files
**Produces:** `{phase}-{N}-SUMMARY.md`, `{phase}-VERIFICATION.md`, git commits, and task-level commit references in modern summaries

```bash
/gsd:execute-phase 1                # Execute phase 1
```

Coverage baseline note:
- `npm run test:coverage` depends on dev dependencies being installed, including `c8`.
- The enforced gate is currently scoped to `get-stuff-done/bin/lib/itl*.cjs` plus `packages/itl/**/*.cjs` at `100%` line coverage.
- The stable coverage run uses the direct test files `tests/itl.test.cjs`, `tests/itl-package.test.cjs`, and `tests/dostuff.test.cjs`.
- That baseline is intentionally narrower than the full test suite because some subprocess-heavy install/E2E paths remain sandbox-sensitive.
- Those broader suites are still valuable regression checks, but they are not implied by the stable coverage gate unless explicitly refactored into it.

Canonical ITL note:
- ITL runtime payloads now pass through Zod-backed canonical validation before seed or interpretation results are emitted.
- The current deterministic extractor is already routed through the provider registry and adapter seam introduced in Phase 12.
- That local path is still a bounded heuristic interpreter, now with richer bullet/goal/success extraction and conservative evidence-backed inferences.
- Supported provider adapters now include Claude, Gemini, Kimi, and OpenAI.
- Default local development remains deterministic; provider handling in tests is fixture-normalized unless live-provider wiring is added explicitly.
- The extracted standalone package lives at `packages/itl` and exposes `interpret_narrative(input_text, context_data)` as the primary public API.

---

### `/gsd:dostuff`

Narrative-first entry point that routes to either project initialization or a quick task.

| Argument | Required | Description |
|----------|----------|-------------|
| `text` | No | Freeform description of what you want to build or change |

**Prerequisites:** None
**Routes to:** `/dostuff:new-project` or `/dostuff:quick`

```bash
/gsd:dostuff build a marketplace for handmade goods
/gsd:dostuff add CSV export to the reporting page
```

---

### `/dostuff:verify-work`

User acceptance testing with auto-diagnosis.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to last executed phase) |

**Prerequisites:** Phase has been executed
**Produces:** `{phase}-UAT.md`, fix plans if issues found
**Behavior:** narrative-first verification intake, ITL interpretation preview, explicit clarification checkpoints when verification intent is too uncertain, then standard user-confirmed UAT and gap logging
**Enforced checks:** uses canonical `summary_files` and `config_warning` from `init verify-work`, and cold-start smoke-test injection is backed by `verify verify-work-cold-start <phase>` rather than prompt-only path scanning

### `gsd-tools policy should-prompt <key>`

Resolve the effective runtime prompt policy for `gates.*` and `safety.*` keys.

- `gates.*`: `interactive` mode always prompts, `yolo` suppresses prompts, other modes defer to config
- `safety.*`: prompt behavior follows the safety flag directly, even in `yolo`

```bash
/dostuff:verify-work 1                  # UAT for phase 1
```

---

### `/gsd:ui-review`

Retroactive 6-pillar visual audit of implemented frontend.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to last executed phase) |

**Prerequisites:** Project has frontend code (works standalone, no GSD project needed)
**Produces:** `{phase}-UI-REVIEW.md`, screenshots in `.planning/ui-reviews/`

```bash
/gsd:ui-review                      # Audit current phase
/gsd:ui-review 3                    # Audit phase 3
```

---

### `/gsd:audit-milestone`

Verify milestone met its definition of done.

**Prerequisites:** All phases executed
**Produces:** Audit report with gap analysis

```bash
/gsd:audit-milestone
```

---

### `/gsd:complete-milestone`

Archive milestone, tag release.

**Prerequisites:** Milestone audit complete (recommended)
**Produces:** `MILESTONES.md` entry, git tag

```bash
/gsd:complete-milestone
```

---

### `/gsd:new-milestone`

Start next version cycle.

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | No | Milestone name |

**Prerequisites:** Previous milestone completed
**Produces:** Updated `PROJECT.md`, new `REQUIREMENTS.md`, new `ROADMAP.md`

```bash
/gsd:new-milestone                  # Interactive
/gsd:new-milestone "v2.0 Mobile"    # Named milestone
```

---

## Phase Management Commands

### `/gsd:add-phase`

Append new phase to roadmap.

```bash
/gsd:add-phase                      # Interactive — describe the phase
```

### `/gsd:insert-phase`

Insert urgent work between phases using decimal numbering.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Insert after this phase number |

```bash
/gsd:insert-phase 3                 # Insert between phase 3 and 4 → creates 3.1
```

### `/gsd:remove-phase`

Remove future phase and renumber subsequent phases.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number to remove |

```bash
/gsd:remove-phase 7                 # Remove phase 7, renumber 8→7, 9→8, etc.
```

### `/gsd:list-phase-assumptions`

Preview Claude's intended approach before planning.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/gsd:list-phase-assumptions 2       # See assumptions for phase 2
```

### `/gsd:plan-milestone-gaps`

Create phases to close gaps from milestone audit.

```bash
/gsd:plan-milestone-gaps             # Creates phases for each audit gap
```

### `/gsd:research-phase`

Deep ecosystem research only (standalone — usually use `/gsd:plan-phase` instead).

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/gsd:research-phase 4               # Research phase 4 domain
```

### `/gsd:validate-phase`

Retroactively audit and fill Nyquist validation gaps.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/gsd:validate-phase 2               # Audit test coverage for phase 2
```

---

## Navigation Commands

### `/gsd:progress`

Show status and next steps.

```bash
/gsd:progress                       # "Where am I? What's next?"
```

### `/gsd:resume-work`

Restore full context from last session.

```bash
/gsd:resume-work                    # After context reset or new session
```

### `/gsd:pause-work`

Save context handoff when stopping mid-phase.

```bash
/gsd:pause-work                     # Creates continue-here.md
```

### `/gsd:help`

Show all commands and usage guide.

```bash
/gsd:help                           # Quick reference
```

---

## Utility Commands

### `/dostuff:quick`

Execute ad-hoc task with GSD guarantees.

| Flag | Description |
|------|-------------|
| `--full` | Enable plan checking (2 iterations) + post-execution verification |
| `--discuss` | Lightweight pre-planning discussion with clarification checkpoints |
| `--research` | Spawn focused researcher before planning |

Flags are composable. `--discuss` now uses ITL interpretation first and pauses instead of guessing when the quick-task narrative is still blocking.

```bash
/dostuff:quick                          # Basic quick task
/dostuff:quick --discuss --research     # Discussion + research + planning
/dostuff:quick --full                   # With plan checking and verification
/dostuff:quick --discuss --research --full  # All optional stages
```

### `/gsd:autonomous`

Run all remaining phases autonomously.

| Flag | Description |
|------|-------------|
| `--from N` | Start from a specific phase number |

```bash
/gsd:autonomous                     # Run all remaining phases
/gsd:autonomous --from 3            # Start from phase 3
```

### `/gsd:do`

Route freeform text to the right GSD command.

```bash
/gsd:do                             # Then describe what you want
```

### `/gsd:note`

Zero-friction idea capture — append, list, or promote notes to todos.

| Argument | Required | Description |
|----------|----------|-------------|
| `text` | No | Note text to capture (default: append mode) |
| `list` | No | List all notes from project and global scopes |
| `promote N` | No | Convert note N into a structured todo |

| Flag | Description |
|------|-------------|
| `--global` | Use global scope for note operations |

```bash
/gsd:note "Consider caching strategy for API responses"
/gsd:note list
/gsd:note promote 3
```

### `/gsd:debug`

Systematic debugging with persistent state.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Description of the bug |

```bash
/gsd:debug "Login button not responding on mobile Safari"
```

### `/gsd:add-todo`

Capture idea or task for later.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Todo description |

```bash
/gsd:add-todo "Consider adding dark mode support"
```

### `/gsd:check-todos`

List pending todos and select one to work on.

```bash
/gsd:check-todos
```

### `/gsd:add-tests`

Generate tests for a completed phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/gsd:add-tests 2                    # Generate tests for phase 2
```

### `/gsd:stats`

Display project statistics.

```bash
/gsd:stats                          # Project metrics dashboard
```

### `/gsd:profile-user`

Generate a developer behavioral profile from Claude Code session analysis across 8 dimensions (communication style, decision patterns, debugging approach, UX preferences, vendor choices, frustration triggers, learning style, explanation depth). Produces artifacts that personalize Claude's responses.

| Flag | Description |
|------|-------------|
| `--questionnaire` | Use interactive questionnaire instead of session analysis |
| `--refresh` | Re-analyze sessions and regenerate profile |

**Generated artifacts:**
- `USER-PROFILE.md` — Full behavioral profile
- `/gsd:dev-preferences` command — Load preferences in any session
- `CLAUDE.md` profile section — Auto-discovered by Claude Code

```bash
/gsd:profile-user                   # Analyze sessions and build profile
/gsd:profile-user --questionnaire   # Interactive questionnaire fallback
/gsd:profile-user --refresh         # Re-generate from fresh analysis
```

### `/gsd:health`

Validate `.planning/` directory integrity.

| Flag | Description |
|------|-------------|
| `--repair` | Auto-fix recoverable issues |

```bash
/gsd:health                         # Check integrity
/gsd:health --repair                # Check and fix
```

### `/gsd:cleanup`

Archive accumulated phase directories from completed milestones.

```bash
/gsd:cleanup
```

---

## Enforcement Boundary Commands

These CLI primitives form the non-bypassable enforcement boundary. Agents use these directly; they are not slash commands but `gsd-tools` subcommands.

### `complete-task` (gsd-tools)

Single-call task completion primitive. Stricter than `commit-task`: phase/plan/task all required, auto prev-hash, sequential enforcement.

```bash
node gsd-tools.cjs complete-task "feat(01-02): add auth" \
  --scope 01-02 --phase 1 --plan 2 --task 3 \
  --files src/auth.ts
```

| Flag | Required | Description |
|------|----------|-------------|
| `--scope` | **Yes** | `{phase}-{plan}` scope tag |
| `--phase` | **Yes** | Phase number |
| `--plan` | **Yes** | Plan number |
| `--task` | **Yes** | Task number (must be last+1 in log) |
| `--files` | **Yes** | Files to stage |
| `--prev-hash` | No | Override auto-detected prev hash |

### `verify integrity` (gsd-tools)

10-check coherence audit. Runs automatically at every `context build` call.

```bash
node gsd-tools.cjs verify integrity --phase 1 --plan 2
```

| Flag | Description |
|------|-------------|
| `--phase N` | Phase to audit (enables task-log checks) |
| `--plan M` | Plan to audit (enables task-log checks) |
| `--raw` | Output plain text status instead of JSON |

### `firecrawl check` (gsd-tools)

Check if the local Firecrawl instance is reachable. Agents call this before any external retrieval to determine whether to use Firecrawl or declare degraded mode.

```bash
node gsd-tools.cjs firecrawl check
# → { available: true, planning_server_available: true, mode: "firecrawl" }
# → exits 0 when up, 1 when down
```

### `context build` (gsd-tools)

Build a Zod-validated execution snapshot for a workflow entry point.

```bash
node gsd-tools.cjs context build --workflow execute-plan --phase 1 --plan 2
```

| Flag | Required | Description |
|------|----------|-------------|
| `--workflow` | **Yes** | `execute-plan`, `verify-work`, or `plan-phase` |
| `--phase N` | No | Override phase from STATE.md |
| `--plan M` | No | Override plan from STATE.md |

---

## Configuration Commands

### `/gsd:settings`

Interactive configuration of workflow toggles and model profile.

```bash
/gsd:settings                       # Interactive config
```

### `/gsd:set-profile`

Quick profile switch.

| Argument | Required | Description |
|----------|----------|-------------|
| `profile` | **Yes** | `quality`, `balanced`, `budget`, or `inherit` |

```bash
/gsd:set-profile budget             # Switch to budget profile
/gsd:set-profile quality            # Switch to quality profile
```

---

## Brownfield Commands

### `/gsd:map-codebase`

Analyze existing codebase with parallel mapper agents.

| Argument | Required | Description |
|----------|----------|-------------|
| `area` | No | Scope mapping to a specific area |

```bash
/gsd:map-codebase                   # Full codebase analysis
/gsd:map-codebase auth              # Focus on auth area
```

---

## Update Commands

### `/gsd:update`

Update GSD with changelog preview.

```bash
/gsd:update                         # Check for updates and install
```

### `/gsd:reapply-patches`

Restore local modifications after a GSD update.

```bash
/gsd:reapply-patches                # Merge back local changes
```

---

## Community Commands

### `/gsd:join-discord`

Open Discord community invite.

```bash
/gsd:join-discord
```


Verify-work note:
- `/dostuff:verify-work` now consumes canonical `summary_files`, `config_warning`, and cold-start metadata from `init verify-work`.
- Cold-start smoke-test injection is backed by `verify verify-work-cold-start <phase>`, not just prompt-side path scanning.
