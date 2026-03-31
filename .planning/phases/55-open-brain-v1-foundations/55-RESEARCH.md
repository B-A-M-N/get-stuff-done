# Phase 55: Open Brain V1 Foundations - Research

**Researched:** 2026-03-27
**Domain:** Open Brain sidecar architecture, local-first semantic recall, bounded retrieval, feedback-driven ranking
**Confidence:** HIGH

## User Constraints

### Locked Decisions
- Open Brain must be a separate sidecar, not a repurposing of Second Brain.
- Plane remains the project and test control layer.
- Firecrawl remains the retrieval and normalization layer for both internal and external source material.
- Second Brain remains the operational workflow database and execution-truth store.
- Open Brain should use a local-first stack and avoid paid hosted dependencies.
- `fastembed` is the preferred default embedding path.
- Ollama is optional and should only be used when a local model runtime is actually needed for summarization, reranking, or consolidation.
- The v1 design should be graph-ready without requiring a graph DB in Phase 55.

- Keep Open Brain storage in a separate Postgres schema such as `gsd_open_brain`.
- Use `pgvector` for v1 vector storage if embeddings are stored in Postgres.
- Build bounded retrieval and curation before deeper memory sophistication.
- Prefer promoted and validated artifacts over indiscriminate ingestion of raw data.
- Open Brain failure must degrade safely without breaking existing GSD workflows.

### Claude's Discretion
- Choose whether Open Brain lives behind a new library such as `open-brain.cjs` or as a small cluster of `open-brain-*.cjs` modules, but keep the API separate from `second-brain.cjs`.
- Choose whether local embeddings are stored as vectors in Postgres or computed and cached externally first, but preserve the `gsd_open_brain` schema and `pgvector` contract defined by the architecture doc.
- Choose whether planner/executor integration happens through `context.cjs`, a dedicated curation helper, or both, but prompts must only receive curated bounded recall.

### Deferred Ideas (OUT OF SCOPE)
- Dedicated graph database adoption.
- Advanced consolidation and autonomous memory promotion strategies beyond bounded v1 jobs.
- Cross-project graph traversal UI or exploratory memory browsers.
- Broad agent-facing write access into Open Brain without curation gates.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPEN-BRAIN-01 | The system MUST create a separate `gsd_open_brain` Postgres schema for long-horizon memory, distinct from `gsd_local_brain`, with graph-ready tables for memories, links, recall events, and consolidation jobs. | Add a dedicated Open Brain library and Postgres bootstrap that creates `gsd_open_brain.memory_item`, `memory_link`, `recall_event`, and `consolidation_job` plus `pgvector` support and graph-ready relational links. |
| OPEN-BRAIN-02 | The system MUST support local embedding generation for Open Brain memories using a default local provider, with no requirement for Supabase, OpenRouter, or other paid hosted services. | Add an embedding adapter with `fastembed` as the default provider, isolate it behind a local interface, and make missing embedding capability a degraded Open Brain condition rather than a workflow-wide failure. |
| OPEN-BRAIN-03 | The system MUST ingest selected Firecrawl-normalized artifacts into Open Brain without coupling Open Brain storage to Second Brain operational tables. | Reuse normalized artifact outputs from Firecrawl/internal normalization, but write promoted memory candidates into `gsd_open_brain` via a dedicated ingestion API instead of adding more semantic state to `gsd_local_brain.workflow_memory`. |
| OPEN-BRAIN-04 | The system MUST provide bounded semantic retrieval for Open Brain memories ranked by similarity, recency, reuse, and feedback quality rather than exposing raw database rows to prompts. | Add `searchOpenBrain` and `recallForWorkflow` style helpers that score candidates and return a curated bounded recall pack, then integrate that pack into workflow context instead of exposing raw rows. |
| OPEN-BRAIN-05 | The system MUST record recall outcomes so Open Brain ranking can improve over time based on measured helpful and harmful retrieval signals. | Persist `recall_event` rows for retrievals and add explicit outcome recording so helpful/harmful feedback affects later ranking. |
| OPEN-BRAIN-06 | Open Brain failure or unavailability MUST NOT break existing planner, executor, Firecrawl, or Second Brain operational flows. | Treat Open Brain as optional sidecar infrastructure: surface unavailable/degraded state in recall responses, preserve current Second Brain and Firecrawl behavior, and ensure context assembly can continue with no Open Brain recall. |

