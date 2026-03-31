# Architecture

**Analysis Date:** 2026-03-25

## Pattern Overview

**Overall:** Meta-orchestration system with Command-Agent-Workflow pattern

**Key Characteristics:**
- Phase-based planning with numbered iterative phases
- Schema-first validation using Zod throughout
- Authority-enforced file modifications with non-bypassable boundaries
- Event-driven architecture via RabbitMQ broker (optional)
- Modular CommonJS library with clear separation of concerns
- Context determinism via Firecrawl unified context layer
- Multi-provider AI adapter pattern (Claude, OpenAI, Gemini, Kimi)

## Layers

### CLI/Entry Layer

**Purpose:** User-facing command interface and installation

**Location:** `/home/bamn/get-stuff-done/bin/`, `/home/bamn/get-stuff-done/commands/gsd/`

**Contains:**
- `bin/install.js` - Installation and fork configuration for multiple AI platforms
- `bin/gsd-shell.js` - Security shell interceptor with path sandboxing
- `commands/gsd/*.md` - Command specifications (plan-phase, execute-phase, etc.)

**Depends on:** Core library (`get-stuff-done/bin/lib/`)

**Used by:** End users and orchestrator scripts

### Agent Specifications Layer

**Purpose:** Declarative agent role definitions and tool permissions

**Location:** `/home/bamn/get-stuff-done/agents/`

**Contains:**
- `gsd-planner.md` - Phase planning agent
- `gsd-executor.md` - Task execution agent
- `gsd-verifier.md` - Workflow verification agent
- `gsd-codebase-mapper.md` - Codebase analysis agent
- 15+ specialized agent definitions

**Depends on:** Workflow definitions for process

**Used by:** Command orchestrators to spawn appropriate agents

### Workflow Definitions Layer

**Purpose:** Step-by-step process documentation for each workflow

**Location:** `/home/bamn/get-stuff-done/get-stuff-done/workflows/`

**Contains:**
- `plan-phase.md` - Research → Plan → Verify loop
- `execute-phase.md` - Wave-based parallel execution
- `execute-plan.md` - Task-level checkpoint lifecycle
- `verify-work.md` - Contract validation
- `discuss-phase.md` - Narrative clarification
- `autonomous.md` - Autonomous mode flow
- `lib/` - Supporting workflow utilities

**Pattern:** Each workflow defines pre-flight context requirements, gates, and exit criteria

**Used by:** Agents as execution playbooks

### Core Library Layer

**Purpose:** Shared functionality and domain modules

**Location:** `/home/bamn/get-stuff-done/get-stuff-done/bin/lib/`

**Structure:**

| Module | Lines | Purpose |
|--------|-------|---------|
| `verify.cjs` | 2862 | Integrity verification, checkpoint validation, schema enforcement |
| `second-brain.cjs` | 1280 | Postgres/SQLite memory storage with project isolation |
| `commands.cjs` | 1173 | CLI command dispatcher (30+ commands) |
| `state.cjs` | 1016 | STATE.md progression tracking and updater |
| `profile-output.cjs` | 931 | User profiling and model selection |
| `planning-server.cjs` | 914 | HTTP API server for context and operations |
| `phase.cjs` | 911 | Phase CRUD, listing, navigation |
| `init.cjs` | 904 | Project initialization and bootstrap |
| `core.cjs` | 877 | Logging, path helpers, safe operations |

**Key Subsystems:**
- `context.cjs` - Per-workflow snapshot builder with Zod schemas
- `context-store.cjs` - Canonical artifact persistence
- `context-artifact.cjs` - Artifact schema validation
- `artifact-schema.cjs` - Checkpoint, response, summary schemas
- `itl.cjs` - ITL command surface (narrative interpretation)
- `itl-adapters.cjs` - Multi-provider AI adapter registry
- `itl-extract.cjs` - Deterministic heuristic extractor
- `itl-ambiguity.cjs` - Ambiguity detection logic
- `policy.cjs` - Prompt gate policy resolution
- `gate.cjs` - Hard enforcement with pending/released artifacts
- `authority.cjs` - HMAC-SHA256 signature generation/verification
- `sandbox.cjs` - Path access control matrix
- `broker.cjs` - RabbitMQ pulse event publisher
- `firecrawl-client.cjs` - Unified context layer client
- `plane-client.cjs` - Plane issue tracker integration
- `roadmap-plane-sync.cjs` - Bidirectional Plane sync
- `ast-parser.cjs` - Tree-sitter code analysis
- `config.cjs` - Config CRUD with defaults
- `audit.cjs` - Audit trail capture and write
- `model-profiles.cjs` - AI model profile definitions
- `template.cjs` - Template rendering
- `frontmatter.cjs` - YAML frontmatter extraction
- `roadmap.cjs` - ROADMAP.md operations

