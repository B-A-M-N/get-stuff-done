# Codebase Structure

**Analysis Date:** 2026-03-25

## Directory Layout

```
/home/bamn/get-stuff-done/
├── agents/                          # Agent specification markdown files (15+ agents)
│   ├── gsd-planner.md              # Planning agent with task breakdown logic
│   ├── gsd-executor.md             # Execution agent with checkpoint handling
│   ├── gsd-verifier.md             # Verification agent with contract checks
│   ├── gsd-codebase-mapper.md      # Codebase analysis agent (this spec)
│   ├── gsd-debugger.md             # Debugging and diagnostics
│   ├── gsd-roadmapper.md           # Roadmap and milestone planning
│   └── [13 other agent specs]      # Specialized agents by domain
│
├── bin/                            # Installation entry point
│   └── install.js                  # Multi-platform installer (Claude, Codex, Gemini)
│
├── commands/                       # Command specification files
│   └── gsd/                        # All GSD commands as markdown workflows
│       ├── plan-phase.md           # Create phase plan with research/verify loop
│       ├── execute-phase.md        # Execute all phase plans in waves
│       ├── execute-plan.md         # Execute specific plan with checkpoints
│       ├── verify-work.md          # Validate completed work against contracts
│       ├── discuss-phase.md        # Narrative clarification flow
│       ├── complete-milestone.md   # Milestone finalization
│       ├── map-codebase.md         # Codebase analysis (this workflow)
│       ├── new-project.md          # Project initialization
│       ├── quick.md                # Rapid execution shortcut
│       ├── help.md                 # Help and documentation
│       └── [20+ other commands]    # Task-specific workflows
│
├── get-stuff-done/                 # Main source tree (CommonJS)
│   ├── bin/                        # Executable tools and library modules
│   │   ├── gsd-shell.js            # Security shell interceptor (EXE)
│   │   ├── gsd-tools.cjs           # Main CLI dispatcher (EXE)
│   │   └── lib/                    # Core library modules (~40 modules)
│   │       ├── core.cjs            # Shared utilities (log, output, safe ops)
│   │       ├── commands.cjs        # Command implementations (30+ commands)
│   │       ├── phase.cjs           # Phase CRUD and navigation
│   │       ├── state.cjs           # STATE.md management
│   │       ├── init.cjs            # Project bootstrap
│   │       ├── config.cjs          # Config CRUD with defaults
│   │       ├── context.cjs         # Snapshot builder with Zod schemas
│   │       ├── context-store.cjs   # Artifact persistence
│   │       ├── context-artifact.cjs # Artifact validation
│   │       ├── artifact-schema.cjs  # Checkpoint, response, summary schemas
│   │       ├── itl.cjs             # ITL command surface
│   │       ├── itl-adapters.cjs    # AI provider adapter registry
│   │       ├── itl-extract.cjs     # Heuristic narrative extractor
│   │       ├── itl-ambiguity.cjs   # Ambiguity detection
│   │       ├── itl-schema.cjs      # ITL Zod schemas
│   │       ├── itl-summary.cjs     # Summary renderer
│   │       ├── itl-audit.cjs       # Audit log access
│   │       ├── authority.cjs       # HMAC-SHA256 signature enforcement
│   │       ├── sandbox.cjs         # Path access control
│   │       ├── gate.cjs            # Gate enforcement (pending/released)
│   │       ├── policy.cjs          # Prompt policy resolution
│   │       ├── broker.cjs          # RabbitMQ publisher/subscriber
│   │       ├── second-brain.cjs    # Postgres/SQLite memory layer
│   │       ├── verify.cjs          # Verification engine (largest module)
│   │       ├── planning-server.cjs # HTTP API server
│   │       ├── roadmap.cjs         # ROADMAP.md operations
│   │       ├── roadmap-plane-sync.cjs # Plane integration
│   │       ├── plane-client.cjs    # Plane REST API
│   │       ├── frontmatter.cjs     # YAML frontmatter parser
│   │       ├── ast-parser.cjs      # Tree-sitter code parser
│   │       ├── firecrawl-client.cjs # Unified context client
│   │       ├── audit.cjs           # Audit capture
│   │       ├── profile-pipeline.cjs # User → model mapping
│   │       ├── profile-output.cjs  # Profile rendering
│   │       ├── template.cjs        # Template engine
│   │       ├── model-profiles.cjs  # Model profile definitions
│   │       ├── checkpoint-plane-sync.cjs # Checkpoint → Plane sync
│   │       └── [other modules]     # Utilities and helpers
│   │
│   ├── workflows/                  # Workflow documentation (markdown)
│   │   ├── plan-phase.md           # Orchestrator playbook for planning
│   │   ├── execute-phase.md        # Orchestrator playbook for execution
│   │   ├── execute-plan.md         # Task-level execution steps
│   │   ├── verify-phase.md         # Validation workflow
│   │   ├── discovery-phase.md      # ITL discovery flow
│   │   ├── transition.md           # Milestone transition
│   │   ├── diagnose-issues.md      # Troubleshooting guide
│   │   ├── node-repair.md          # AST repair patterns
│   │   └── lib/                    # Supporting workflow utilities
│   │
│   ├── references/                 # Reference documentation
│   └── templates/                  # Template files for generated artifacts
│
├── packages/                       # Standalone npm-versioned packages
│   └── itl/                        # ITL Interpretation package
│       ├── index.d.ts              # TypeScript definitions
│       └── index.cjs               # Implementation (Zod schemas + logic)
│
├── hooks/                          # Git hook scripts (installed by bin/install.js)
│   ├── gsd-statusline.js          # Status line in prompt
│   ├── gsd-check-update.js        # Update notifier
│   └── gsd-context-monitor.js     # Context change detection
│
├── scripts/                        # Build and utility scripts
│   ├── build-hooks.js             # Compile TypeScript hooks
│   ├── run-tests.cjs              # Test runner
│   └── [other scripts]            # Maintenance tools
│
├── tests/                          # Integration and unit tests
│   ├── *.test.cjs                 # Node.js test runner tests (60+ files)
│   ├── helpers.cjs                # Test utilities (createTempProject, cleanup)
│   └── dostuff.test.cjs           # End-to-end workflow tests
│
├── .planning/                      # Planning state directory (created at runtime)
│   ├── PROJECT.md                 # Project definition and instructions
│   ├── REQUIREMENTS.md            # Requirements specification
│   ├── ROADMAP.md                 # Milestone and phase definitions
│   ├── STATE.md                   # Current execution state (frontmatter)
│   ├── config.json                # Configuration (mode, granularity, gates)
│   │
│   ├── phases/                    # Active phase directories (01, 02, ...)
│   │   ├── 01-foundational-rebrand-fixes/
│   │   ├── 02-itl-core-engine/
│   │   ├── 03-coexistence-safe-install-isolation/
│   │   ├── 04-narrative-first-initialization/
│   │   ├── ...
│   │   ├── 48-plane-checkpoint-sync/
│   │   │   ├── 48-01-PLAN.md     # First plan in phase 48
│   │   │   ├── 48-02-PLAN.md     # Second plan
│   │   │   ├── 48-01-SUMMARY.md  # Plan 1 execution summary
│   │   │   ├── 48-02-SUMMARY.md
│   │   │   ├── 48-RESEARCH.md    # Research notes (optional)
│   │   │   ├── 48-VERIFICATION.md# Verification results
│   │   │   ├── 48-VALIDATION.md  # Gate validation
│   │   │   └── CHECKPOINT.md      # Paused state (if any)
│   │   └── ... (40+ completed phases archived)
│   │
│   ├── milestones/                # Completed milestone archives
│   ├── context/artifacts/         # Canonical context snapshots (JSON)
│   ├── gates/                     # Gate enforcement artifacts
│   │   ├── gates.confirm_roadmap-pending.json
│   │   └── gates.confirm_roadmap-released.json
│   ├── itl/                       # ITL interpretation audit logs
│   ├── todos/                     # Todo management
│   │   ├── pending/
│   │   └── completed/
│   ├── tests/                     # Generated test files
│   ├── codebase/                  # Codebase analysis documents (this dir)
│   │   ├── ARCHITECTURE.md        # This document
│   │   └── STRUCTURE.md           # Directory guide (this document)
│   └── audit/                     # Audit logs and reports
│
├── .claude/                       # Claude Code configuration
│   ├── skills/                    # Skill definitions for agents
│   ├── worktrees/                 # Git worktrees for parallel execution
│   └── ... (Claude-specific)
│
├── .github/                       # GitHub configuration
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
│
├── coverage/                      # NYC coverage reports
│
├── node_modules/                  # npm dependencies
│
├── docs/                          # User documentation
│   ├── ARCHITECTURE-V0.4.0.md    # Historical architecture doc
│   ├── PLANE-INTEGRATION.md      # Plane setup guide
│   └── USER-GUIDE.md              # User-facing documentation
│
├── package.json                   # Project manifest
├── package-lock.json              # Dependency lockfile
├── README.md                      # Project README with installation
├── README.zh-CN.md                # Chinese translation
├── CHANGELOG.md                   # Version history
├── SECURITY.md                    # Security policy
├── MILESTONES.md                  # Milestone definitions
├── ARCHITECTURE-DRIFT-RESPONSE-SUMMARY.md # Drift response document
│
└── [other root files]

```

