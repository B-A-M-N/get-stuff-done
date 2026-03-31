# External Integrations

**Analysis Date:** 2026-03-25

## APIs & External Services

**Context & Research:**
- **Firecrawl** - Web scraping and content extraction service
  - Purpose: Unified context layer for all external documentation and internal project files
  - Client: `get-stuff-done/bin/lib/firecrawl-client.cjs`
  - Endpoints used: `/v1/context/crawl`, `/v1/scrape`, `/v1/search`, `/v1/extract`, `/v1/map`
  - Auth: `FIRECRAWL_API_KEY` (default: 'local' for self-hosted instances)
  - URL: `FIRECRAWL_API_URL` (default: http://localhost:3002)
  - Rate limiting: `FIRECRAWL_RATE_LIMIT_RPM` (default: 60 RPM)
  - Health check: `firecrawl check` command
  - Audit logging: Records all requests to PostgreSQL `firecrawl_audit` table via `second-brain.cjs`

**Project Management:**
- **Plane** - Issue and project tracking platform
  - Purpose: Synchronize roadmap milestones, phases, and tasks with external workspace
  - Client: `get-stuff-done/bin/lib/plane-client.cjs`
  - Operations: Syncs `.planning/ROADMAP.md` phases to Plane issues, bidirectional traceability
  - Auth: `PLANE_API_KEY`
  - URL: `PLANE_API_URL` (default: http://localhost:3003)
  - Project ID: `PLANE_PROJECT_ID`
  - Rate limiting: `PLANE_RATE_LIMIT_RPM` (default: 60 RPM)

**Search:**
- **SearXNG** - Privacy-respecting meta search engine
  - Purpose: Audit-logged web search for research operations
  - Client: `get-stuff-done/bin/lib/searxng-client.cjs`
  - URL: `GSD_SEARXNG_URL` (default: http://localhost:8080)
  - Policy enforcement: Access controlled via `policy.checkAccessGrant('search:searxng')`
  - Audit: All searches logged to `second-brain.cjs` with latency tracking

**Local Services:**
- **Planning Server** - Internal HTTP API for context normalization
  - Purpose: Normalizes planning artifacts and source code into ContextArtifacts with AST analysis
  - Location: `get-stuff-done/bin/lib/planning-server.cjs`
  - URL: `GSD_PLANNING_URL` (default: http://localhost:3011)
  - Port: `GSD_PLANNING_PORT` (default: 3011)
  - Host: `GSD_PLANNING_HOST` (default: 127.0.0.1)
  - Auth: `PLANNING_SERVER_TOKEN` (configurable via `PLANNING_SERVER_AUTH_MODE`)
  - CORS: `GSD_PLANNING_CORS_ORIGINS` (comma-separated)
  - Max concurrent requests: `PLANNING_SERVER_MAX_CONCURRENT_REQUESTS` (default: 16)
  - Max concurrent extracts: `PLANNING_SERVER_MAX_CONCURRENT_EXTRACTS` (default: 4)
  - Max path bytes: `PLANNING_SERVER_MAX_PATH_BYTES` (default: 4096)
  - Max file bytes: `PLANNING_SERVER_MAX_FILE_BYTES` (default: 5242880)
  - Fallback: Filesystem normalization when server is unavailable

## Data Storage

**Primary Database:**
- **PostgreSQL** - Persistent relational storage for all memory and audit logs
  - Client: `pg` package, connection pool in `get-stuff-done/bin/lib/second-brain.cjs`
  - Schema: `gsd_local_brain` (project-isolated)
  - Connection: Either `DATABASE_URL` or individual parameters:
    - `PGHOST` (default: localhost)
    - `PGPORT` (default: 5432)
    - `PGDATABASE` (default: auto-generated as `gsd_local_brain_<project-hash>`)
    - `PGUSER`
    - `PGPASSWORD`
    - `GSD_DB_NAME` (override database name)
  - Project isolation: Each project gets unique 12-char hash-based ID; tables exist in dedicated schema
  - Tables: `project_identity`, `artifacts`, `firecrawl_audit`, `checkpoints`, `enforcement_log`, `context_cache`, and others
  - Indexes: Automatic creation of indexes for `firecrawl_audit` on insert
  - Fallback: SQLite when `GSD_MEMORY_MODE=sqlite` using `node:sqlite`

**File Storage:**
- Local filesystem primarily for planning documents
  - `.planning/` directory contains: STATE.md, config.json, phases/, milestones/, context/, research/, tests/
  - `.gemini_security/second_brain.db` for SQLite fallback
  - No external object storage (S3, etc.) detected

**Caching:**
- In-memory caches:
  - `FirecrawlClient.rateLimitBuckets` (Map keyed by hostname)
  - `PlaneClient.rateLimitBuckets` (Map keyed by hostname)
  - `PlaneClient.cache` (Map for API responses)
  - `policy-grant-cache.cjs` - Policy grant lookups
- Persistent cache: `second-brain.cjs` `context_cache` table in PostgreSQL

## Authentication & Identity

**Auth Provider:**
- Custom project-level authentication for Planning Server
  - Implementation: Bearer token via `PLANNING_SERVER_TOKEN`
  - Modes: `PLANNING_SERVER_AUTH_MODE` = 'mandatory' (default), 'disabled', or 'optional'
  - Local bypass: `PLANNING_SERVER_INSECURE_LOCAL=1` allows unrestricted access with identity = IP
  - Identity captured: Client IP from `x-forwarded-for` or remoteAddress

**Service Auth:**
- Firecrawl: API key header (default 'local' for self-hosted)
- Plane: Bearer token in `Authorization: Bearer <PLANE_API_KEY>`
- PostgreSQL: SASL via pg library (username/password or connection string)

**Agent Config Directories:**
- System detects various AI agent config locations:
  - Claude: `CLAUDE_CONFIG_DIR`
  - Gemini: `GEMINI_CONFIG_DIR`
  - OpenCode: `OPENCODE_CONFIG_DIR` or `OPENCODE_CONFIG`
  - Codex: `CODEX_HOME`
  - Copilot: `COPILOT_CONFIG_DIR`
  - Antigravity: `ANTIGRAVITY_CONFIG_DIR`

## Monitoring & Observability

**Audit Logging:**
- Comprehensive audit trail via `second-brain.cjs` functions:
  - `recordFirecrawlAudit()` - Every Firecrawl request logged with status, latency, URL, action
  - `recordAuditEntry()` - General audit entries for policy decisions, gate operations
- Audit tables in PostgreSQL: `firecrawl_audit`, `enforcement_log`, `policy_grant_cache`
- StrongDM-style visibility pattern - all external access is logged

**Logging:**
- Console output (stdout/stderr) for operational messages
- Log level: `GSD_LOG_LEVEL` environment variable
- Debug mode: `GSD_DEBUG=true` for extra SecondBrain diagnostics

**Health Checks:**
- `brain health` command - Checks PostgreSQL, RabbitMQ, and Planning Server connectivity
- `firecrawl health` - Firecrawl-specific metrics
- Individual service checks in each client (`check()` methods)

## CI/CD & Deployment

**Hosting:**
- Not applicable - this is a CLI tool that runs in developer's environment

**CI Pipeline:**
- GitHub Actions present (`.github/workflows/` exists)
- Test commands:
  - `npm test` - Runs `scripts/run-tests.cjs` (all tests with scenarios)
  - `npm run test:gates` - Gate and policy enforcement tests
  - `npm run test:coverage` - c8 coverage with 100% line requirement for core lib files

**Installation:**
- `node bin/install.js --claude --global` - Install to `~/.claude/` for Claude Code
- `node bin/install.js --claude --local` - Install to `./.claude/` (project-local)
- `node bin/install.js` supports other agents (Gemini, Codex, Copilot, Antigravity)

## Webhooks & Callbacks

**Incoming:**
- None detected (Planning Server listens on localhost only for internal use)

**Outgoing:**
- None detected (no external webhook dispatchers)

## Environment Configuration

**Required env vars for full functionality:**
- `DATABASE_URL` or `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` - PostgreSQL access
- `AMQP_URL` - RabbitMQ connectivity (optional, operates without)
- `FIRECRAWL_API_URL` and `FIRECRAWL_API_KEY` - External context normalization (optional)
- `PLANE_API_KEY` and `PLANE_PROJECT_ID` - Plane integration (optional)
- `GSD_SEARXNG_URL` - SearXNG search (optional)

**Secrets location:**
- Environment variables are primary
- Optional files: `~/.gsd/brave_api_key` for Brave Search API key
- No `.env` file usage detected (explicit environment variable loading not present)

---

*Integration audit: 2026-03-25*