**Design:** Conservative functional composition with error-safe wrappers (`safeReadFile`, `safeWriteFile`, `safeGit`)

### ITL Package Layer

**Purpose:** Standalone narrative interpretation package

**Location:** `/home/bamn/get-stuff-done/packages/itl/`

**Contains:**
- `index.d.ts` - TypeScript definitions
- `index.cjs` - Implementation with Zod schemas

**Exports:**
- `interpret_narrative()` / `interpretNarrative()` - Full pipeline
- `build_provider_request()` / `buildProviderRequest()` - Request builder
- `get_supported_provers()` / `getSupportedProviders()` - Provider list
- `schemas` - Raw Zod schema objects

**Supported providers:** internal, claude, openai, gemini, kimi

**Schema domains:**
- `interpretation` - Goals, constraints, preferences, anti-requirements, success criteria, risks, unknowns, assumptions
- `ambiguity` - Ambiguity detection with severity and findings
- `lockability` - Invariant lockability analysis (guidance-only vs lockable)

**Used by:** discuss-phase, verify-initialization, and any narrative intake

### Persistence Layer

**Purpose:** State and context storage

**Location:** `.planning/` (project root)

**Structure:**

```
.planning/
├── PROJECT.md              # Project metadata and instructions
├── REQUIREMENTS.md         # Functional requirements
├── ROADMAP.md              # Milestone and phase definitions (frontmatter)
├── STATE.md                # Current execution state (frontmatter + metrics)
├── config.json             # Configuration (mode, granularity, gates, workflow)
├── phases/                 # Numbered phase directories (01, 02, ...)
│   └── <phase>-<name>/
│       ├── <phase>-<num>-PLAN.md       # Executable plan with tasks
│       ├── <phase>-<num>-SUMMARY.md    # Execution summary
│       ├── <phase>-<num>-RESEARCH.md   # Research notes (optional)
│       ├── <phase>-<num>-VERIFICATION.md # Verification results
│       ├── <phase>-<num>-VALIDATION.md  # Gate validation
│       └── CHECKPOINT.md               # Paused state (optional)
├── milestones/             # Completed milestone archives
├── context/
│   └── artifacts/          # Canonical context artifacts (JSON)
│       └── <uuid>.json
├── gates/                  # Gate enforcement artifacts
│   ├── <key>-pending.json
│   └── <key>-released.json
├── itl/                    # ITL audit logs
│   ├── <date>-<hash>.json
│   └── index.json
├── todos/                  # Todo management
│   ├── pending/
│   └── completed/
└── tests/                  # Generated test files

```

**State format (STATE.md):**

```markdown
---
gsd_state_version: 1.0
milestone: v0.2
status: unknown|running|paused|complete
stopped_at: Completed 47-02-PLAN.md
last_updated: "2026-03-25T23:21:00.991Z"
progress:
  total_phases: 22
  completed_phases: 16
  total_plans: 36
  completed_plans: 36
---
# Project State
...
```

**Artifact schema (context-schema.cjs):**
- `id: uuid`
- `source_uri: string` (deterministic identity)
- `content_hash: string` (SHA-256)
- `content_normalized: string`
- `metadata: object`
- `created_at, updated_at`

**Memory (second-brain):**
- Primary: Postgres with `gsd_local_brain` schema
- Fallback: SQLite (`node:sqlite` module)
- Tables: `project_identity`, `firecrawl_audit`, `itl_interpretations`, etc.
- Project isolation via hash-derived database name

### Integration Layer

**Purpose:** External service connectivity

**Modules:**
- `firecrawl-client.cjs` - POST `/v1/context/crawl` unifier
- `plane-client.cjs` - Plane REST API (issues, comments, custom fields)
- `broker.cjs` - RabbitMQ topic exchange `gsd.pulse`
- `audit.cjs` - File-based audit trail (when SecondBrain unavailable)

**Configuration:** Environment variables
- `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`
- `AMQP_URL` (default `amqp://localhost`)
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `GSD_MEMORY_MODE` (sqlite to force fallback)
- `PLANNING_SERVER_TOKEN`, `PLANNING_SERVER_AUTH_MODE`
- `GSD_HOME` (override home directory)

## Data Flow

### Standard Phase Execution

