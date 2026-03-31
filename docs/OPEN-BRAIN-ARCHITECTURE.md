# Open Brain Sidecar Architecture

> Design note for adding a long-horizon knowledge system beside GSD's existing workflow stack.

---

## Goal

Add an Open Brain layer that measurably improves agent performance over time without weakening GSD's operational guarantees.

This layer should provide:
- rich long-horizon semantic recall
- strong ranking across many prior sessions and projects
- automatic memory consolidation
- feedback loops that improve future agent choices
- broad personal-knowledge-system behavior

It should **not** replace:
- Plane as the project and test control layer
- Firecrawl as the retrieval and normalization layer
- Second Brain as the operational workflow database

---

## Recommended Split

Use four distinct roles:

1. **Plane**
   - project and test control layer
   - system of record for project coordination artifacts

2. **Firecrawl**
   - retrieval and normalization layer
   - fetches and normalizes both internal and external source material into a common context shape

3. **Second Brain**
   - operational database for GSD workflow execution
   - stores audits, checkpoints, summaries, decisions, grants, and bounded workflow memory
   - must stay predictable, bounded, and easy to trust

4. **Open Brain**
   - long-horizon knowledge and learning layer
   - stores semantically searchable knowledge, cross-session patterns, promoted lessons, and consolidated memory

---

## Why A Separate Database

Do not overload Second Brain with fuzzy long-horizon memory.

Second Brain and Open Brain have different jobs:

- **Second Brain** optimizes for correctness, traceability, and workflow continuity
- **Open Brain** optimizes for recall quality, ranking, consolidation, and reuse

If both concerns are pushed into the same store:
- operational memory becomes noisy
- retrieval quality becomes harder to reason about
- stale or speculative knowledge can leak into execution-critical flows
- trust in workflow state degrades

The right pattern is:
- **Second Brain = execution truth**
- **Open Brain = learning and recall**

---

## Data Flow

```text
Plane / Internal Systems / External Sources
                  |
                  v
              Firecrawl
      retrieval + normalization
                  |
        +---------+---------+
        |                   |
        v                   v
   Current workflow     Ingestion pipeline
   context assembly     into Open Brain
        |                   |
        v                   v
   GSD planners       semantic storage,
   and executors      ranking, consolidation
        |                   |
        +---------+---------+
                  |
                  v
          Curated retrieval output
                  |
                  v
         bounded context for agents
                  |
                  v
             Second Brain
      stores execution truth for this run
```

Key rule:
- Firecrawl remains the retrieval and normalization entry point for source material.
- Open Brain stores derived knowledge and ranked recall artifacts.
- Second Brain stores operational truth for the current workflow lifecycle.

---

## Open Brain Responsibilities

Open Brain should own:
- embeddings and vector search
- semantic recall across sessions and projects
- memory promotion from raw observations into reusable knowledge
- consolidation of duplicated or overlapping memories
- ranking based on usefulness, recency, reliability, and outcome quality
- optional graph-style links between related memories
- feedback signals from successful plans, fixes, and approvals

Open Brain should not own:
- workflow checkpoints
- current-run task commit truth
- policy grants
- degraded-mode operator truth
- canonical source retrieval

---

## Suggested Storage Model

Use a separate Postgres database or schema for Open Brain.

Minimum tables:

### `ob_memory_item`

Stores raw and promoted memories.

Suggested fields:
- `id`
- `project_scope`
- `memory_type`
- `title`
- `body_markdown`
- `source_uri`
- `source_kind`
- `created_at`
- `updated_at`
- `embedding`
- `importance_score`
- `confidence_score`
- `reuse_count`
- `last_recalled_at`
- `superseded_by`
- `status`

Suggested `memory_type` values:
- `fact`
- `decision`
- `pattern`
- `pitfall`
- `resolution`
- `preference`
- `artifact_summary`
- `workflow_lesson`

Suggested `status` values:
- `candidate`
- `promoted`
- `consolidated`
- `archived`
- `rejected`

### `ob_memory_link`

Graph-style relationships between memories.

Suggested fields:
- `from_id`
- `to_id`
- `relation_type`
- `score`

Suggested `relation_type` values:
- `supports`
- `contradicts`
- `supersedes`
- `similar_to`
- `caused_by`
- `use_with`

### `ob_recall_event`

Stores what was retrieved, shown, and later proven useful or useless.

Suggested fields:
- `id`
- `workflow`
- `phase`
- `plan`
- `query_text`
- `retrieved_ids`
- `selected_ids`
- `outcome`
- `feedback_score`
- `created_at`

Suggested `outcome` values:
- `helpful`
- `neutral`
- `harmful`
- `unused`

### `ob_consolidation_job`

Tracks merges and summarization jobs.

Suggested fields:
- `id`
- `input_ids`
- `output_id`
- `strategy`
- `created_at`
- `status`

---

## Retrieval Pipeline

Recommended retrieval loop:

