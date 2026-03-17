# Codebase Structure

**Analysis Date:** 2025-01-24

## Directory Layout

```
[project-root]/
├── agents/             # Agent definitions (prompts + tool permissions)
├── bin/                # Installer script
├── commands/           # Slash command definitions (user entry points)
├── docs/               # System documentation
├── get-shit-done/      # Core logic and orchestration
│   ├── bin/            # CLI tools (gsd-tools.cjs) and library modules
│   ├── references/     # Shared knowledge and pattern docs
│   ├── templates/      # Artifact and phase templates
│   └── workflows/      # Orchestration process definitions
├── hooks/              # Runtime integration hooks (statusline, context monitor)
├── scripts/            # Build and testing scripts
└── tests/              # Test suite (commands, core logic, workflows)
```

## Directory Purposes

**agents/:**
- Purpose: Defines specialized AI roles.
- Contains: Markdown files with frontmatter.
- Key files: `gsd-planner.md`, `gsd-executor.md`, `gsd-roadmapper.md`.

**commands/gsd/:**
- Purpose: User-facing slash command definitions.
- Contains: Markdown files that reference workflows.
- Key files: `new-project.md`, `plan-phase.md`, `execute-phase.md`.

**get-shit-done/bin/:**
- Purpose: CLI utility and core business logic.
- Contains: `gsd-tools.cjs` (main CLI) and `lib/*.cjs` (modules).
- Key files: `lib/state.cjs`, `lib/phase.cjs`, `lib/config.cjs`.

**get-shit-done/workflows/:**
- Purpose: Orchestration logic for multi-agent processes.
- Contains: Markdown files defining the sequence of steps.
- Key files: `new-project.md`, `plan-phase.md`, `execute-phase.md`.

**get-shit-done/references/:**
- Purpose: Knowledge base for agents and workflows.
- Contains: Guidelines on git, TDD, questioning, etc.
- Key files: `model-profiles.md`, `checkpoints.md`, `git-integration.md`.

**get-shit-done/templates/:**
- Purpose: Scaffolding for project artifacts.
- Contains: Markdown templates with variables.
- Key files: `project.md`, `requirements.md`, `roadmap.md`.

**hooks/:**
- Purpose: Runtime integration with host AI environments.
- Contains: JavaScript hooks for status line and context monitoring.
- Key files: `gsd-statusline.js`, `gsd-context-monitor.js`.

## Key File Locations

**Entry Points:**
- `bin/install.js`: The primary installation script.
- `commands/gsd/`: Directory containing all user-facing command prompts.

**Configuration:**
- `get-shit-done/bin/lib/config.cjs`: Logic for managing `config.json`.
- `get-shit-done/references/planning-config.md`: Reference for config options.

**Core Logic:**
- `get-shit-done/bin/gsd-tools.cjs`: Main entry point for CLI utility.
- `get-shit-done/bin/lib/*.cjs`: Modular core logic (state, phase, roadmap, etc.).

**Testing:**
- `tests/`: Comprehensive suite for testing CLI logic and command workflows.

## Naming Conventions

**Files:**
- Commands: `kebab-case.md` (e.g., `new-project.md`).
- Workflows: `kebab-case.md` (e.g., `execute-phase.md`).
- Library Modules: `kebab-case.cjs` (e.g., `model-profiles.cjs`).
- Agents: `gsd-role.md` (e.g., `gsd-verifier.md`).

**Directories:**
- Plural nouns: `agents/`, `commands/`, `tests/`.
- Project artifacts: `.planning/` (hidden by default).

## Where to Add New Code

**New Command:**
1. Define command in `commands/gsd/[command-name].md`.
2. Map to a workflow in `get-shit-done/workflows/[command-name].md` (or reuse existing).
3. Update `docs/COMMANDS.md` (if applicable).

**New Workflow Step:**
1. Modify the relevant workflow in `get-shit-done/workflows/*.md`.
2. Add necessary CLI logic to `get-shit-done/bin/lib/*.cjs` if current tools are insufficient.

**New Agent:**
1. Create `agents/gsd-[role].md`.
2. Add the agent to `get-shit-done/references/model-profiles.md`.
3. Reference the agent in the relevant workflow.

**New CLI Utility:**
1. Add function to existing module in `get-shit-done/bin/lib/` or create a new one.
2. Expose the command via `get-shit-done/bin/gsd-tools.cjs`.

## Special Directories

**.planning/:**
- Purpose: Project-specific state, research, plans, and summaries.
- Generated: Yes (during project initialization and phase planning).
- Committed: Optional (depends on `config.json` setting `commit_docs`).

**gsd-local-patches/:**
- Purpose: Backups of locally modified GSD files created during `/gsd:update`.
- Generated: Yes (by `bin/install.js`).
- Committed: Recommended (to preserve local changes).

---

*Structure analysis: 2025-01-24*
