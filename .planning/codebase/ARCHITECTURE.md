# Architecture

**Analysis Date:** 2025-01-24

## Pattern Overview

**Overall:** Meta-prompting Framework / Multi-Agent Orchestrator

**Key Characteristics:**
- **Fresh Context Per Agent:** Spawns specialized agents with clean context windows to eliminate "context rot."
- **Spec-Driven Development:** Follows a rigorous pipeline of Research → Requirements → Roadmap → Plan → Execute → Verify.
- **File-Based State Management:** All project state and artifacts reside in a `.planning/` directory as human-readable Markdown and JSON, ensuring persistence across session resets.

## Layers

**Command Layer:**
- Purpose: User-facing entry points for the GSD system.
- Location: `commands/gsd/`
- Contains: Markdown files with YAML frontmatter defining slash commands for various runtimes (Claude Code, OpenCode, etc.).
- Depends on: Workflow Layer.
- Used by: End users via AI coding agents.

**Workflow Layer:**
- Purpose: Orchestration logic for complex multi-step processes.
- Location: `get-shit-done/workflows/`
- Contains: Detailed process definitions that load context, spawn agents, manage gates/checkpoints, and update state.
- Depends on: CLI Tools Layer, Agent Layer, Reference Layer.
- Used by: Command Layer.

**Agent Layer:**
- Purpose: Specialized AI roles with focused prompts and tool permissions.
- Location: `agents/`
- Contains: Agent definitions (e.g., `gsd-planner.md`, `gsd-executor.md`) specifying their role, tools, and preferred models.
- Depends on: None (standalone prompts).
- Used by: Workflow Layer (via task/subagent spawning).

**CLI Tools Layer:**
- Purpose: Low-level utility for state parsing, config management, and artifact generation.
- Location: `get-shit-done/bin/`
- Contains: `gsd-tools.cjs` and domain-specific modules in `lib/*.cjs`.
- Depends on: Node.js runtime.
- Used by: Workflow Layer, Installer.

**Reference Layer:**
- Purpose: Shared knowledge and patterns used across agents and workflows.
- Location: `get-shit-done/references/`
- Contains: Documents defining model profiles, verification patterns, git integration, etc.
- Depends on: None.
- Used by: Workflow Layer, Agent Layer.

## Data Flow

**New Project Initialization:**
1. User provides idea via `/gsd:new-project`.
2. **Questioning:** Interactive session to extract project vision.
3. **Research:** 4 parallel agents (Stack, Features, Architecture, Pitfalls) investigate the domain.
4. **Requirements:** Synthesizes research and user input into `REQUIREMENTS.md`.
5. **Roadmap:** `gsd-roadmapper` creates `ROADMAP.md` and initializes `STATE.md`.

**Phase Execution:**
1. **Discuss:** `/gsd:discuss-phase` captures user preferences for a specific phase.
2. **Plan:** `/gsd:plan-phase` spawns a researcher and planner to create `PLAN.md` files.
3. **Execute:** `/gsd:execute-phase` runs executors in parallel "waves" based on plan dependencies.
4. **Verify:** `gsd-verifier` checks completed work against phase goals, producing `VERIFICATION.md`.

**State Management:**
- Handled primarily via `gsd-tools.cjs` which reads and writes to `.planning/STATE.md` and `config.json`.
- Each workflow step typically results in an atomic git commit of the modified artifacts.

## Key Abstractions

**Agents:**
- Purpose: Encapsulated AI personas with specific tool access and role instructions.
- Examples: `agents/gsd-planner.md`, `agents/gsd-executor.md`.
- Pattern: Role-based prompting.

**Workflows:**
- Purpose: Declarative orchestration scripts that define the sequence of actions and agent spawns.
- Examples: `get-shit-done/workflows/new-project.md`, `get-shit-done/workflows/execute-phase.md`.
- Pattern: Step-by-step process flow with built-in validation gates.

**Artifacts:**
- Purpose: Persistent, human-readable records of project state and decisions.
- Examples: `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`.
- Pattern: Markdown-as-database.

## Entry Points

**Installer:**
- Location: `bin/install.js`
- Triggers: User running `npm install` or manual execution.
- Responsibilities: Detects runtime environment, deploys files, transforms agents/commands for specific host AIs (Claude, OpenCode, etc.).

**Slash Commands:**
- Location: `commands/gsd/*.md`
- Triggers: User typing `/gsd:<command>` in an AI coding agent.
- Responsibilities: Bootstraps the corresponding workflow with necessary context and references.

**CLI Utility:**
- Location: `get-shit-done/bin/gsd-tools.cjs`
- Triggers: Invoked by workflows via bash commands.
- Responsibilities: Performs file I/O, state updates, template filling, and config resolution.

## Error Handling

**Strategy:** Fail-fast with clear feedback and recovery instructions.

**Patterns:**
- **Validation Gates:** Workflows check state (e.g., `gsd-tools.cjs init`) before proceeding.
- **Verification Loops:** Plan-checking and work-verification steps can loop up to 3 times to fix identified issues.
- **Atomic Commits:** Artifacts are committed immediately after creation to prevent data loss on context reset.

## Cross-Cutting Concerns

**Logging:** Handled via standard output from `gsd-tools.cjs` and workflow banners.
**Validation:** `get-shit-done/bin/lib/verify.cjs` provides logic for validating plan structure and phase completeness.
**Authentication:** Relies on the host AI agent's environment and permissions (e.g., git credentials).

---

*Architecture analysis: 2025-01-24*
