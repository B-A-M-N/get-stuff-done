# Phase 55: Open Brain V1 Foundations - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Source:** Direct user instruction after documenting Open Brain sidecar architecture

<domain>
## Phase Boundary

Phase 55 adds the first implementation of Open Brain as a sidecar beside the existing GSD workflow stack.

This phase is about:
- creating a separate long-horizon memory layer instead of overloading Second Brain
- keeping Plane as the project and test control layer
- keeping Firecrawl as the retrieval and normalization layer for usable context/data
- preserving Second Brain as the execution-truth and workflow-memory database
- adding local-first semantic storage and bounded recall for reusable knowledge

This phase is not about:
- replacing Plane with Open Brain
- replacing Firecrawl with direct database reads
- replacing Second Brain workflow memory with fuzzy long-horizon recall
- introducing paid hosted dependencies such as Supabase or OpenRouter
- requiring a dedicated graph database in v1
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Open Brain must be a separate sidecar, not a repurposing of Second Brain.
- Plane remains the project and test control layer.
- Firecrawl remains the retrieval and normalization layer for both internal and external source material.
- Second Brain remains the operational workflow database and execution-truth store.
- Open Brain should use a local-first stack and avoid paid hosted dependencies.
- `fastembed` is the preferred default embedding path.
- Ollama is optional and should only be used when a local model runtime is actually needed for summarization, reranking, or consolidation.
- The v1 design should be graph-ready without requiring a graph DB in Phase 55.

### Planning Guidance
- Keep Open Brain storage in a separate Postgres schema such as `gsd_open_brain`.
- Use `pgvector` for v1 vector storage if embeddings are stored in Postgres.
- Build bounded retrieval and curation before deeper memory sophistication.
- Prefer promoted and validated artifacts over indiscriminate ingestion of raw data.
- Open Brain failure must degrade safely without breaking existing GSD workflows.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture truth
- `docs/OPEN-BRAIN-ARCHITECTURE.md` — canonical sidecar design, v1 schema, ingestion, retrieval, feedback, and graph-ready posture.
- `docs/ARCHITECTURE.md` — current fork service split across Plane, Firecrawl, Second Brain, and the Open Brain sidecar.
- `.planning/PROJECT.md` — milestone intent for `v0.6.0 Open Brain Foundations`.
- `.planning/ROADMAP.md` — Phase 55 goal and plan split.
- `.planning/REQUIREMENTS.md` — `OPEN-BRAIN-01` through `OPEN-BRAIN-06`.

### Existing retrieval and memory surfaces
- `get-stuff-done/bin/lib/firecrawl-client.cjs` — canonical retrieval and normalization client.
- `get-stuff-done/bin/lib/internal-normalizer.cjs` — current normalized artifact pipeline and existing artifact ingest path.
- `get-stuff-done/bin/lib/second-brain.cjs` — operational workflow database, artifact ingest, and bounded workflow memory behavior.
- `get-stuff-done/bin/lib/context.cjs` — current bounded planner/executor memory-pack assembly.

### Prior phase context
- `.planning/phases/53-second-brain-connection-fallback-hardening/53-CONTEXT.md` — canonical degraded-mode truth posture for memory-critical behavior.
- `.planning/phases/54-model-facing-second-brain-via-mcp/54-CONTEXT.md` — current sanctioned model-facing memory/toolbox contract.
</canonical_refs>

<specifics>
## Specific Ideas

- Start with a separate Postgres schema, not a separate database product.
- Add graph-ready relational links in Postgres first; defer a dedicated graph DB until traversal is a real bottleneck.
- Keep retrieval bounded and curated before planner/executor prompt injection.
- Use feedback from successful and harmful retrieval outcomes to change ranking over time.
- Prefer ingestion from normalized artifacts, summaries, validated resolutions, and repeated user corrections.
</specifics>

<deferred>
## Deferred Ideas

- Dedicated graph database adoption.
- Advanced consolidation and autonomous memory promotion strategies beyond bounded v1 jobs.
- Cross-project graph traversal UI or exploratory memory browsers.
- Broad agent-facing write access into Open Brain without curation gates.
</deferred>

---

*Phase: 55-open-brain-v1-foundations*
*Context gathered: 2026-03-27 via direct user instruction*
