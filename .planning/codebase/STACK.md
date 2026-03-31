# Technology Stack

**Analysis Date:** 2026-03-25

## Languages

**Primary:**
- JavaScript (CommonJS) - Core application logic using .cjs modules
- Shell scripts - CLI installation and hooks

**Secondary:**
- TypeScript definitions - None detected (pure JavaScript)

## Runtime

**Environment:**
- Node.js >= 16.7.0 (specified in package.json `engines`)

**Package Manager:**
- npm (package.json, package-lock.json present)
- Lockfile: Present (package-lock.json)

## Frameworks

**Core:**
- No traditional web framework used - this is a CLI tool
- Custom command framework in `get-stuff-done/bin/gsd-tools.cjs`
- HTTP servers: Built-in `http`/`https` Node modules for internal APIs

**Testing:**
- Node.js built-in test runner (`node --test`)
- Assertions: Built-in Node test assertions

**Build/Dev:**
- esbuild (^0.24.0) - Hooks compilation
- c8 (^11.0.0) - Code coverage
- tree-sitter (^0.26.7) - AST parsing for JavaScript/TypeScript
- Custom test runner: `scripts/run-tests.cjs`

## Key Dependencies

**Critical:**
- `amqplib` (^0.10.9) - RabbitMQ client for event messaging (GSD Pulse)
- `pg` (^8.20.0) - PostgreSQL client for persistent memory storage
- `zod` (^4.3.6) - Runtime schema validation for snapshots and state

**Infrastructure:**
- `web-tree-sitter` (^0.26.7) - Code structure analysis for context normalization
- Native modules: `tree-sitter-javascript`, `tree-sitter-typescript`

## Configuration

**Environment:**
The system uses environment variables extensively. Key ones:
- Database: `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `GSD_DB_NAME`, `GSD_MEMORY_MODE`
- Messaging: `AMQP_URL`
- External services: `FIRECRAWL_API_URL`, `FIRECRAWL_API_KEY`, `FIRECRAWL_RATE_LIMIT_RPM`, `PLANE_API_URL`, `PLANE_API_KEY`, `PLANE_PROJECT_ID`, `PLANE_RATE_LIMIT_RPM`, `GSD_SEARXNG_URL`
- Planning server: `GSD_PLANNING_URL`, `GSD_PLANNING_PORT`, `GSD_PLANNING_HOST`, `PLANNING_SERVER_TOKEN`
- Logging/debug: `GSD_LOG_LEVEL`, `GSD_DEBUG`, `GSD_TEST_MODE`, `GSD_CODEX_SANDBOX_MODE`
- Agent configs: `GEMINI_CONFIG_DIR`, `OPENCODE_CONFIG_DIR`, `CODEX_HOME`, `COPILOT_CONFIG_DIR`, `ANTIGRAVITY_CONFIG_DIR`, `CLAUDE_CONFIG_DIR`
- Search: `BRAVE_API_KEY`
- Home: `GSD_HOME`

**Build:**
- No TypeScript compilation needed (pure JavaScript)
- Hooks built via `npm run build:hooks` using esbuild
- Script: `scripts/build-hooks.js`

**Application Config:**
- User config: `.planning/config.json` (created by `ensureConfigFile()` in `get-stuff-done/bin/lib/config.cjs`)
- Global defaults: `~/.gsd/defaults.json`
- Project state: `.planning/STATE.md` (frontmatter-based YAML/JSON)

## Platform Requirements

**Development:**
- Node.js 16.7+
- Git (for commit operations)
- Optional local services: PostgreSQL 12+, RabbitMQ, Firecrawl, Plane, SearXNG for full functionality

**Production:**
- Same Node.js requirement
- Runs as CLI within developer's environment (not standalone server)
- All external services are optional with fallback modes:
  - PostgreSQL → SQLite fallback when `GSD_MEMORY_MODE=sqlite`
  - RabbitMQ operates in disconnected mode when unavailable
  - Firecrawl/Plane/SearXNG fail fast with degraded mode status

---

*Stack analysis: 2026-03-25*
