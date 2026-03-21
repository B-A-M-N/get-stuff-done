# Firecrawl Integration Design

## Problem

GSD agents currently use `WebSearch` and `WebFetch` for external research. These return unstructured content that the model must parse and interpret. The model also reconstructs execution state from scratch at the start of each call by reading multiple artifacts independently — STATE.md, TASK-LOG.jsonl, pending gates — with no validated ground truth.

Both problems share the same root: the model is doing work that code should do, and the inputs are unstructured when they could be typed.

## Solution

Two complementary changes:

1. **Firecrawl MCP → structured external context.** Replace WebSearch/WebFetch with Firecrawl's `firecrawl_scrape` (returns clean markdown, not raw HTML) and `firecrawl_extract` (returns schema-validated structured data). Self-hosted instance at `http://localhost:3002` means all requests stay local. MCP wiring means agents call it as a tool with no extra process.

2. **`context build` → structured internal context.** A new `gsd-tools.cjs context build --workflow <name>` command reads all relevant project artifacts and emits a Zod-validated snapshot. Agents read this at the start of each call instead of reconstructing state from individual files. Per-workflow schemas mean the snapshot is shaped exactly to what that workflow needs — `execute-plan` gets gate state and last task hash; `plan-phase` gets roadmap pointer and research presence.

The two halves are symmetric: Firecrawl scrapes external sources into a schema; `context build` scrapes internal artifacts into a schema. Agents receive verified structured objects, not raw files.

## Schemas and schema change policy

Each workflow declares its own Zod schema in `lib/context.cjs`. Schemas are composed from shared fragments (`GitStateSchema`, `PlanPointerSchema`, `TaskEntrySchema`, `GateSummarySchema`). When a workflow needs to change its context shape:

- Edit only that workflow's schema object in `context.cjs`
- The `schema_version` field in output lets callers detect stale cached snapshots
- No global migration — changes are isolated to the workflow that needs them

Zod validates before output. If the built snapshot fails validation, `context build` exits 1 with a diagnostic — the agent sees a hard failure, not silently wrong data.

## Files changed

### 1. `/home/bamn/.claude/settings.json`
Adds MCP server entry for local Firecrawl. Points to self-hosted instance.

### 2. `agents/gsd-phase-researcher.md`, `gsd-project-researcher.md`, `gsd-ui-researcher.md`
Adds `mcp__firecrawl__*` to tools. Updates source hierarchy: Firecrawl replaces WebFetch for structured doc extraction and upgrades WebSearch with `firecrawl_search`.

### 3. `get-stuff-done/bin/lib/context.cjs` (new)
Workflow context schemas + `cmdContextBuild`. Three schemas defined: `execute-plan`, `verify-work`, `plan-phase`.

### 4. `get-stuff-done/bin/gsd-tools.cjs`
Adds `context build --workflow <name>` dispatch. Updates header doc.

### 5. `get-stuff-done/workflows/execute-plan.md`
Adds `context build --workflow execute-plan` step after `init_context`. Execution state is now verified before any gate or task logic runs.

---

## Implementation

### 1. settings.json — MCP server

```json
// Add to /home/bamn/.claude/settings.json at top level:
"mcpServers": {
  "firecrawl": {
    "type": "stdio",
    "command": "node",
    "args": ["/home/bamn/firecrawl-mcp-server/dist/index.js"],
    "env": {
      "FIRECRAWL_API_URL": "http://localhost:3002",
      "FIRECRAWL_API_KEY": "local"
    }
  }
}
```

**Why `FIRECRAWL_API_KEY: "local"`:** The self-hosted instance doesn't validate keys but the SDK requires a non-empty string.

---

### 2. Agent tool declarations

All three researcher agents: change

```
tools: Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, mcp__context7__*
```
to
```
tools: Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, mcp__context7__*, mcp__firecrawl__*
```

---

### 3. Agent source hierarchy (phase-researcher and project-researcher)

Replace the `## Enhanced Web Search (Brave API)` section and update the source hierarchy table to add Firecrawl as a first-class tier:

**Source priority:** Context7 → Firecrawl extract (official docs) → Firecrawl search → WebSearch fallback → WebFetch fallback

**Firecrawl tools available:**
- `mcp__firecrawl__firecrawl_scrape` — fetch a URL, returns clean markdown (better than WebFetch raw HTML)
- `mcp__firecrawl__firecrawl_search` — web search with structured results including URL, title, description, markdown content
- `mcp__firecrawl__firecrawl_extract` — pull structured data from URLs using a schema (use for extracting API signatures, config options, version info from docs)
- `mcp__firecrawl__firecrawl_map` — discover all URLs under a domain (use to find the right docs page before scraping)

Use `firecrawl_search` instead of `WebSearch`. Use `firecrawl_scrape` instead of `WebFetch`. Use `firecrawl_extract` when you need structured data (API endpoints, parameter lists, version compatibility tables) — pass a schema describing the fields you want.

If the local Firecrawl instance is not running, fall back to `WebSearch`/`WebFetch`.

---

### 4. `lib/context.cjs` — full implementation

See file created at `get-stuff-done/bin/lib/context.cjs`.

Key behaviors:
- `cmdContextBuild(cwd, workflow, options, raw)` — dispatches to per-workflow builder
- Each builder reads only the artifacts its schema requires
- Zod validates before output; exits 1 on schema failure with `{ error, details }` JSON
- `schema_version: 1` in all outputs — bump when breaking schema changes

---

### 5. `gsd-tools.cjs` — dispatch addition

```javascript
case 'context': {
  const sub = args[0];
  if (sub === 'build') {
    const workflow = args[args.indexOf('--workflow') + 1] || null;
    const phaseVal = args[args.indexOf('--phase') + 1] || null;
    const planVal = args[args.indexOf('--plan') + 1] || null;
    context.cmdContextBuild(cwd, workflow, { phase: phaseVal, plan: planVal }, raw);
  } else {
    error(`Unknown context subcommand: ${sub || '(none)'}`);
  }
  break;
}
```

Header doc line added:
```
 *   context build --workflow <name>   Build Zod-validated execution snapshot for a workflow
 *     [--phase N] [--plan M]          execute-plan | verify-work | plan-phase
```

---

### 6. `execute-plan.md` — context snapshot step

Add after `init_context` step, before `identify_plan`:

```xml
<step name="load_execution_context">
```bash
CTX=$(node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" context build \
  --workflow execute-plan --phase "${PHASE}")
if [[ "$CTX" == @file:* ]]; then CTX=$(cat "${CTX#@file:}"); fi
```

Extract from CTX JSON: `git.head`, `git.branch`, `pointer.phase`, `pointer.plan`,
`pending_gates`, `last_task`, `checkpoint_present`, `coherent`, `warnings`.

If `coherent: false`: surface `warnings` to user before proceeding.
If `pending_gates` is non-empty: report stale gates before running `gate enforce`.
</step>
```