## Summary

Phase 55 should add a new Open Brain sidecar, not expand Second Brain’s mission. The repo already has two important foundations: `get-stuff-done/bin/lib/internal-normalizer.cjs` can produce normalized artifacts from planning/code surfaces, and `get-stuff-done/bin/lib/context.cjs` already knows how to inject bounded workflow memory into planning/execution context. What does not exist yet is a semantic recall system: there is no `gsd_open_brain` schema, no embedding provider abstraction, no bounded semantic ranking, and no recall-feedback loop. The architecture doc is explicit that these concerns belong in a separate long-horizon layer.

The safest implementation path is to preserve the current architecture boundaries and add Open Brain in three steps that match the roadmap. First, create the Open Brain schema, embeddings adapter, and graph-ready storage without changing planner/executor behavior. Second, build a narrow ingestion and retrieval API that consumes normalized artifacts and returns curated ranked recall instead of raw rows. Third, wire that bounded recall into workflow context and feedback recording while keeping Open Brain optional when unavailable. This sequence keeps execution truth in Second Brain, preserves Firecrawl as the normalization boundary, and limits Phase 55 risk to a sidecar that can degrade cleanly.

**Primary recommendation:** Build Open Brain as a separate Postgres-backed library with a local embedding adapter, bounded retrieval API, and explicit degraded-mode contract, then integrate it into context assembly only after schema, ingestion, and ranking are proven with focused tests.

## Standard Stack

### Core
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| PostgreSQL + `pg` | Open Brain canonical storage and query execution | The repo already uses Postgres through `second-brain.cjs`, and the architecture doc explicitly recommends a separate `gsd_open_brain` schema rather than a new hosted service. |
| `pgvector` Postgres extension | Vector storage and nearest-neighbor retrieval | The architecture doc names `pgvector` as the v1 vector layer and keeps embeddings colocated with Open Brain records. |
| `fastembed` | Default local embedding generation | The phase context and Open Brain architecture doc explicitly prefer `fastembed` for local-first embeddings. |
| `node:test` | Unit and integration verification | The repo already uses targeted `node --test` suites for architecture phases and can validate Open Brain behavior without introducing another runner. |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| Existing `internal-normalizer.cjs` and Firecrawl normalization surfaces | Canonical normalized artifact source for Open Brain ingestion | Use as the only sanctioned ingestion source for internal/external materials instead of reading raw files or prompt residue directly. |
| Existing `context.cjs` | Bounded prompt injection point | Use for the final curated recall pack once retrieval is stable; do not bypass it with prompt-specific SQL or ad hoc file reads. |
| Ollama | Optional local summarization/reranking/consolidation support | Only add if needed for later curation quality; not required for the base Phase 55 foundation. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate `gsd_open_brain` schema | Reusing `gsd_local_brain` tables | Violates the architecture split and risks mixing long-horizon fuzzy recall with execution-truth memory. |
| `pgvector` in Postgres | Separate hosted vector DB | Adds operational complexity and breaks the local-first requirement without solving the real v1 problem. |
| Local `fastembed` provider | Hosted embedding APIs | Violates the no-paid-dependency requirement and weakens offline/local control. |
| Curated recall pack | Raw top-k prompt injection | Increases semantic junk and breaks the architecture doc’s bounded curation rule. |

## Architecture Patterns

### Recommended Project Structure
```text
get-stuff-done/bin/lib/
├── open-brain.cjs                # public API facade for Open Brain
├── open-brain-embedder.cjs       # local embedding provider abstraction
├── open-brain-ranker.cjs         # bounded ranking and curation helpers
└── context.cjs                   # optional curated recall integration point

tests/
├── open-brain-schema.test.cjs
├── open-brain-ingestion.test.cjs
├── open-brain-retrieval.test.cjs
├── open-brain-feedback.test.cjs
└── open-brain-context-integration.test.cjs
```

This can be collapsed into fewer files if needed, but the semantic store, embedding provider, ranking, and workflow integration concerns should remain logically separate.