1. Firecrawl retrieves and normalizes source material.
2. Ingestion classifies candidate memories from normalized artifacts.
3. Open Brain stores candidates with embeddings.
4. Retrieval queries Open Brain for relevant memories.
5. Ranking scores memories by:
   - semantic similarity
   - recency
   - reuse count
   - explicit importance
   - project relevance
   - prior helpfulness
6. A curation layer filters and trims results.
7. Only the bounded result set enters workflow context.

This prevents direct prompt pollution from raw long-horizon recall.

---

## Consolidation Pipeline

Performance over time does not come from storing more text. It comes from turning repeated experience into compact reusable knowledge.

Recommended consolidation steps:

1. Detect near-duplicate memories.
2. Merge repeated lessons into a promoted summary.
3. Increase confidence only when evidence repeats across runs.
4. Mark stale or superseded memories rather than deleting them.
5. Preserve provenance back to original sources and sessions.

Example:
- five similar bug-fix memories become one promoted `pattern`
- repeated failed approaches become one stronger `pitfall`
- repeated user corrections become one `preference`

---

## Feedback Loops

To actually improve agent performance, Open Brain needs measured feedback.

Useful signals:
- user approval or rejection
- whether a retrieved memory was used in a successful plan
- whether a retrieval led to a bad plan or repeated mistake
- whether a fix was later reverted
- whether a recommended pattern reduced execution churn

Recommended rule:
- do not boost a memory because it was merely retrieved
- boost it only when later workflow outcomes suggest it helped

---

## Local-First Recommendations

This architecture does **not** require Supabase.

Recommended local-first stack:
- Postgres for Open Brain storage
- `pgvector` if you want embeddings in Postgres
- `fastembed` for local embeddings by default
- Ollama only when a local LLM is needed for reranking, summarization, or consolidation

This keeps cost low and control high.

---

## Integration With Current GSD

Minimal integration path:

1. Keep current Second Brain behavior unchanged.
2. Add a new Open Brain ingestion worker fed by Firecrawl-normalized artifacts.
3. Add retrieval APIs that return bounded ranked memories.
4. Introduce a curation step before planner/executor prompts receive Open Brain output.
5. Optionally promote especially useful Open Brain recall into Second Brain's bounded `memory_pack` when it becomes execution-relevant.

Important:
- Open Brain should influence workflows through curated retrieval.
- Second Brain should remain the source of execution truth.

---

## Concrete V1 Implementation Plan

This is the recommended first implementation that is cheap, local-first, and graph-ready without requiring a graph DB on day one.

### Exact Dependencies

Start with:
- Postgres
- `pgvector` extension in Postgres
- `fastembed` for local embeddings

Optional:
- Ollama only for local summarization, reranking, or consolidation jobs

Do **not** start with:
- Supabase
- OpenRouter
- a dedicated vector database
- a separate graph database

### Why Not A Graph DB In V1

Graph traversal can absolutely improve agent capability, but only after memory quality is already good.

V1 bottlenecks are:
- ingestion quality
- embedding quality
- retrieval ranking
- curation before prompt injection
- feedback from outcomes

If those are weak, a graph DB mostly helps connect low-quality memories faster.

The better V1 pattern is:
- store graph-ready links in Postgres now
- add a graph DB later only if traversal becomes the actual bottleneck

---

## V1 Schema

Use a dedicated Postgres schema such as `gsd_open_brain`.

### Extension

```sql
create extension if not exists vector;
```

### `gsd_open_brain.memory_item`

