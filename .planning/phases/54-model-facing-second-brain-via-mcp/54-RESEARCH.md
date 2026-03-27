---
phase: 54
status: researched
researched: 2026-03-26
updated: 2026-03-26
depends_on:
  - phase: 53
    reason: "Phase 53 established truthful backend state and explicit degraded-mode signaling that Phase 54 must reuse."
---

# Phase 54 Research: Model-Facing Second Brain via MCP

## Summary

Phase 54 should expose Second Brain to planner and executor workflows through a dedicated MCP server contract, not through direct Node imports or prompt-level database assumptions.

Primary recommendation:
- use Google's MCP Toolbox for Databases as the sanctioned MCP surface
- connect it to Postgres only for model-facing memory
- expose custom narrow tools, not generic `execute_sql`
- keep Firecrawl as the only external-context ingestion and normalization path
- fail closed for model-facing memory when Second Brain is degraded to SQLite

This is the critical architectural distinction:
- Firecrawl remains the boundary for external knowledge
- Second Brain MCP becomes the boundary for curated internal execution memory

That split satisfies both roadmap requirements:
- `MEMORY-MCP-01`: sanctioned MCP path instead of ad hoc DB coupling
- `MEMORY-MCP-02`: Firecrawl remains sole external-context boundary while curated prior execution memory is merged into planning context

## Current Reality

The repo already has the primitives that Phase 54 should build on:

- `get-stuff-done/bin/lib/second-brain.cjs`
  - persistent Postgres storage with SQLite fallback
  - artifact ingestion, symbol/dependency storage, audit logs, grants, schema registry
  - explicit backend truth via `getBackendState()`
- `get-stuff-done/bin/lib/brain-manager.cjs`
  - `brain status` and `brain health`
  - explicit `memory_critical_blocked` behavior
- `get-stuff-done/bin/lib/firecrawl-client.cjs`
  - the current external context control point
  - policy enforcement and audit logging
- `get-stuff-done/bin/lib/context.cjs`
  - the current planning/execution context assembler
  - already understands internal vs external parity as separate concerns

What does not exist yet:

- no MCP server configuration for Second Brain
- no model-facing read/write tool contract
- no curated workflow-memory table distinct from raw artifact/audit storage
- no planner/executor toolset split
- no degraded-mode rule for MCP memory access

## Standard Stack

### Required runtime stack

- MCP Toolbox for Databases (`googleapis/genai-toolbox`)
  - use as the MCP server for database-backed model tools
  - official repo: `https://github.com/googleapis/genai-toolbox`
  - official docs: `https://googleapis.github.io/genai-toolbox/`
- Model Context Protocol
  - use the standard MCP tool contract rather than a custom shell bridge
  - official docs: `https://modelcontextprotocol.io`
- PostgreSQL
  - canonical backing store for model-facing memory tools
  - do not make SQLite the model-facing contract
- Existing GSD Second Brain runtime
  - continue owning ingestion, backend truth, audit, and local lifecycle

### Toolbox mode to use

Use **custom tools** via `tools.yaml`, not only prebuilt generic tools.

Reason:
- prebuilt tools are good for exploration
- Phase 54 needs a stable application contract with narrow semantics
- planner and executor need named tools like `memory_search` and `memory_write_checkpoint`, not free-form SQL access

### Tool exposure policy

Use separate Toolbox toolsets:

- `planner_memory_readonly`
  - search curated memory
  - fetch recent decisions
  - fetch similar prior phase outcomes
- `executor_memory_rw`
  - all readonly planner tools
  - append checkpoint memory
  - append summary memory
  - mark outcome / resolution

Do not expose:
- generic `execute_sql`
- schema migration tools
- destructive delete/update tools for agent use
- raw Firecrawl artifact browsing as model-facing memory unless it is already curated

## Architecture Patterns

### 1. Split external context from internal memory

Use two distinct boundaries:

- External context:
  - always retrieved through Firecrawl
  - normalized before entering planning context
- Internal execution memory:
  - retrieved through MCP Toolbox custom tools backed by Postgres
  - limited to curated workflow memory, not arbitrary database tables

Inference from repo state:
- this matches the existing `firecrawl-client.cjs` role as the external gate
- it also avoids turning Phase 54 into a Firecrawl bypass

### 2. Treat model-facing memory as memory-critical

Model-facing MCP access should require Postgres-backed availability.