## Directory Purposes

### `/agents/`
**Purpose:** Declarative agent role specifications in markdown with YAML frontmatter

**Contains:** Agent definitions with name, description, tools, color, role, process, context requirements

**Key files:**
- `gsd-planner.md` - Planning agent that creates PLAN.md files with task breakdown
- `gsd-executor.md` - Execution agent that implements tasks with checkpoints
- `gsd-verifier.md` - Verification agent that validates contracts
- `gsd-codebase-mapper.md` - Architecture analysis agent (this command)

**Pattern:** Each agent spec defines allowed tools, execution context, and objective. Orchestrators read these to configure spawned agents.

**NOT implementation:** Actual agent logic is in orchestration scripts and core library; agents/ only declares capabilities.

### `/commands/gsd/`
**Purpose:** Command workflow specifications

**Contains:** Markdown files defining `/gsd:*` commands with:
- `name:` - Command identifier
- `description:` - User-facing description
- `agent:` - Which agent to spawn (or orchestrator logic)
- `allowed-tools:` - Tools the command can use
- `objective:` - What the command accomplishes
- `execution_context:` - Workflows and references to load
- `context:` - Arguments and flags
- `process:` - Step-by-step orchestration instructions

**Key files:**
- `plan-phase.md` - Creates phase PLAN.md with research and verification loop
- `execute-phase.md` - Runs all plans in phase with wave-based parallelism
- `execute-plan.md` - Single-plan execution with checkpoint lifecycle
- `verify-work.md` - Post-execution validation
- `map-codebase.md` - Codebase analysis (reads /gsd:map-codebase)

