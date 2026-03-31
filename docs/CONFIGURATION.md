# GSD Configuration Reference

> Full configuration schema, workflow toggles, model profiles, and git branching options. For feature context, see [Feature Reference](FEATURES.md).

---

## Configuration File

GSD stores project settings in `.planning/config.json`. Created during `/gsd:new-project`, updated via `/gsd:settings`. The keys below are part of the live runtime config surface, not docs-only placeholders.

### Full Schema

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "model_profile": "balanced",
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": false,
    "nyquist_validation": true,
    "ui_phase": true,
    "ui_safety_gate": true,
    "node_repair": true,
    "node_repair_budget": 2
  },
  "parallelization": true,
  "git": {
    "branching_strategy": "none",
    "phase_branch_template": "gsd/phase-{phase}-{slug}",
    "milestone_branch_template": "gsd/{milestone}-{slug}"
  },
  "gates": {
    "confirm_project": true,
    "confirm_phases": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_plan": true,
    "execute_next_plan": true,
    "issues_review": true,
    "confirm_transition": true,
    "confirm_milestone_scope": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  }
}
```

---

## Core Settings

| Setting | Type | Options | Default | Description |
|---------|------|---------|---------|-------------|
| `mode` | enum | `interactive`, `yolo` | `interactive` | **Deprecated.** Use `workflow.auto_advance` instead. `yolo` auto-approves decisions; `interactive` confirms at each step |
| `granularity` | enum | `coarse`, `standard`, `fine` | `standard` | **Deprecated.** Phase slicing is automatic; previously controlled phase count |
| `model_profile` | enum | `quality`, `balanced`, `budget`, `inherit` | `balanced` | Model tier for each agent (see [Model Profiles](#model-profiles)) |

> **Note:** `granularity` was renamed from `depth` in v1.22.3. Existing configs are auto-migrated.

---

## Workflow Toggles

Most workflow toggles follow the **absent = enabled** pattern. Exceptions are explicitly called out below when the runtime default is `false`.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `workflow.research` | boolean | `true` | Domain investigation before planning each phase |
| `workflow.plan_check` | boolean | `true` | Plan verification loop (up to 3 iterations) |
| `workflow.verifier` | boolean | `true` | Post-execution verification against phase goals |
| `workflow.auto_advance` | boolean | `false` | Auto-chain discuss → plan → execute without stopping; disabled by default unless explicitly enabled |
| `workflow.nyquist_validation` | boolean | `true` | Test coverage mapping during plan-phase research |
| `workflow.adversarial_test_harness` | boolean | `true` | Enforce research/context contract gates that keep unresolved ambiguity and guidance-only inferences visible |
| `workflow.ui_phase` | boolean | `true` | Generate UI design contracts for frontend phases |
| `workflow.ui_safety_gate` | boolean | `true` | Prompt to run /gsd:ui-phase for frontend phases during plan-phase |
| `workflow.node_repair` | boolean | `true` | Autonomous task repair on verification failure |
| `workflow.node_repair_budget` | number | `2` | Max repair attempts per failed task |
| `workflow._auto_chain_active` | boolean | `false` | Internal flag for auto-chain state management; automatically managed by the system |

### Recommended Presets

| Scenario | mode | granularity | profile | research | plan_check | verifier |
|----------|------|-------------|---------|----------|------------|----------|
| Prototyping | `yolo` | `coarse` | `budget` | `false` | `false` | `false` |
| Normal development | `interactive` | `standard` | `balanced` | `true` | `true` | `true` |
| Production release | `interactive` | `fine` | `quality` | `true` | `true` | `true` |

---

## Planning Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `planning.commit_docs` | boolean | `true` | Whether `.planning/` files are committed to git |
| `planning.search_gitignored` | boolean | `false` | Add `--no-ignore` to broad searches to include `.planning/` |

### Auto-Detection

If `.planning/` is in `.gitignore`, `commit_docs` is automatically `false` regardless of config.json. This prevents git errors.

### Private Planning Setup

To keep planning artifacts out of git:

1. Set `planning.commit_docs: false` and `planning.search_gitignored: true`
2. Add `.planning/` to `.gitignore`
3. If previously tracked: `git rm -r --cached .planning/ && git commit -m "chore: stop tracking planning docs"`

---

## Parallelization Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `parallelization` | boolean | `true` | Allow independent plans within a phase to execute in parallel |

---

## Git Branching

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `git.branching_strategy` | enum | `none` | `none`, `phase`, or `milestone` |
| `git.phase_branch_template` | string | `gsd/phase-{phase}-{slug}` | Branch name template for phase strategy |
| `git.milestone_branch_template` | string | `gsd/{milestone}-{slug}` | Branch name template for milestone strategy |

### Strategy Comparison

| Strategy | Creates Branch | Scope | Merge Point | Best For |
|----------|---------------|-------|-------------|----------|
| `none` | Never | N/A | N/A | Solo development, simple projects |
| `phase` | At `execute-phase` start | One phase | User merges after phase | Code review per phase, granular rollback |
| `milestone` | At first `execute-phase` | All phases in milestone | At `complete-milestone` | Release branches, PR per version |

### Template Variables

| Variable | Available In | Example |
|----------|-------------|---------|
| `{phase}` | `phase_branch_template` | `03` (zero-padded) |
| `{slug}` | Both templates | `user-authentication` (lowercase, hyphenated) |
| `{milestone}` | `milestone_branch_template` | `v1.0` |

### Merge Options at Milestone Completion

| Option | Git Command | Result |
|--------|-------------|--------|
| Squash merge (recommended) | `git merge --squash` | Single clean commit per branch |
| Merge with history | `git merge --no-ff` | Preserves all individual commits |
| Delete without merging | `git branch -D` | Discard branch work |
| Keep branches | (none) | Manual handling later |

---

## Gate Settings

Control confirmation prompts during workflows.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `gates.confirm_project` | boolean | `true` | Confirm project details before finalizing |
| `gates.confirm_phases` | boolean | `true` | Confirm phase breakdown |
| `gates.confirm_roadmap` | boolean | `true` | Confirm roadmap before proceeding |
| `gates.confirm_breakdown` | boolean | `true` | Confirm task breakdown |
| `gates.issues_review` | boolean | `true` | Review issues before creating fix plans |
| `gates.confirm_transition` | boolean | `true` | Confirm phase transition |
| `gates.confirm_milestone_scope` | boolean | `true` | Confirm milestone scope before completion |

---

## Safety Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `safety.always_confirm_destructive` | boolean | `true` | Confirm destructive operations (deletes, overwrites) |
| `safety.always_confirm_external_services` | boolean | `true` | Confirm external service interactions |

---

## Hook Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `hooks.context_warnings` | boolean | `true` | Show context window usage warnings during sessions |

---

## Model Profiles

### Profile Definitions

| Agent | `quality` | `balanced` | `budget` | `inherit` |
|-------|-----------|------------|----------|-----------|
| gsd-planner | Opus | Opus | Sonnet | Inherit |
| gsd-roadmapper | Opus | Sonnet | Sonnet | Inherit |
| gsd-executor | Opus | Sonnet | Sonnet | Inherit |
| gsd-phase-researcher | Opus | Sonnet | Haiku | Inherit |
| gsd-project-researcher | Opus | Sonnet | Haiku | Inherit |
| gsd-research-synthesizer | Sonnet | Sonnet | Haiku | Inherit |
| gsd-debugger | Opus | Sonnet | Sonnet | Inherit |
| gsd-codebase-mapper | Sonnet | Haiku | Haiku | Inherit |
| gsd-verifier | Sonnet | Sonnet | Haiku | Inherit |
| gsd-plan-checker | Sonnet | Sonnet | Haiku | Inherit |
| gsd-integration-checker | Sonnet | Sonnet | Haiku | Inherit |
| gsd-nyquist-auditor | Sonnet | Sonnet | Haiku | Inherit |

### Per-Agent Overrides

Override specific agents without changing the entire profile:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-executor": "opus",
    "gsd-planner": "haiku"
  }
}
```

Valid override values: `opus`, `sonnet`, `haiku`, `inherit`

### Profile Philosophy

| Profile | Philosophy | When to Use |
|---------|-----------|-------------|
| `quality` | Opus for all decision-making, Sonnet for verification | Quota available, critical architecture work |
| `balanced` | Opus for planning only, Sonnet for everything else | Normal development (default) |
| `budget` | Sonnet for code-writing, Haiku for research/verification | High-volume work, less critical phases |
| `inherit` | All agents use current session model | Dynamic model switching (OpenCode `/model`) |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLAUDE_CONFIG_DIR` | Override default config directory (`~/.claude/`) |
| `GEMINI_API_KEY` | Detected by context monitor to switch hook event name |
| `WSL_DISTRO_NAME` | Detected by installer for WSL path handling |

---

## Global Defaults

Save settings as global defaults for future projects:

**Location:** `~/.gsd/defaults.json`

When `/gsd:new-project` creates a new `config.json`, it reads global defaults and merges them as the starting configuration. Per-project settings always override globals.
