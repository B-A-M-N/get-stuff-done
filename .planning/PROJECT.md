# PROJECT: get-stuff-done

## Current State

Versions `0.1.0`, `0.2.0`, `0.3.0`, `0.4.0`, `0.5.0`, and `0.6.0` are shipped. `v0.6.0` delivered Open Brain as a bounded local-first semantic-recall sidecar with curated ingestion, ranked retrieval, workflow-context integration, and installed Codex operator-surface repair while preserving Second Brain as execution truth.

Delivered in `v0.1.0`:
- narrative-first intake across initialization, discussion, and verification
- deterministic ITL runtime with ambiguity, lockability, and SQLite audit persistence
- coexistence-safe fork installation under `dostuff`-scoped surfaces
- canonical Zod schema layer and concrete Claude/Gemini/Kimi/OpenAI adapters
- standalone `packages/itl` module with `interpret_narrative(input_text, context_data)`
- stable `100%` line-coverage gate for the scoped ITL runtime and package surfaces

Delivered in `v0.2.0`:
- runtime-bound orchestration gates
- checkpoint/state lifecycle and schema contracts
- context enrichment and workflow surface hardening
- end-to-end orchestration integrity coverage

Delivered in `v0.3.0`:
- trusted context sandboxing and canonical artifact storage
- unified normalization pipeline and AST-aware context extraction
- independent local memory foundation with Postgres/SQLite fallback
- strict context determinism and observability hardening

## Current Core Value

Runtime-bound orchestration integrity with controlled context retrieval, deterministic evidence, and local memory that can be audited instead of hand-waved.

## Next Milestone Goals

No active milestone is defined yet. The next planning pass should decide whether to deepen Open Brain capabilities, normalize historical roadmap bookkeeping, or expand model-facing workflow ergonomics around the new memory boundaries.

## Archived Context

<details>
<summary>v0.1.0 planning context</summary>

### v0.1.0 Vision
Improve the human interaction layer of `get-stuff-done` by introducing a provider-agnostic "Intent Translation Layer" (ITL) that adapts user narrative into the structured inputs required by the existing GSD engines (Initialization, Discussion, Planning, Research, Execution, and Verification).

### Core Principles
- **Enhance, Don't Replace:** The ITL sits between the user and the existing GSD engines.
- **Preserve Agent Behavior:** The underlying planning/execution logic remains untouched; only the interface is altered.
- **Provider Agnostic:** Support Claude, Kimi, Gemini, and OpenAI through one canonical contract.
- **100% Reliability:** Mandatory test coverage for all new and modified code.

### Core Constraint
The ITL must adapt user input into the existing engines’ expected structures. It must not rewrite or replace planner, executor, governance, or research logic except where minimal interface changes are strictly necessary.

</details>

<details>
<summary>v0.6.0 milestone context</summary>

### v0.6.0 Goal
Add a separate local-first Open Brain sidecar that improves agent performance over time through semantic recall, bounded retrieval, and feedback-driven ranking while preserving Plane as control, Firecrawl as retrieval/normalization, and Second Brain as execution truth.

### v0.6.0 Target Features
- create a separate `gsd_open_brain` schema or database instead of overloading Second Brain
- add local embedding generation for normalized artifacts using a local-first provider
- ingest selected Firecrawl-normalized artifacts into Open Brain for long-horizon recall
- provide bounded semantic retrieval with scoring based on similarity, recency, reuse, and feedback
- record recall outcomes so retrieval quality can improve over time without polluting execution-critical workflow state
- keep Open Brain optional and non-breaking when unavailable

</details>

---
*Last updated: 2026-03-27 after v0.6.0 milestone completion*

<!-- GSD-AUTHORITY: 53-01-1:2a316a9a1c282c6f0430f2ea15e45c78b2605632d49856dc67ebd903082e8900 -->