**Pattern:** Commands are orchestrators; they spawn agents and coordinate workflows.

### `/get-stuff-done/bin/lib/`
**Purpose:** Core implementation modules (CommonJS)

**Contains:** ~40 library modules implementing all system functionality

**Organization by domain:**

| Domain | Modules |
|--------|---------|
| **CLI** | `commands.cjs`, `core.cjs` |
| **Planning** | `phase.cjs`, `state.cjs`, `roadmap.cjs`, `init.cjs` |
| **Execution** | `verify.cjs`, `audit.cjs`, `next-step.cjs` |
| **Context** | `context.cjs`, `context-store.cjs`, `context-artifact.cjs`, `artifact-schema.cjs` |
| **ITL** | `itl.cjs`, `itl-adapters.cjs`, `itl-extract.cjs`, `itl-ambiguity.cjs`, `itl-schema.cjs`, `itl-summary.cjs`, `itl-audit.cjs` |
| **Enforcement** | `authority.cjs`, `sandbox.cjs`, `gate.cjs`, `policy.cjs` |
| **Integration** | `plane-client.cjs`, `roadmap-plane-sync.cjs`, `firecrawl-client.cjs`, `broker.cjs` |
| **Storage** | `second-brain.cjs`, `config.cjs` |
| **Parsing** | `frontmatter.cjs`, `ast-parser.cjs`, `template.cjs` |
| **Server** | `planning-server.cjs` |
| **Profiles** | `profile-pipeline.cjs`, `profile-output.cjs`, `model-profiles.cjs` |

**Design principles:**
- No circular dependencies (enforced by load order)
- Pure functions where possible; side effects isolated
- All file I/O uses `safeFs` or explicit error handling
- All output uses `output()` or `error()` from core
- Configuration accessed via `loadConfig()` cached singleton

### `/get-stuff-done/workflows/`
**Purpose:** Human-readable orchestrator playbooks

**Contains:** Markdown documents describing step-by-step execution flow for each workflow