### Pattern 1: Separate Sidecar Storage Contract
**What:** Create and own `gsd_open_brain` independently from `gsd_local_brain`.
**When to use:** Always. Open Brain should never share tables with Second Brain workflow memory.
**Example:**
```sql
create schema if not exists gsd_open_brain;
create extension if not exists vector;
```

### Pattern 2: Narrow Ingestion From Normalized Artifacts
**What:** Ingest only selected normalized artifacts, summaries, validated resolutions, and curated corrections.
**When to use:** For all Open Brain writes in v1.
**Example:**
```javascript
await ingestNormalizedArtifact(artifact, {
  memory_type: 'artifact_summary',
  project_scope: secondBrain.projectId,
  promoted: true,
});
```

The repo evidence matters here: `internal-normalizer.cjs` already emits normalized artifacts and writes them to Second Brain. Phase 55 should reuse that artifact shape, not invent a second raw-ingestion path.

### Pattern 3: Embedding Provider Behind A Local Adapter
**What:** Isolate local embedding generation behind a small provider interface.
**When to use:** For all writes and query embeddings.
**Example:**
```javascript
const vector = await embedText(`${title}\n\n${body_markdown}`);
```

This keeps Phase 55 resilient if the repo later swaps `fastembed` implementation details or adds optional Ollama-backed reranking.

### Pattern 4: Bounded Ranked Retrieval, Not Raw Rows
**What:** Query Open Brain, score candidates, filter archived/superseded items, and return only a curated bounded result set.
**When to use:** For all planner/executor-facing Open Brain recall.
**Example:**
```javascript
const result = await recallForWorkflow({
  workflow: 'plan-phase',
  phase: '55',
  query: 'semantic recall for normalized artifact ingestion pitfalls',
  limit: 6,
});
```

Ranking inputs should match the architecture doc:
- vector similarity
- recency
- reuse count
- helpful minus harmful feedback
- project scope match
- explicit importance score

### Pattern 5: Explicit Recall Feedback Loop
**What:** Record what was retrieved, what was selected, and whether the outcome proved helpful, neutral, harmful, or unused.
**When to use:** After retrieval and after workflow outcome is known.
**Example:**
```javascript
await recordRecallOutcome({
  recallEventId,
  outcome: 'helpful',
  feedbackScore: 0.8,
});
```

This is the minimum viable learning loop. The architecture doc is explicit that retrieval alone should not boost ranking.

### Pattern 6: Safe Degradation With No Workflow Breakage
**What:** Open Brain failures must return unavailable/degraded recall metadata without breaking planner, executor, Firecrawl, or Second Brain.
**When to use:** On missing Postgres extension, missing embedding provider, query failures, or disabled Open Brain.
**Example:**
```json
{
  "available": false,
  "blocked": false,
  "reason": "open_brain_unavailable",
  "message": "Open Brain recall unavailable; continuing without semantic recall."
}
```

This should parallel the repo’s existing degraded-mode truth posture from Phases 53 and 54 without conflating Open Brain with Second Brain’s memory-critical model-facing storage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Long-horizon memory storage | More ad hoc fields in `gsd_local_brain.workflow_memory` | Dedicated `gsd_open_brain` schema and Open Brain API | Keeps execution truth separate from fuzzy recall. |
| Embedding runtime selection | Prompt-time shelling to random local models | A small embedding provider adapter with `fastembed` default | Deterministic, testable, and aligned with the local-first constraint. |
| Planner/executor retrieval | Direct prompt SQL or raw table dumps | Curated retrieval helpers and bounded recall packs | Prevents raw-row prompt injection and preserves retrieval quality. |
| Learning loop | Implicit boost-on-read heuristics | Explicit `recall_event` recording and outcome updates | The architecture doc requires measured helpful/harmful feedback, not naive access-count inflation. |
| Graph readiness | Adding a graph DB now | `memory_link` rows in Postgres | Preserves future traversal options without paying graph complexity in v1. |

## Common Pitfalls

### Pitfall 1: Expanding Second Brain Instead Of Building Open Brain
**What goes wrong:** Semantic recall gets mixed into `workflow_memory`, blurring execution truth and long-horizon learning.
**Why it happens:** The repo already has a working memory surface, so it is tempting to extend it.
**How to avoid:** Treat `gsd_local_brain.workflow_memory` as execution memory only and create Open Brain in `gsd_open_brain` with separate APIs.