```sql
create schema if not exists gsd_open_brain;

create table if not exists gsd_open_brain.memory_item (
  id text primary key,
  project_scope text not null,
  source_uri text,
  source_kind text not null,
  memory_type text not null,
  title text not null,
  body_markdown text not null,
  embedding vector(384),
  importance_score real not null default 0,
  confidence_score real not null default 0,
  reuse_count integer not null default 0,
  helpful_count integer not null default 0,
  harmful_count integer not null default 0,
  last_recalled_at timestamptz,
  status text not null default 'candidate',
  superseded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Suggested indexes:

```sql
create index if not exists idx_ob_memory_project on gsd_open_brain.memory_item(project_scope, memory_type, status);
create index if not exists idx_ob_memory_recency on gsd_open_brain.memory_item(updated_at desc);
create index if not exists idx_ob_memory_embedding on gsd_open_brain.memory_item using ivfflat (embedding vector_cosine_ops);
```

### `gsd_open_brain.memory_link`

This is the graph-ready piece. It gives you relationship edges without needing a graph DB yet.

```sql
create table if not exists gsd_open_brain.memory_link (
  from_id text not null references gsd_open_brain.memory_item(id) on delete cascade,
  to_id text not null references gsd_open_brain.memory_item(id) on delete cascade,
  relation_type text not null,
  score real not null default 0,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id, relation_type)
);
```

### `gsd_open_brain.recall_event`

```sql
create table if not exists gsd_open_brain.recall_event (
  id text primary key,
  workflow text not null,
  phase text,
  plan text,
  query_text text not null,
  retrieved_ids jsonb not null default '[]'::jsonb,
  selected_ids jsonb not null default '[]'::jsonb,
  outcome text not null default 'unused',
  feedback_score real not null default 0,
  created_at timestamptz not null default now()
);
```

### `gsd_open_brain.consolidation_job`

```sql
create table if not exists gsd_open_brain.consolidation_job (
  id text primary key,
  input_ids jsonb not null default '[]'::jsonb,
  output_id text,
  strategy text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## V1 Migration

Migration steps:

1. create `gsd_open_brain` schema
2. enable `pgvector`
3. create `memory_item`
4. create `memory_link`
5. create `recall_event`
6. create `consolidation_job`
7. add indexes

Keep this fully separate from `gsd_local_brain`.

That keeps:
- Second Brain stable
- Open Brain experimental and evolvable
- rollback risk low

---

## V1 Ingestion API

Add a narrow internal ingestion surface.

Suggested functions:
- `ingestNormalizedArtifact(artifact, options)`
- `promoteMemoryCandidate(candidate)`
- `linkMemories(fromId, toId, relationType, score)`

Suggested ingestion flow:

1. receive Firecrawl-normalized artifact
2. classify candidate memory type
3. embed `title + body_markdown`
4. upsert into `memory_item`
5. optionally attach `memory_link` rows

Suggested candidate sources:
- normalized docs
- execution summaries
- validated resolutions
- repeated user corrections
- postmortems and pitfalls

Do **not** ingest everything blindly. Prefer:
- summaries over raw logs
- validated outcomes over speculative notes
- curated artifacts over prompt residue

---

## V1 Retrieval API

Add a bounded retrieval surface that returns ranked candidates, not raw database rows.

Suggested functions:
- `searchOpenBrain({ query, projectScope, memoryTypes, limit })`
- `recallForWorkflow({ workflow, phase, plan, query, limit })`
- `recordRecallOutcome({ recallEventId, outcome, feedbackScore })`

Suggested `searchOpenBrain` response:

```json
{
  "query": "postgres degraded fallback noise",
  "total_candidates": 12,
  "selected": [
    {
      "id": "mem_123",
      "memory_type": "pitfall",
      "title": "Repeated degraded warnings from pool teardown",
      "body_markdown": "Only emit one warning per reason...",
      "score": 0.91,
      "source_uri": "53-01-SUMMARY.md"
    }
  ]
}
```

Ranking inputs for V1:
- vector similarity
- recency
- reuse count
- helpful count minus harmful count
- project scope match
- explicit importance score

Return a bounded result set only.

---

## V1 Curation Rule

Never inject raw top-k results directly into planner or executor prompts.

Instead:
1. retrieve candidate memories
2. score and trim them
3. optionally summarize them
4. inject only the bounded curated set

This is the minimum guardrail that prevents semantic junk buildup.

---

## V1 Test Plan

### Unit Tests

- embedding generation returns stable dimensions
- ingestion upserts by ID instead of duplicating
- retrieval respects `project_scope`
- ranking boosts helpful memories over neutral ones
- harmful memories are down-ranked
- `memory_link` writes remain optional and bounded

### Integration Tests

- normalized Firecrawl artifact can be ingested into Open Brain
- semantic query returns relevant promoted memory
- recall event is written after retrieval
- feedback update changes later ranking
- Open Brain retrieval remains separate from Second Brain workflow memory APIs

### Behavioral Tests

- planner receives bounded curated Open Brain recall, not raw rows
- repeated successful memories rise in ranking over time
- repeated harmful memories sink in ranking
- consolidation job produces one promoted summary from duplicate inputs

### Safety Tests

- retrieval never returns archived or superseded memories unless explicitly requested
- ingestion rejects empty or malformed artifacts
- Open Brain outage does not break Second Brain operational flows
- Second Brain remains the source of execution truth even when Open Brain is unavailable

---

## V1 Success Definition

V1 is successful when:
- agents can retrieve semantically relevant prior knowledge
- retrieval stays bounded and curated
- feedback changes ranking in a visible way
- Second Brain remains operationally trustworthy
- no paid hosted service is required

V1 is **not** successful if:
- raw recall floods prompts
- retrieval quality is mostly noise
- Open Brain and Second Brain begin to overlap in responsibility
- the system requires hosted infrastructure just to be useful

---

## Success Criteria

This sidecar is working when:
- agents recover useful prior knowledge across distant sessions
- repeated mistakes decrease over time
- plans become more consistent with established project preferences
- retrieval quality improves with feedback instead of degrading into noise
- operational workflow state remains trustworthy and bounded

This sidecar is **not** working when:
- prompts become bloated with stale memory
- retrieval returns a lot of plausible junk
- operational memory and learned memory become indistinguishable
- workflow correctness becomes harder to audit

---

## Bottom Line

For this fork, the strongest architecture is:

- **Plane** for control
- **Firecrawl** for retrieval and normalization
- **Second Brain** for execution truth
- **Open Brain** as a separate learning and recall sidecar

That gives you compounding agent performance without sacrificing the strictness that makes GSD reliable.