**Pattern:** Workflows are read by agents (injected via `execution_context`) and followed as instructions. They define pre-flight gates, context requirements, decision points, and exit criteria.

**Key files:**
- `plan-phase.md` - Orchestrator's guide to planning workflow
- `execute-phase.md` - Orchestrator's guide to execution workflow
- `execute-plan.md` - Task-level execution steps with checkpoint handling
- `verify-phase.md` - Verification workflow and contract checks
- `discovery-phase.md` - ITL discovery flow for narrative interpretation

**NOT code:** These are documentation that agents interpret. Actual logic lives in `commands.cjs` and agent code.

### `/packages/itl/`
**Purpose:** Standalone package for narrative interpretation

**Contains:**
- `index.d.ts` - TypeScript type definitions (83 lines)
- `index.cjs` - Zod schemas and adapter logic (250+ lines)

**Public API:**
- `interpretNarrative(text, contextData?)` - Full interpretation pipeline
- `buildProviderRequest(text, contextData?)` - Build request for AI provider
- `getSupportedProviders()` - List ['internal', 'claude', 'openai', 'gemini', 'kimi']
- `schemas` - Raw Zod schema objects for validation

**Consumers:**
- `get-stuff-done/bin/lib/itl.cjs` - Command surface
- External projects can require this package directly

**Build:** No build step; published as CommonJS with TypeScript definitions

### `/tests/`
**Purpose:** Integration and unit tests

**Contains:** 60+ `.test.cjs` files using Node.js built-in test runner

**Types:**
- **Unit tests:** Test single modules in isolation (e.g., `gate.test.cjs`, `config.test.cjs`)
- **Integration tests:** Test module interactions (e.g., `phase.test.cjs`, `state.test.cjs`)
- **E2E tests:** Test full workflows (e.g., `dostuff.test.cjs`, `workflow-scenario.test.cjs`)
- **Contract tests:** Validate schema contracts (e.g., `artifact-schema.test.cjs`, `checkpoint-contract.test.cjs`)

**Pattern:**
```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { createTempProject, cleanup } = require('./helpers.cjs');
const { loadConfig } = require('../get-stuff-done/bin/lib/config.cjs');

describe('module X', () => {
  test('does Y', () => {
    const result = module.function(input);
    assert.strictEqual(result, expected);
  });
});
```

**Helper:** `tests/helpers.cjs` provides `createTempProject()` with isolated `.planning/` directory

**Runner:** `node scripts/run-tests.cjs` or `npm test`

**Coverage:** `npm run test:coverage` with c8, targeting 100% on ITL and core surfaces

### `.planning/`
**Purpose:** Project-specific state and planning data

**Created by:** `gsd-tools init` or first `plan-phase`

**Key subdirectories:**

**`phases/`** - Active work phase directories
- Naming: `<phase>-<slug>/` (e.g., `48-plane-checkpoint-sync/`)
- Files inside:
  - `<phase>-<num>-PLAN.md` - Executable plan (1-3 tasks per plan)
  - `<phase>-<num>-SUMMARY.md` - Execution results
  - `<phase>-<num>-RESEARCH.md` - Research notes (optional)
  - `<phase>-<num>-VERIFICATION.md` - Verification output
  - `<phase>-<num>-VALIDATION.md` - Gate validation results
  - `CHECKPOINT.md` - Paused state (if checkpointed)

**`context/artifacts/`** - Context snapshot storage
- Files: `<workflow>-<content-hash>.json`
- Validated against `context-schema.cjs`
- Used for deterministic context delivery

**`gates/`** - Gate enforcement artifacts
- `<key>-pending.json` - Written when gate blocks
- `<key>-released.json` - Written when user acknowledges

**`itl/`** - ITL audit logs
- `<timestamp>-<hash>.json` - Each interpretation recorded

**`milestones/`** - Completed milestone archives (moved from phases/ after completion)

**`todos/`** - Todo management
- `pending/` - Active todos (markdown)
- `completed/` - Sorted by completion date

**`tests/`** - Generated test files (rare, for specific workflows)

**`codebase/`** - Codebase analysis documents (created by map-codebase)
- `ARCHITECTURE.md` - This file
- `STRUCTURE.md` - This document

**`audit/`** - Audit logs and reports
- JSON lines from `audit.cjs`

## Key File Locations

