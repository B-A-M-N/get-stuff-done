<div align="center">

# GET STUFF DONE

**A meta-prompting, context engineering and spec-driven development system for Claude Code.**

**Solves context rot — the quality degradation that happens as Claude fills its context window.**

[![Tests](https://img.shields.io/github/actions/workflow/status/B-A-M-N/get-stuff-done/test.yml?branch=main&style=for-the-badge&logo=github&label=Tests)](https://github.com/B-A-M-N/get-stuff-done/actions)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
git clone https://github.com/B-A-M-N/get-stuff-done.git
cd get-stuff-done
node bin/install.js --claude --global
```

[How It Works](#how-it-works) · [Commands](#commands) · [Why It Works](#why-it-works) · [User Guide](docs/USER-GUIDE.md)

</div>

---

> **Fork notice:** `get-stuff-done` is a personal fork of [get-shit-done](https://github.com/gsd-build/get-shit-done) with additional features, a harder enforcement boundary, and a PG name. It is not officially supported or maintained by the original project team. The underlying system belongs to the upstream — if you want the battle-tested, widely-supported version, use that. This fork exists because of specific gaps that needed addressing.

---

## Why the Original Was Built

I'm a solo developer. I don't write code — Claude Code does.

Other spec-driven development tools exist; BMAD, Speckit... But they all seem to make things way more complicated than they need to be (sprint ceremonies, story points, stakeholder syncs, retrospectives, Jira workflows) or lack real big picture understanding of what you're building. I'm not a 50-person software company. I don't want to play enterprise theater. I'm just a creative person trying to build great things that work.

So I built GSD. The complexity is in the system, not in your workflow. Behind the scenes: context engineering, XML prompt formatting, subagent orchestration, state management. What you see: a few commands that just work.

The system gives Claude everything it needs to do the work *and* verify it. I trust the workflow. It just does a good job.

That's what this is. No enterprise roleplay bullshit. Just an incredibly effective system for building cool stuff consistently using Claude Code.

— **TÂCHES**

---

## Why I Forked It

I agree with everything above. But when I used it, I ran into three problems the original doesn't solve.

**Context capture is too structured.** The discuss-phase asks you to identify "gray areas" in predefined categories. If you already think that way, great. But most people don't. They have an idea, a rough picture in their head, and a bunch of implicit preferences they've never articulated. Asking someone to categorize gray areas before they've even said what they're building puts the burden in the wrong place. This fork flips it: you describe what you're imagining in plain language, and the system extracts the decisions with a deterministic interpretation layer that is intentionally conservative rather than magical. You don't need to arrive with the right vocabulary.

**Agents leap ahead.** The original GSD is good at executing plans. It's less disciplined about stopping between them. An agent completes a phase and immediately starts deciding what comes next — researching, planning, sometimes executing — before you've had a chance to redirect. By the time you notice, it's several steps into something you didn't ask for. This fork adds explicit flow controls at every phase transition. The system presents options and stops. It waits for your response, classifies your intent, and only proceeds when you've confirmed the direction. If you need a fresh context and have to `/clear`, your decision survives the reset — the next session knows exactly what you chose.

**Agents can't be trusted to verify their own work.** When an agent commits code, runs a test, and reports back — you have no way to know whether the commit actually happened, whether the test actually ran, or whether the log reflects what was built. The original relies on prose instructions. This fork replaces prose with a non-bypassable enforcement boundary: a set of CLI primitives (`complete-task`, `verify integrity`, `context build`) that agents must call to commit, verify, and log work. An agent that skips them fails — not with a note in the output but with a non-zero exit code that halts the workflow. Every task commit is sequential, hash-verified, and logged to disk before the next task can start. Every workflow entry starts from a Zod-validated snapshot of current state, not from what the agent guesses the state is.

Additionally: this fork runs a self-hosted [Firecrawl](https://github.com/mendableai/firecrawl) instance as the external normalization layer for all research. When agents fetch docs, changelogs, or external references, they go through Firecrawl — not raw WebFetch. This means structured extraction, consistent markdown output, and local-only traffic. Agents check availability first (`gsd-tools firecrawl check`) and declare degraded mode if it's down rather than silently falling back.

These aren't cosmetic changes. They affect how reliably the system builds what you actually want, and whether you can trust what it reports.

---

## Who This Is For

People who want to describe what they want and have it built correctly — without pretending they're running a 50-person engineering org.

---

## Getting Started

```bash
git clone https://github.com/B-A-M-N/get-stuff-done.git
cd get-stuff-done
node bin/install.js --claude --global
```

Installs to `~/.claude/` for Claude Code.

```bash
node bin/install.js --claude --local   # Install to ./.claude/ (current project only)
```

Verify with `/gsd:help`.

### Staying Updated

```bash
cd get-stuff-done
git pull
node bin/install.js --claude --global
```

### Recommended: Skip Permissions Mode

GSD is designed for frictionless automation. Run Claude Code with:

```bash
claude --dangerously-skip-permissions
```

> [!TIP]
> This is how GSD is intended to be used — stopping to approve `date` and `git commit` 50 times defeats the purpose.

<details>
<summary><strong>Alternative: Granular Permissions</strong></summary>

If you prefer not to use that flag, add this to your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(date:*)",
      "Bash(echo:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(wc:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(sort:*)",
      "Bash(grep:*)",
      "Bash(tr:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status:*)",
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git tag:*)"
    ]
  }
}
```

</details>

---

## How It Works

> **Already have code?** Run `/gsd:map-codebase` first. It spawns parallel agents to analyze your stack, architecture, conventions, and concerns. Then `/gsd:new-project` knows your codebase — questions focus on what you're adding, and planning automatically loads your patterns.

### 1. Initialize Project

```
/gsd:new-project
```

One command, one flow. The system:

1. **Questions** — Asks until it understands your idea completely (goals, constraints, tech preferences, edge cases)
2. **Research** — Spawns parallel agents to investigate the domain (optional but recommended)
3. **Requirements** — Extracts what's v1, v2, and out of scope
4. **Roadmap** — Creates phases mapped to requirements

You approve the roadmap. Now you're ready to build.

**Creates:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `.planning/research/`

---

### 2. Discuss Phase

```
/gsd:discuss-phase 1
```

**This is where you shape the implementation.**

Your roadmap has a sentence or two per phase. That's not enough context to build something the way *you* imagine it. This step captures your preferences before anything gets researched or planned.

Most tools ask you to check boxes: "which gray areas apply?" But if you don't already think in those categories, you end up with shallow answers — and the system builds something generic. GSD takes a narrative approach instead. The system asks open questions, you answer in plain language, and it extracts the decisions from what you say.

You don't need to know the right technical terminology. You just describe what you're picturing. The system reads between the lines:

> "I want it to feel snappy, not a heavy full-page load" → extracted decision: client-side navigation, optimistic updates

> "Keep it simple, I don't want a whole admin interface" → extracted decision: scope APIs to user-facing only, no admin layer for v1

The output — `CONTEXT.md` — feeds directly into the next two steps:

1. **Researcher reads it** — Knows what patterns to investigate based on your actual intent
2. **Planner reads it** — Knows what decisions are locked and plans accordingly

The deeper you go here, the more the system builds what you actually want. Skip it and you get reasonable defaults. Use it and you get *your* vision.

**Creates:** `{phase_num}-CONTEXT.md`

---

### 3. Plan Phase

```
/gsd:plan-phase 1
```

The system:

1. **Researches** — Investigates how to implement this phase, guided by your CONTEXT.md decisions
2. **Plans** — Creates 2-3 atomic task plans with XML structure
3. **Verifies** — Checks plans against requirements, loops until they pass

Each plan is small enough to execute in a fresh context window. No degradation, no "I'll be more concise now."

**Creates:** `{phase_num}-RESEARCH.md`, `{phase_num}-{N}-PLAN.md`

---

### 4. Execute Phase

```
/gsd:execute-phase 1
```

The system:

1. **Runs plans in waves** — Parallel where possible, sequential when dependent
2. **Fresh context per plan** — 200k tokens purely for implementation, zero accumulated garbage
3. **Task commit trail** — Modern execution summaries are verified to include a distinct git commit trail for each declared task
4. **Verifies against goals** — Checks the codebase delivers what the phase promised

Walk away, come back to completed work with clean git history and task-level commit evidence in each modern summary.

**Phase transitions wait for you.**

When execution completes, the system presents the next recommended action and stops. It does not auto-advance. You decide what happens next:

- Confirm → it runs the command right now in the same session
- Redirect → say what you actually want ("research before planning", "skip to phase 3") and it saves your decision
- Unrelated question → the session continues normally, no GSD command runs

**Cross-session continuity.** If you redirect and need a fresh context (`/clear`), your decision is saved to `.planning/.gsd-next.json`. When the target runtime supports the installed `UserPromptSubmit` continuity hook, that decision is injected into your next session automatically. Just say "continue" — the system resumes from the saved command instead of guessing.

**How Wave Execution Works:**

Plans are grouped into "waves" based on dependencies. Within each wave, plans run in parallel. Waves run sequentially.

```
┌────────────────────────────────────────────────────────────────────┐
│  PHASE EXECUTION                                                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1 (parallel)          WAVE 2 (parallel)          WAVE 3      │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Plan 01 │ │ Plan 02 │ →  │ Plan 03 │ │ Plan 04 │ →  │ Plan 05 │ │
│  │         │ │         │    │         │ │         │    │         │ │
│  │ User    │ │ Product │    │ Orders  │ │ Cart    │    │ Checkout│ │
│  │ Model   │ │ Model   │    │ API     │ │ API     │    │ UI      │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┘              │      │
│              Dependencies: Plan 03 needs Plan 01            │      │
│                          Plan 04 needs Plan 02              │      │
│                          Plan 05 needs Plans 03 + 04        │      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Why waves matter:**
- Independent plans → Same wave → Run in parallel
- Dependent plans → Later wave → Wait for dependencies
- File conflicts → Sequential plans or same plan

This is why "vertical slices" (Plan 01: User feature end-to-end) parallelize better than "horizontal layers" (Plan 01: All models, Plan 02: All APIs).

**Creates:** `{phase_num}-{N}-SUMMARY.md`, `{phase_num}-VERIFICATION.md`

---

### 5. Verify Work

```
/gsd:verify-work 1
```

**This is where you confirm it actually works.**

Automated verification checks that code exists and tests pass. But does the feature *work* the way you expected? This is your chance to use it.

The system:

1. **Extracts testable deliverables** — What you should be able to do now
2. **Walks you through one at a time** — "Can you log in with email?" Yes/no, or describe what's wrong
3. **Diagnoses failures automatically** — Spawns debug agents to find root causes
4. **Creates verified fix plans** — Ready for immediate re-execution

If everything passes, you move on. If something's broken, you don't manually debug — you just run `/gsd:execute-phase` again with the fix plans it created.

**Creates:** `{phase_num}-UAT.md`, fix plans if issues found

---

### 6. Repeat → Complete → Next Milestone

```
/gsd:discuss-phase 2
/gsd:plan-phase 2
/gsd:execute-phase 2
/gsd:verify-work 2
...
/gsd:complete-milestone
/gsd:new-milestone
```

Loop **discuss → plan → execute → verify** until milestone complete.

If you want faster intake during discussion, use `/gsd:discuss-phase <n> --batch` to answer a small grouped set of questions at once instead of one-by-one.

Each phase gets your input (discuss), proper research (plan), clean execution (execute), and human verification (verify). Context stays fresh. Quality stays high.

When all phases are done, `/gsd:complete-milestone` archives the milestone and tags the release.

Then `/gsd:new-milestone` starts the next version — same flow as `new-project` but for your existing codebase. You describe what you want to build next, the system researches the domain, you scope requirements, and it creates a fresh roadmap. Each milestone is a clean cycle: define → build → ship.

---

### Quick Mode

```
/gsd:quick
```

**For ad-hoc tasks that don't need full planning.**

Quick mode gives you GSD guarantees (atomic commits, state tracking) with a faster path:

- **Same agents** — Planner + executor, same quality
- **Skips optional steps** — No research, no plan checker, no verifier by default
- **Separate tracking** — Lives in `.planning/quick/`, not phases

**`--discuss` flag:** Lightweight discussion to lock in decisions before planning.

**`--research` flag:** Spawns a focused researcher before planning. Investigates implementation approaches, library options, and pitfalls. Use when you're unsure how to approach a task.

**`--full` flag:** Enables plan-checking (max 2 iterations) and post-execution verification.

Flags are composable: `--discuss --research --full` gives discussion + research + plan-checking + verification.

```
/gsd:quick
> What do you want to do? "Add dark mode toggle to settings"
```

**Creates:** `.planning/quick/001-add-dark-mode-toggle/PLAN.md`, `SUMMARY.md`

---

## Why It Works

### Context Engineering

Claude Code is incredibly powerful *if* you give it the context it needs. Most people don't.

GSD handles it for you:

| File | What it does |
|------|--------------|
| `PROJECT.md` | Project vision, always loaded |
| `research/` | Ecosystem knowledge (stack, features, architecture, pitfalls) |
| `REQUIREMENTS.md` | Scoped v1/v2 requirements with phase traceability |
| `ROADMAP.md` | Where you're going, what's done |
| `STATE.md` | Decisions, blockers, position — memory across sessions |
| `PLAN.md` | Atomic task with XML structure, verification steps |
| `SUMMARY.md` | What happened, what changed, committed to history |
| `todos/` | Captured ideas and tasks for later work |

Size limits based on where Claude's quality degrades. Stay under, get consistent excellence.

### XML Prompt Formatting

Every plan is structured XML optimized for Claude:

```xml
<task type="auto">
  <name>Create login endpoint</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>
    Use jose for JWT (not jsonwebtoken - CommonJS issues).
    Validate credentials against users table.
    Return httpOnly cookie on success.
  </action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200 + Set-Cookie</verify>
  <done>Valid credentials return cookie, invalid return 401</done>
</task>
```

Precise instructions. No guessing. Verification built in.

### Multi-Agent Orchestration

Every stage uses the same pattern: a thin orchestrator spawns specialized agents, collects results, and routes to the next step.

| Stage | Orchestrator does | Agents do |
|-------|------------------|-----------|
| Research | Coordinates, presents findings | 4 parallel researchers investigate stack, features, architecture, pitfalls |
| Planning | Validates, manages iteration | Planner creates plans, checker verifies, loop until pass |
| Execution | Groups into waves, tracks progress | Executors implement in parallel, each with fresh 200k context |
| Verification | Presents results, routes next | Verifier checks codebase against goals, debuggers diagnose failures |

The orchestrator never does heavy lifting. It spawns agents, waits, integrates results.

**The result:** You can run an entire phase — deep research, multiple plans created and verified, thousands of lines of code written across parallel executors, automated verification against goals — and your main context window stays at 30-40%. The work happens in fresh subagent contexts. Your session stays fast and responsive.

### Agent Discipline

A common failure mode in AI-driven systems: the agent finishes a task and immediately starts the next one without asking. It "helpfully" chains steps together and by the time you look up, it's three phases ahead doing something you didn't want.

GSD prevents this. Phase transitions use an explicit wait-and-classify pattern:

1. Phase completes → system presents recommended next action
2. System **stops and waits** for your response
3. Response is classified as: confirm (run it), redirect (save decision, /clear), or unrelated (continue session normally)

In `yolo` mode, auto-advance chains steps. In `interactive` mode (default), nothing happens without your say-so.

The cross-session scratch pad extends this discipline across context resets. Your redirected decision survives `/clear`. On runtimes where the continuity hook is installed, the saved command is injected into the next session automatically. The system resumes from that artifact instead of relying on memory or re-explanation.

### Atomic Git Commits

Each task gets its own commit immediately after completion:

```bash
abc123f docs(08-02): complete user registration plan
def456g feat(08-02): add email confirmation flow
hij789k feat(08-02): implement password hashing
lmn012o feat(08-02): create registration endpoint
```

> [!NOTE]
> **Benefits:** Git bisect finds exact failing task. Each task independently revertable. Clear history for Claude in future sessions. Better observability in AI-automated workflow.

Every commit is surgical, traceable, and meaningful.

### Modular by Design

- Add phases to current milestone
- Insert urgent work between phases
- Complete milestones and start fresh
- Adjust plans without rebuilding everything

You're never locked in. The system adapts.

---

## Commands

### Core Workflow

| Command | What it does |
|---------|--------------|
| `/gsd:new-project [--auto]` | Full initialization: questions → research → requirements → roadmap |
| `/gsd:discuss-phase [N] [--auto]` | Capture implementation decisions before planning |
| `/gsd:plan-phase [N] [--auto]` | Research + plan + verify for a phase |
| `/gsd:execute-phase <N>` | Execute all plans in parallel waves, verify when complete |
| `/gsd:verify-work [N]` | Manual user acceptance testing ¹ |
| `/gsd:audit-milestone` | Verify milestone achieved its definition of done |
| `/gsd:complete-milestone` | Archive milestone, tag release |
| `/gsd:new-milestone [name]` | Start next version: questions → research → requirements → roadmap |

### UI Design

| Command | What it does |
|---------|--------------|
| `/gsd:ui-phase [N]` | Generate UI design contract (UI-SPEC.md) for frontend phases |
| `/gsd:ui-review [N]` | Retroactive 6-pillar visual audit of implemented frontend code |

### Navigation

| Command | What it does |
|---------|--------------|
| `/gsd:progress` | Where am I? What's next? |
| `/gsd:help` | Show all commands and usage guide |
| `/gsd:update` | Update GSD with changelog preview |
| `/gsd:join-discord` | Join the GSD Discord community |

### Brownfield

| Command | What it does |
|---------|--------------|
| `/gsd:map-codebase [area]` | Analyze existing codebase before new-project |

### Phase Management

| Command | What it does |
|---------|--------------|
| `/gsd:add-phase` | Append phase to roadmap |
| `/gsd:insert-phase [N]` | Insert urgent work between phases |
| `/gsd:remove-phase [N]` | Remove future phase, renumber |
| `/gsd:list-phase-assumptions [N]` | See Claude's intended approach before planning |
| `/gsd:plan-milestone-gaps` | Create phases to close gaps from audit |

### Session

| Command | What it does |
|---------|--------------|
| `/gsd:pause-work` | Create handoff when stopping mid-phase |
| `/gsd:resume-work` | Restore from last session |

### Utilities

| Command | What it does |
|---------|--------------|
| `/gsd:settings` | Configure model profile and workflow agents |
| `/gsd:set-profile <profile>` | Switch model profile (quality/balanced/budget/inherit) |
| `/gsd:add-todo [desc]` | Capture idea for later |
| `/gsd:check-todos` | List pending todos |
| `/gsd:debug [desc]` | Systematic debugging with persistent state |
| `/gsd:do <text>` | Route freeform text to the right GSD command automatically |
| `/gsd:note <text>` | Zero-friction idea capture — append, list, or promote notes to todos |
| `/gsd:quick [--full] [--discuss] [--research]` | Execute ad-hoc task with GSD guarantees (`--full` adds plan-checking and verification, `--discuss` gathers context first, `--research` investigates approaches before planning) |
| `/gsd:health [--repair]` | Validate `.planning/` directory integrity, auto-repair with `--repair` |
| `/gsd:stats` | Display project statistics — phases, plans, requirements, git metrics |
| `/gsd:profile-user [--questionnaire] [--refresh]` | Generate developer behavioral profile from session analysis for personalized responses |

<sup>¹ Contributed by reddit user OracleGreyBeard</sup>

---

## Configuration

GSD stores project settings in `.planning/config.json`. Configure during `/gsd:new-project` or update later with `/gsd:settings`. For the full config schema, workflow toggles, git branching options, and per-agent model breakdown, see the [User Guide](docs/USER-GUIDE.md#configuration-reference).

### Core Settings

| Setting | Options | Default | What it controls |
|---------|---------|---------|------------------|
| `mode` | `yolo`, `interactive` | `interactive` | Auto-approve vs confirm at each step |
| `granularity` | `coarse`, `standard`, `fine` | `standard` | Phase granularity — how finely scope is sliced (phases × plans) |

### Model Profiles

Control which Claude model each agent uses. Balance quality vs token spend.

| Profile | Planning | Execution | Verification |
|---------|----------|-----------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (default) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

Switch profiles:
```
/gsd:set-profile budget
```

Use `inherit` to follow the current runtime model selection (for example OpenCode `/model`).

Or configure via `/gsd:settings`.

### Workflow Agents

These spawn additional agents during planning/execution. They improve quality but add tokens and time.

| Setting | Default | What it does |
|---------|---------|--------------|
| `workflow.research` | `true` | Researches domain before planning each phase |
| `workflow.plan_check` | `true` | Verifies plans achieve phase goals before execution |
| `workflow.verifier` | `true` | Confirms must-haves were delivered after execution |
| `workflow.auto_advance` | `false` | Auto-chain discuss → plan → execute without stopping |

Use `/gsd:settings` to toggle these, or override per-invocation:
- `/gsd:plan-phase --skip-research`
- `/gsd:plan-phase --skip-verify`

### Execution

| Setting | Default | What it controls |
|---------|---------|------------------|
| `parallelization.enabled` | `true` | Run independent plans simultaneously |
| `planning.commit_docs` | `true` | Track `.planning/` in git |
| `hooks.context_warnings` | `true` | Show context window usage warnings |

### Git Branching

Control how GSD handles branches during execution.

| Setting | Options | Default | What it does |
|---------|---------|---------|--------------|
| `git.branching_strategy` | `none`, `phase`, `milestone` | `none` | Branch creation strategy |
| `git.phase_branch_template` | string | `gsd/phase-{phase}-{slug}` | Template for phase branches |
| `git.milestone_branch_template` | string | `gsd/{milestone}-{slug}` | Template for milestone branches |

**Strategies:**
- **`none`** — Commits to current branch (default GSD behavior)
- **`phase`** — Creates a branch per phase, merges at phase completion
- **`milestone`** — Creates one branch for entire milestone, merges at completion

At milestone completion, GSD offers squash merge (recommended) or merge with history.

---

## Security

### Protecting Sensitive Files

GSD's codebase mapping and analysis commands read files to understand your project. **Protect files containing secrets** by adding them to Claude Code's deny list:

1. Open Claude Code settings (`.claude/settings.json` or global)
2. Add sensitive file patterns to the deny list:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

This prevents Claude from reading these files entirely, regardless of what commands you run.

> [!IMPORTANT]
> GSD includes built-in protections against committing secrets, but defense-in-depth is best practice. Deny read access to sensitive files as a first line of defense.

---

## Troubleshooting

**Commands not found after install?**
- Restart your runtime to reload commands/skills
- Verify files exist in `~/.claude/commands/gsd/` (global) or `./.claude/commands/gsd/` (local)
- For Codex, verify skills exist in `~/.codex/skills/gsd-*/SKILL.md` (global) or `./.codex/skills/gsd-*/SKILL.md` (local)

**Commands not working as expected?**
- Run `/gsd:help` to verify installation
- Re-run `node bin/install.js --claude --global` from the repo directory to reinstall

**Updating to the latest version?**
```bash
cd get-stuff-done && git pull && node bin/install.js --claude --global
```

**Using Docker or containerized environments?**

If file reads fail with tilde paths (`~/.claude/...`), set `CLAUDE_CONFIG_DIR` before installing:
```bash
CLAUDE_CONFIG_DIR=/home/youruser/.claude node bin/install.js --claude --global
```

### Uninstalling

```bash
node bin/install.js --claude --global --uninstall
node bin/install.js --claude --local --uninstall
```

This removes all GSD commands, agents, hooks, and settings while preserving your other configurations.

---

## Recent Updates

**Phase 42: Planning Server Security Hardening — Complete**

The planning-server has been upgraded with comprehensive security controls:

- Localhost-only binding with environment override
- Mandatory Bearer token authentication (optional insecure mode)
- Fine-grained rate limiting (per-endpoint) and concurrency caps
- Request validation (null bytes, path length, file size)
- AST parser auto-initialization with degraded mode signaling
- Security headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options) on all responses
- Explicit blocking of `.planning/` directory via `/v1/read`
- Enhanced `/health` with AST status; new `/metrics` endpoint (Prometheus format)
- Comprehensive audit logging for all security events
- Integration test suite (`.planning/tests/planning-server-integration.test.cjs`) with 13 passing tests

Configuration reference and verification details are available in `.planning/phases/42-planning-server-security-hardening/SUMMARY.md`.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Claude Code is powerful. GSD makes it reliable.**

</div>