### Pitfall 2: Ingesting Everything Blindly
**What goes wrong:** Raw logs and noisy artifacts flood the semantic store and degrade retrieval quality.
**Why it happens:** The normalizer already produces many artifacts.
**How to avoid:** Prefer summaries, validated resolutions, promoted lessons, and selected normalized artifacts rather than broad firehose ingestion.

### Pitfall 3: Letting Raw Top-K Results Reach Prompts
**What goes wrong:** Semantic search returns plausible but low-signal junk that bloats planner/executor prompts.
**Why it happens:** Vector search is mistaken for final curation.
**How to avoid:** Add a curation/ranking layer and only inject bounded selected recall into `context.cjs`.

### Pitfall 4: Treating Retrieval As Positive Feedback
**What goes wrong:** Irrelevant memories rise in ranking simply because they were retrieved often.
**Why it happens:** Retrieval count is the easiest metric to collect.
**How to avoid:** Only boost when later workflow outcomes indicate the retrieved memory actually helped.

### Pitfall 5: Making Open Brain A Hard Runtime Dependency
**What goes wrong:** Missing `pgvector`, missing embedding runtime, or local setup errors start breaking normal planning/execution flows.
**Why it happens:** The semantic sidecar is wired in too early or too hard.
**How to avoid:** Keep Open Brain optional at runtime and return explicit unavailable/degraded recall metadata while continuing existing flows unchanged.

### Pitfall 6: Coupling Ingestion To Raw Firecrawl Or Direct DB Reads
**What goes wrong:** Firecrawl’s normalization boundary gets bypassed or Open Brain starts reading internal state through ad hoc paths.
**Why it happens:** It seems faster to read raw content directly.
**How to avoid:** Keep Firecrawl/internal normalization as the canonical source material boundary and ingest only normalized artifacts into Open Brain.

## Concrete Recommendations For Plan Split

### 55-01 Foundation
- Create `open-brain.cjs` and supporting helpers for schema bootstrap.
- Add `gsd_open_brain` schema, `pgvector` extension enablement, `memory_item`, `memory_link`, `recall_event`, and `consolidation_job` tables.
- Add local embedding provider abstraction with `fastembed` as default.
- Add focused tests for schema bootstrap, vector field handling, embedding adapter contract, and safe unavailable/degraded behavior.

### 55-02 Ingestion And Retrieval
- Add `ingestNormalizedArtifact`, `promoteMemoryCandidate`, `linkMemories`, `searchOpenBrain`, `recallForWorkflow`, and ranking/curation helpers.
- Reuse normalized artifact shapes from existing normalization surfaces.
- Keep retrieval bounded and curated, excluding archived/superseded memories by default.
- Add tests for ingestion selection, ranking inputs, project-scope filtering, recall-event creation, and feedback-driven reranking.

### 55-03 Workflow Integration And Validation
- Integrate curated Open Brain recall into `context.cjs` or equivalent workflow context assembly without replacing the current `memory_pack` contract.
- Record retrieval outcomes from planning/execution lifecycle points where usefulness can be judged.
- Ensure workflows continue cleanly when Open Brain is unavailable.
- Add end-to-end tests proving Open Brain recall stays bounded, feedback affects ranking, and existing Second Brain / Firecrawl behavior is preserved.

## Recommended Verification

- `node --test tests/open-brain-schema.test.cjs`
- `node --test tests/open-brain-ingestion.test.cjs`
- `node --test tests/open-brain-retrieval.test.cjs`
- `node --test tests/open-brain-feedback.test.cjs`
- `node --test tests/open-brain-context-integration.test.cjs`
- `node --check get-stuff-done/bin/lib/open-brain.cjs`
- `node --check get-stuff-done/bin/lib/open-brain-embedder.cjs`
- `node --check get-stuff-done/bin/lib/open-brain-ranker.cjs`

## Bottom Line

Phase 55 is ready to plan. The repo already has the right control surfaces: normalized artifacts, a bounded context builder, and a proven degraded-mode philosophy. The missing work is a cleanly separated semantic sidecar. If Phase 55 keeps Open Brain in its own schema, ingests only normalized curated artifacts, returns bounded ranked recall, records measured outcomes, and degrades without affecting existing flows, it will satisfy the milestone without weakening the operational guarantees established in earlier phases.