### Entry Points
- **Installation:** `bin/install.js`
- **CLI dispatcher:** `get-stuff-done/bin/gsd-tools.cjs` (main entry, 69KB)
- **Shell interceptor:** `get-stuff-done/bin/gsd-shell.js` (path sandbox)
- **Planning Server:** `get-stuff-done/bin/lib/planning-server.cjs` (HTTP on 3011)

### Configuration
- **Project config:** `.planning/config.json` (mode, granularity, gates, workflow flags)
- **Project metadata:** `.planning/PROJECT.md` (instructions, CLAUDE.md reference)
- **Requirements:** `.planning/REQUIREMENTS.md`
- **Roadmap:** `.planning/ROADMAP.md` (frontmatter with milestones)
- **State:** `.planning/STATE.md` (frontmatter with progress)
- **Model profiles:** `get-stuff-done/bin/lib/model-profiles.cjs`

### Core Logic
- **Command dispatch:** `get-stuff-done/bin/lib/commands.cjs` (30+ commands)
- **Phase operations:** `get-stuff-done/bin/lib/phase.cjs`
- **State updates:** `get-stuff-done/bin/lib/state.cjs`
- **Verification:** `get-stuff-done/bin/lib/verify.cjs` (checkpoint validation, summary contracts)
- **Authority:** `get-stuff-done/bin/lib/authority.cjs` (HMAC signatures)
- **Context:** `get-stuff-done/bin/lib/context.cjs` (snapshot builder with schemas)
- **ITL:** `get-stuff-done/bin/lib/itl.cjs` (narrative interpretation command)

### Schemas
- **Artifact schemas:** `get-stuff-done/bin/lib/artifact-schema.cjs` (checkpoint, response, summary)
- **ITL schemas:** `get-stuff-done/bin/lib/itl-schema.cjs` (interpretation, ambiguity, lockability)
- **Context schema:** `get-stuff-done/bin/lib/context-schema.cjs`
- **Workflow schemas:** `get-stuff-done/bin/lib/context.cjs:SCHEMAS` (per-workflow)

### Integrations
- **Firecrawl client:** `get-stuff-done/bin/lib/firecrawl-client.cjs`
- **Plane client:** `get-stuff-done/bin/lib/plane-client.cjs`
- **Plane sync:** `get-stuff-done/bin/lib/roadmap-plane-sync.cjs`
- **RabbitMQ broker:** `get-stuff-done/bin/lib/broker.cjs`
- **SecondBrain (memory):** `get-stuff-done/bin/lib/second-brain.cjs`

## Naming Conventions

### Files
- **Core modules:** Lowercase with hyphens, `.cjs` extension (e.g., `artifact-schema.cjs`, `itl-adapters.cjs`)
- **Commands:** Match command name (e.g., `phase.cjs` → `gsd-tools phase ...`)
- **Workflows:** Kebab-case descriptive names with `.md` (e.g., `plan-phase.md`, `execute-plan.md`)
- **Agents:** Prefix `gsd-`, suffix agent type (e.g., `gsd-planner.md`, `gsd-verifier.md`)
- **Tests:** Match source file with `.test.cjs` (e.g., `commands.test.cjs` tests `commands.cjs`)
- **Phases:** `<phase>-<slug>/` with hyphen before slug (numeric-only directories not used)
- **Plans:** `<phase>-<num>-PLAN.md` (e.g., `48-01-PLAN.md`)
- **Summaries:** `<phase>-<num>-SUMMARY.md`
- **Checkpoints:** `CHECKPOINT.md` (constant name)

### Functions/Variables
- **Exported functions:** `camelCase` (e.g., `cmdPhaseList`, `buildInterpretationResult`)
- **Internal functions:** `camelCase` or `_leadingUnderscore` for private
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `VALID_CONFIG_KEYS`, `LOG_LEVELS`)
- **Classes:** `PascalCase` (e.g., `GsdBroke`, `SecondBrain`)
- **Options objects:** `options` or descriptive (e.g., `contextData`, `providerRequest`)

### Directories
- **Planning:** Kebab-case lowercase (e.g., `context-enrichment`, `runtime-gate-enforcement`)
- **Milestones:** Version-prefixed (e.g., `v0.2.0-MILESTONE-AUDIT.md`)

