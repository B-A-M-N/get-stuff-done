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

## Current Milestone: v0.7.0 Truth Enforcement & Drift Elimination

**Goal:** Convert the system from “generally correct when followed” into a mechanically enforced truth system where state claims, verification outcomes, degraded modes, and execution results are all backed by observable evidence and enforced paths.

**Target features:**
- define a strict evidence standard so unverifiable claims are downgraded automatically
- require execution proof chains from task -> commit -> summary -> verification artifact
- harden `VERIFICATION.md` into an evidence-first artifact with requirement coverage, anti-pattern scanning, and explicit status
- detect and classify roadmap/code, execution, and verification drift automatically
- reconcile detected drift through deterministic status downgrades and re-verification requirements
- make degraded mode explicit and behaviorally meaningful instead of silently permissive
- audit critical enforcement boundaries for bypass paths across CLI, artifacts, and truth-bearing interfaces
- produce phase-level truth contracts and an end-to-end adversarial integrity gauntlet

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
*Last updated: 2026-03-27 during v0.7.0 milestone definition*

<!-- GSD-AUTHORITY: 70-00-0:313db6b23bd69b71d0b3219edfde97a661688cf774936b069eac79d0eb1e0e9e -->