1. **User** runs `gsd:plan-phase <n>` (or auto-detects next)
2. **Orchestrator** (command handler in `commands.cjs`) loads STATE.md and ROADMAP.md via Firecrawl context
3. **Orchestrator** checks gates (`gate enforce --key gates.confirm_roadmap`, etc.)
4. **Orchestrator** spawns `gsd-planner` agent with research (if needed) and PLAN template
5. **Planner** reads project artifacts, creates `<phase>-<num>-PLAN.md` with must-haves and tasks
6. **Orchestrator** runs `gsd-plan-checker` to validate plan quality
7. **Iterate** until plan passes checker or max iterations
8. **User** reviews and confirms (or requests revision)
9. **Orchestrator** runs `gsd:execute-phase <phase>`
10. **Executor** loads phase plans, analyzes dependencies, groups into waves
11. **Executor** spawns subagents per task in wave (parallel if allowed)
12. **Each subagent** reads workflow (`execute-plan.md`), builds context snapshot
13. **Subagent** executes tasks with checkpoints (`CHECKPOINT.md`), calls `complete-task`
14. **complete-task** verifies authority, updates CHECKPOINT.md, commits to git, updates STATE.md
15. **After each wave**, verification runs (`gsd-verifier` validates contracts)
16. **On phase completion**, `<phase>-<num>-SUMMARY.md` is generated
17. **STATE.md** updated with new progress metrics
18. **Next phase** begins (or milestone completed)

### Context Snapshot Building

**Trigger:** Any workflow start

**Process (`context.cjs`):**
1. Load schema for workflow from `SCHEMAS` registry
2. Read STATE.md, phase/plan files, ROADMAP.md, config
3. Parse git state (`git rev-parse HEAD`, `git branch --show-current`, `git status --porcelain`)
4. Extract frontmatter from relevant files
5. Validate entire snapshot against Zod schema
6. Write to `.planning/context/artifacts/<workflow>-<hash>.json`
7. Return artifact ID to caller

**Consumers:** Agents inject `@<artifact-id>` into initial context

### Authority Enforcement

**Every file modification must:**
1. Generate HMAC-SHA256 signature: `HMAC('gsd:phase:plan:wave', content)`
2. Append envelope: `// GSD-AUTHORITY: <phase>-<plan>-<wave>:<signature>` (or `<!-- ... -->` for markdown)
3. Call `complete-task` which:
   - Verifies file was modified within allowed phase/plan/wave
   - Validates signature matches content
   - Commits to git with structured message
   - Updates CHECKPOINT.md or SUMMARY.md as appropriate
   - Writes audit entry

**Verification:** `verify integrity` command checks all modified files have valid envelopes

### Gate Enforcement

**Gates** prevent unauthorized workflow progression:

- `gates.confirm_project` - Project initialization confirmed
- `gates.confirm_phases` - Phase list confirmed
- `gates.confirm_roadmap` - Roadmap approved
- `gates.confirm_breakdown` - Task breakdown approved
- `gates.issues_review` - External issues reviewed
- `gates.confirm_transition` - Milestone transition approved
- `gates.confirm_milestone_scope` - Scope confirmed

**Mechanism (`gate.cjs`):**
- `gate enforce --key <key>` - Check policy, write `-pending.json` if blocked, exit 1
- `gate release --key <key>` - Acknowledge, write `-released.json`, exit 0
- Orchestrators use `if ! gate enforce; then gate release; fi` pattern

**Policy source:** `config.json` + environment overrides

## Key Abstractions

### Phase

**Purpose:** Time-boxed work iteration with deliverables

**Representation:**
- Directory: `.planning/phases/<phase-id>-<slug>/`
- Numbering: integers or decimals (1, 2, 2.5, 3) sorted numerically
- Files: PLAN.md, SUMMARY.md, RESEARCH.md, VERIFICATION.md, CHECKPOINT.md

**Lifecycle:**
1. Research (optional) → PLAN.md created
- Validate → VALIDATION.md recorded
- Execute → Tasks completed, SUMMARY.md written
- Verify → VERIFICATION.md recorded

### Plan

**Purpose:** Executable prompt with atomic tasks

**Format (PLAN.md frontmatter):**

```yaml
---
phase: 48
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - path/to/file.js
autonomous: true
requirements:
  - PLANE-VISIBILITY-03
must_haves:
  truths:
    - "Checkpoint comments appear on Plane issues"
  artifacts:
    - path: "tests/foo.test.cjs"
      provides: "Unit tests for X"
      contains: "describe('X', ...)"
  key_links:
    - from: "module:function"
      to: "module:function"
      via: "require and call"
      pattern: "regex"
---
<objective>...
<execution_context>@file references...
<context>Files to read...
<tasks>
<task type="auto">...</task>
<task type="read">...</task>
</tasks>
```

**Contract:** Plans must be executable without interpretation; tasks reference specific files/functions

### Checkpoint

**Purpose:** Pause point for human decision

**Location:** `.planning/phases/<phase>/CHECKPOINT.md`