### Configuration Keys
- **Dot notation with nouns:** `workflow.research`, `gates.confirm_roadmap`, `planning.commit_docs`
- **Booleans:** No negation prefix (use `enable_x: true`, not `disable_x: false`)

## Where to Add New Code

### New Command (gsd:foo-bar)
1. Create specification: `commands/gsd/foo-bar.md`
2. Implement in existing module (e.g., add `cmdFooBar` to `commands.cjs`) OR create new module `lib/foo-bar.cjs`
3. Add to `commands.cjs` dispatcher if new module
4. Add tests: `tests/foo-bar.test.cjs`
5. Document in `workflows/foo-bar.md` if complex orchestration

### New Agent Type (gsd-foo-agent)
1. Create specification: `agents/gsd-foo-agent.md`
2. If new workflow needed, create `workflows/foo-agent.md`
3. Implement orchestration in command or existing module
4. Tests: depends on implementation (unit tests for module, integration tests for flow)

### New Workflow
1. Create documentation: `get-stuff-done/workflows/foo-workflow.md`
2. Add schema to `context.cjs:SCHEMAS['foo-workflow']`
3. Implement orchestrator (command or agent)
4. Tests: `tests/foo-workflow.test.cjs` (integration)

### New Core Library Module
1. Create `get-stuff-done/bin/lib/foo-module.cjs`
2. Follow established patterns: use `core.cjs` utilities (`output`, `error`, `safeReadFile`, `safeWriteFile`)
3. Export functions explicitly (no default export)
4. Add to `commands.cjs` if it's a command module
5. Tests: `tests/foo-module.test.cjs`
6. Consider adding to `.eslintrc` if linting requires (but lint config is minimal)

### New Schema
1. Add to appropriate schema module:
   - General artifacts: `artifact-schema.cjs`
   - ITL: `itl-schema.cjs`
   - Workflow context: `context.cjs:SCHEMAS`
2. Use `z.object({...})` with strict typing
3. Add `parseXxx(input)` function for validation
4. Tests: Validate with positive/negative cases

### New Integration (External Service)
1. Create `get-stuff-done/bin/lib/foo-client.cjs`
2. Use `node-fetch` or native `https` module (no axios/unnecessary deps)
3. Add error handling with clear messages
4. Add configuration keys to `config.cjs:VALID_CONFIG_KEYS`
5. Add environment variable documentation
6. Tests: `tests/foo-client.test.cjs` with mocked responses

### New Phase Directory
1. Create `.planning/phases/<number>-<slug>/`
2. Create `<number>-PLAN.md` (or multiple PLANs numbered)
3. Add `<number>-RESEARCH.md` if research needed
4. Execute via `gsd:execute-phase <number>` or `gsd:execute-plan <number>-<plan>`

### New Test
1. Location: `tests/` matching source pattern
2. Use Node.js built-in `test`, `describe`, `beforeEach`, `afterEach`
3. Import from `../get-stuff-done/bin/lib/...`
4. Use `createTempProject()` from `helpers.cjs` for isolated filesystem
5. Clean up in `afterEach`
6. Assert with `assert` module (no external assertion library)

### New Workflow Utility (supporting docs)
1. Add to `get-stuff-done/workflows/lib/`
2. Reference from parent workflow with `@/path/to/workflow-lib/file.md`
3. Markdown format, reusable across workflows

## Special Directories

### `node_modules/`
**Purpose:** npm dependencies
**Generated:** Yes (by `npm install`)
**Committed:** No
**Key deps:**
- `zod` ^4.3.6 - Schema validation
- `amqplib` ^0.10.9 - RabbitMQ client
- `pg` ^8.20.0 - Postgres client
- `web-tree-sitter` ^0.26.7 - AST parsing
- `c8` ^11.0.0 - Coverage (dev)
- `esbuild` ^0.24.0 - Build (dev)

### `coverage/`
**Purpose:** NYC coverage reports
**Generated:** Yes (by `npm run test:coverage`)
**Committed:** No (gitignored)

### `.claude/`
**Purpose:** Claude Code configuration
**Generated:** By Claude Code
**Committed:** Partially (skills/ might be versioned)

### `.planning/`
**Purpose:** Project-specific runtime state
**Generated:** By GSD commands
**Committed:** Yes (entire directory tracked)
**Note:** Contains sensitive data? Project data only, no secrets (secrets via environment)

---

*Structure analysis: 2026-03-25*