Recommended rule:
- if `brain status` reports `active_backend=postgres`, memory MCP tools are available
- if Second Brain is degraded to SQLite, planner/executor memory tools must return a structured degraded/unavailable result
- do not silently switch planner/executor memory to a different SQLite-only contract

Reason:
- Toolbox is a Postgres-facing integration in this repo's likely target architecture
- silent fallback would create different semantics between CLI/runtime and model memory behavior
- Phase 53 already established explicit fail-hard behavior for memory-critical flows

### 3. Add a curated workflow-memory schema

Do not point model tools directly at:
- `firecrawl_audit`
- raw `artifacts`
- raw `symbols`
- raw `dependencies`

Instead add a dedicated curated layer, for example:

- `gsd_local_brain.workflow_memory`
  - `id`
  - `project_id`
  - `phase`
  - `plan`
  - `memory_kind` (`decision`, `checkpoint`, `summary`, `pitfall`, `resolution`)
  - `title`
  - `body_markdown`
  - `tags_json`
  - `source_ref`
  - `created_at`
  - `created_by`
  - `importance`
- `gsd_local_brain.workflow_memory_links`
  - memory-to-artifact or memory-to-plan references

This keeps model-facing retrieval clean and prevents audit logs from becoming accidental prompt context.

### 4. Assemble memory into context through a single workflow step

Do not let every prompt invent its own memory query.

Recommended contract:
- add a single memory retrieval step to context building for `plan-phase` and `execute-plan`
- that step calls the MCP tools
- it returns a bounded memory pack:
  - recent relevant decisions
  - prior similar summaries
  - known pitfalls
  - unresolved blockers
- the workflow prompt consumes the pack as structured context

This keeps prompt shape stable and testable.

### 5. Use append-only writeback from workflow milestones

Writeback should happen only at stable lifecycle points:

- planner:
  - write locked planning decisions after plan finalization
- executor:
  - write checkpoint memory at explicit checkpoint creation
  - write summary memory at plan completion
- verifier:
  - optionally write validated outcomes or recurring failure patterns later

Do not let arbitrary intermediate model thoughts write to Second Brain.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| MCP transport | Custom JSON-RPC wrapper around DB helpers | MCP Toolbox | Standard MCP server, existing docs, client compatibility |
| Model DB contract | Raw SQL in prompts | Named custom tools in `tools.yaml` | Stable, least-privilege interface |
| Planner vs executor permissions | Shared unrestricted tool list | Toolbox toolsets with role-based exposure | Prevents accidental writes from planner |
| External web memory | Direct DB writes from search results | Firecrawl normalization then curated ingest | Preserves external-context boundary |
| Memory fallback | Silent SQLite model reads | Structured unavailable/degraded responses | Keeps truthfulness and semantics aligned |
| Prompt retrieval logic | Ad hoc query composition per agent | Single context-builder memory pack step | Deterministic prompts and easier tests |

## Common Pitfalls

### Pitfall 1: exposing `execute_sql` to agents

What goes wrong:
- planner/executor can issue arbitrary queries
- schema leaks into prompts
- write safety depends on prompt discipline instead of tool design

Required posture:
- use custom named tools only for production workflow agents

### Pitfall 2: mixing Firecrawl artifacts directly into memory recall

What goes wrong:
- external context and internal execution memory become indistinguishable
- Phase 54 accidentally bypasses the Firecrawl governance boundary
- plans can cite stale or uncurated external content as if it were local truth

Required posture:
- only curated internal memory is queryable through model-facing MCP tools
- external artifacts remain Firecrawl-managed inputs

### Pitfall 3: allowing SQLite fallback for model-facing memory

What goes wrong:
- planner/executor behavior changes based on hidden backend differences
- Toolbox contract may not match fallback runtime semantics
- relevance/ranking/consistency differ from canonical Postgres behavior

Required posture:
- treat MCP memory as unavailable when Postgres is unavailable
- surface degraded state explicitly in tool results and workflow output

### Pitfall 4: writing every execution event into prompt-facing memory

What goes wrong:
- noisy checkpoint spam
- low-signal retrieval results
- planners optimize around irrelevant operational chatter

Required posture:
- write only curated checkpoint, summary, decision, pitfall, and resolution entries
- keep audit logs separate

### Pitfall 5: letting workflows query memory directly instead of through context assembly

What goes wrong:
- prompts diverge
- tests become brittle
- planning quality depends on agent initiative instead of system contract

Required posture:
- centralize retrieval and shaping in one code path

## Code Examples

### Example 1: Toolbox source and read-only planner tool