**Frontmatter schema (`checkpointArtifactSchema`):**
- `status: pending | awaiting-response | resolved`
- `type: string`
- `why_blocked: string` (cannot be vague like "waiting for user input")
- `what_is_uncertain: string`
- `choices: string` (bracketed list or "none")
- `allow_freeform: boolean | "true" | "false"`
- `resume_condition: string`

**Workflow:** Agent hits gate → writes CHECKPOINT.md → exits 13 (blocked) → User reviews → `gate release` → Resume

### Wave

**Purpose:** Parallel execution group with dependency boundaries

**Assignment:** Tasks in PLAN.md include `wave: <number>`; executor groups by wave, runs all in wave concurrently (subject to `parallelization` config), waits for completion before next wave

## Entry Points

### User-facing Commands

**Installation:**
```bash
node bin/install.js --claude --global   # Install for Claude Code
node bin/install.js --codex             # Install for Codex CLI
node bin/install.js --gemini            # Install for Gemini CLI
```

**Primary commands (defined in commands/gsd/*.md):**
- `/gsd:plan-phase` - Create phase plan
- `/gsd:execute-phase` - Execute all plans in phase
- `/gsd:execute-plan` - Execute specific plan
- `/gsd:verify-work` - Validate completed work
- `/gsd:discuss-phase` - Clarify narrative
- `/gsd:complete-milestone` - Finalize milestone
- `/gsd:map-codebase` - Analyze codebase (this agent)

**Standalone utilities (commands.cjs):**
- `gsd-tools phase list` - List phases
- `gsd-tools state get <field>` - Read STATE.md field
- `gsd-tools gate enforce --key <key>` - Enforce gate
- `gsd-tools context build --workflow <name>` - Build snapshot
- `gsd-tools verify integrity` - Check all authority signatures
- 30+ other utilities

### Planning Server

**Endpoint:** `http://127.0.0.1:3011` (configurable)

**Routes:**
- `GET /health` - Health check with degraded mode flag
- `POST /v1/context/crawl` - Unified context fetch (Firecrawl integration)
- `GET /v1/state` - Current STATE.md
- `GET /v1/phases` - Phase listing
- `POST /v1/audit` - Record audit entry

**Security:**
- Bearer token: `PLANNING_SERVER_TOKEN`
- Auth mode: `mandatory` (default), `disabled`, `insecure_local`
- Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`

**Concurrency limits:**
- `PLANNING_SERVER_MAX_CONCURRENT_REQUESTS` (default 16)
- `PLANNING_SERVER_MAX_CONCURRENT_EXTRACTS` (default 4)
- Request size limit: `PLANNING_SERVER_MAX_FILE_BYTES` (default 5MB)

## Error Handling

**Strategy:** Fail-fast with structured exit codes and audit capture

**Exit codes:**
- `0` - Success
- `1` - General error
- `13` - Path blocked by sandbox / gate enforced

**Error capture:** When `GSD_CAPTURE_ERROR_CONTEXT=true`, errors trigger `audit.cjs:captureErrorContext()` with stack, env, and command

**Logging:** Colored stderr via `core.cjs:log(level, message, meta)` with levels debug/info/warn/error. Controlled by `GSD_LOG_LEVEL`.

**Recovery:** Checkpoint mechanism allows safe pause/resume; gate release acknowledges intentional bypass

## Cross-Cutting Concerns

### Logging

**Framework:** Custom colored stderr logger in `core.cjs`

**Levels:** debug, info, warn, error

**Configuration:** `GSD_LOG_LEVEL` environment variable

**Pattern:** All modules import `{ logDebug, logInfo, logWarn, logError }` from core

### Validation

**Framework:** Zod (v4)

**Schemas located:**
- `artifact-schema.cjs` - Checkpoint, response, summary
- `itl-schema.cjs` - Interpretation, ambiguity, lockability
- `context-schema.cjs` - Context artifact
- Per-workflow in `context.cjs:SCHEMAS`

**Enforcement:** All file reads/writes, API responses, command outputs must validate before exit

### Authentication

**Planning Server:** Bearer token (optional, defaults to mandatory)

**SecondBrain:** Postgres auth via standard PG env vars

**Plane:** API key in header (`x-api-key: PLANE_API_KEY`)

**No authentication** for local filesystem operations (relies on OS permissions)

### Observability

**Audit trail:** `audit.cjs` writes JSON lines to `.planning/audit/` or SecondBrain table `firecrawl_audit`

**Error context:** Captures stack, environment, command when `GSD_CAPTURE_ERROR_CONTEXT=true`

**Degraded mode:** Planning Server sets `X-Planning-Server-Degraded: ast_unavailable` when Tree-Sitter not initialized

**Metrics:** STATE.md tracks velocity (avg plan duration, total execution time)

---

*Architecture analysis: 2026-03-25*