```yaml
kind: source
name: gsd-brain
type: postgres
host: 127.0.0.1
port: 5432
database: gsd_local_brain
user: toolbox_reader
password: ${TOOLBOX_DB_PASSWORD}
---
kind: tool
name: memory_search
type: postgres-sql
source: gsd-brain
description: Search curated project memory relevant to a phase goal or task.
parameters:
  - name: project_id
    type: string
  - name: query
    type: string
  - name: limit
    type: number
statement: |
  SELECT phase, plan, memory_kind, title, body_markdown, source_ref, created_at
  FROM gsd_local_brain.workflow_memory
  WHERE project_id = $1
    AND (
      title ILIKE '%' || $2 || '%'
      OR body_markdown ILIKE '%' || $2 || '%'
    )
  ORDER BY importance DESC, created_at DESC
  LIMIT $3;
```

### Example 2: executor writeback tool

```yaml
kind: tool
name: memory_write_checkpoint
type: postgres-sql
source: gsd-brain
description: Append a curated execution checkpoint memory entry.
parameters:
  - name: project_id
    type: string
  - name: phase
    type: string
  - name: plan
    type: string
  - name: title
    type: string
  - name: body_markdown
    type: string
  - name: source_ref
    type: string
statement: |
  INSERT INTO gsd_local_brain.workflow_memory
    (project_id, phase, plan, memory_kind, title, body_markdown, source_ref, created_by, importance)
  VALUES
    ($1, $2, $3, 'checkpoint', $4, $5, $6, 'executor', 50);
```

### Example 3: context assembly contract

```javascript
// Pseudocode inside context build flow
async function buildMemoryPack({ phase, plan, goal, projectId }) {
  const relevant = await toolboxClient.callTool('memory_search', {
    project_id: projectId,
    query: goal,
    limit: 8,
  });

  return {
    enabled: true,
    source: 'second-brain-mcp',
    entries: relevant.rows,
  };
}
```

The key constraint is not the exact client library. The key constraint is:
- workflow code owns retrieval and shaping
- prompts consume a bounded memory pack

## Recommended Phase 54 Deliverables

The next planning pass should produce work in roughly this order:

1. Add curated workflow-memory schema and write helpers in `second-brain.cjs`.
2. Add MCP Toolbox config and local launch contract for Postgres-backed memory access.
3. Define readonly planner tools and read/write executor tools.
4. Add memory-pack assembly into `context build` for `plan-phase` and `execute-plan`.
5. Add explicit degraded-mode handling tied to `brain status` / `brain health`.
6. Add focused tests for:
   - planner read-only contract
   - executor writeback contract
   - degraded Postgres behavior
   - Firecrawl boundary preservation

## Verification Targets

Phase 54 should not be considered complete unless all of these are true:

- planner can retrieve curated prior execution memory through MCP without direct DB imports
- executor can append curated checkpoint or summary memory through MCP
- planner cannot mutate memory
- degraded SQLite mode blocks or disables model-facing memory tools explicitly
- Firecrawl remains the only path for external document normalization
- prompt context uses a bounded memory pack, not raw SQL output dumps

## Confidence

- Standard stack: high
- Architecture pattern: high
- Specific schema shape: medium
- Exact tool names and retrieval ranking strategy: medium

The schema and tool names are implementation inferences from the repo's current state and the official Toolbox capability set. The central architectural choice is not uncertain: use MCP Toolbox custom tools over Postgres, keep Firecrawl as the external boundary, and fail closed when canonical memory is unavailable.

## Sources

- Google MCP Toolbox for Databases README: `https://github.com/googleapis/genai-toolbox`
- Google MCP Toolbox docs: `https://googleapis.github.io/genai-toolbox/`
- Model Context Protocol docs: `https://modelcontextprotocol.io`
- Local repo:
  - `get-stuff-done/bin/lib/second-brain.cjs`
  - `get-stuff-done/bin/lib/brain-manager.cjs`
  - `get-stuff-done/bin/lib/firecrawl-client.cjs`
  - `get-stuff-done/bin/lib/context.cjs`
  - `.planning/STATE.md`
  - `.planning/REQUIREMENTS.md`
  - `.planning/phases/53-second-brain-connection-fallback-hardening/53-CONTEXT.md`
  - `.planning/phases/53-second-brain-connection-fallback-hardening/53-01-SUMMARY.md`

<!-- GSD-AUTHORITY: 54-RESEARCH-1:phase54-model-facing-second-brain-via-mcp -->
