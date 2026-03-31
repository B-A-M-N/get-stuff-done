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

## v0.7.0 Deliverables

### Requirements

# Requirements
#
# Keep requirement entries single-line so audit tooling can parse them
# deterministically without inference.

TRUTH-CLAIM-01: The system MUST treat any state claim without filesystem, git, execution, or deterministic test evidence as INVALID rather than accepted narrative. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-EXEC-01: Every completed task MUST produce at least one git commit that can be mapped to the task scope and reflected in summary evidence. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-VERIFY-01: VERIFICATION.md MUST be evidence-first and include Observable Truths, Requirement Coverage, Anti-Pattern Scan, Drift Analysis, and Final Status sections. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-VERIFY-02: Requirement coverage statuses in verification artifacts MUST be restricted to VALID, CONDITIONAL, or INVALID and each status MUST cite concrete evidence. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-DRIFT-01: The system MUST classify at least Spec Drift, Implementation Drift, Verification Drift, and Execution Drift as first-class inconsistency types. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-DRIFT-02: Detected drift MUST be severity-classified as CRITICAL, MAJOR, or MINOR and mechanically downgrade affected truth statuses instead of remaining narrative-only. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-DEGRADE-01: Degraded subsystems MUST surface explicit health state and alter behavior meaningfully; no silent fallback may present as healthy operation. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-MEMORY-01: Model-facing memory MUST fail closed when canonical trusted memory conditions are unavailable, rather than silently masquerading as trusted planning context. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-BYPASS-01: Critical truth-bearing flows MUST not be bypassable through unsanctioned file writes, skipped validators, or success reporting without proof artifacts. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-OPS-01: Operator surfaces for health, drift, verification, and execution history MUST report actual backend truth rather than optimistic inferred state. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-PHASE-01: Every phase in the milestone MUST produce a structured truth artifact that distinguishes claimed outcomes, observable evidence, gaps or unknowns, and final validity status. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-GAUNTLET-01: The system MUST pass an adversarial end-to-end integrity gauntlet covering missing commits, fake verification, partial execution, degraded subsystems, and drift exposure. | source: .planning/v0.7.0-DECISIONS.md

## Traceability

| Requirement | Final Phase | Status |
|-------------|-------------|--------|
| TRUTH-CLAIM-01 | Phase 81 | Complete |
| TRUTH-EXEC-01 | Phase 71 | Complete |
| TRUTH-VERIFY-01 | Phase 80 | Complete |
| TRUTH-VERIFY-02 | Phase 80 | Complete |
| TRUTH-DRIFT-01 | Phase 70 | Complete |
| TRUTH-DRIFT-02 | Phase 80.1 | Complete |
| TRUTH-DEGRADE-01 | Phase 80 | Complete |
| TRUTH-MEMORY-01 | Phase 80.1 | Complete |
| TRUTH-BYPASS-01 | Phase 76 | Complete |
| TRUTH-OPS-01 | Phase 81 | Complete |
| TRUTH-PHASE-01 | Phase 78 | Complete |
| TRUTH-GAUNTLET-01 | Phase 79 | Complete |

# needs-clarification
# None.

# deprecated
# None.

<!-- GSD-AUTHORITY: 70-00-0:4e7d2779ba62731e85ea62477502a495ccf12f0e94993b586fa694a4ccb3ff9b -->

### Phases

### Phase 70: Drift Surface Mapping
**Reconciliation Status:** AT_RISK

**Goal:** Identify and classify every location where roadmap, requirements, execution, verification, and memory truth can drift apart.
**Requirements**: TRUTH-CLAIM-01, TRUTH-DRIFT-01
**Depends on:** Phase 55
**Status**: [Complete]

Plans:
- [ ] 70-01-PLAN.md — catalog drift vectors across roadmap, summaries, verification, and code reality
- [ ] 70-02-PLAN.md — severity model, truth-surface inventory, and classification rules

### Phase 71: Execution Proof Chain

**Goal:** Require every completed task and plan artifact to map cleanly to commits, changed files, and execution evidence.
**Requirements**: TRUTH-EXEC-01, TRUTH-CLAIM-01
**Depends on:** Phase 70
**Status**: [Complete]

Plans:
- [x] 71-01-PLAN.md — task-to-commit proof schema and summary linkage contract
- [x] 71-02-PLAN.md — commit-presence validator and artifact proof formatting

### Phase 72: Verification Hardening

**Goal:** Replace narrative verification with a strict evidence-first verification contract and validator.
**Requirements**: TRUTH-VERIFY-01, TRUTH-VERIFY-02
**Depends on:** Phase 71
**Status**: [Complete]

Plans:
- [x] 72-01-PLAN.md — strict VERIFICATION template and requirement coverage contract
- [x] 72-02-PLAN.md — anti-pattern scanner and verification validator

### Phase 73: Drift Detection Engine

**Goal:** Detect spec, implementation, verification, and execution drift automatically and surface it through a dedicated CLI path.
**Requirements**: TRUTH-DRIFT-01, TRUTH-DRIFT-02, TRUTH-OPS-01
**Depends on:** Phase 72
**Status**: [Complete]

Plans:
- [x] 73-01-PLAN.md — drift scanner core and inconsistency detection rules
- [x] 73-02-PLAN.md — operator CLI surface for drift status and machine-readable reports

### Phase 74: State Reconciliation Layer

**Goal:** Reconcile detected inconsistencies deterministically by downgrading truth status, marking conditional validity, and requiring re-verification where needed.
**Requirements**: TRUTH-DRIFT-02, TRUTH-CLAIM-01
**Depends on:** Phase 73
**Status**: [Complete]

Plans:
- [x] 74-01-PLAN.md — reconciliation rules for validity downgrade and re-verification triggers

### Phase 75: Degraded Mode Enforcement

**Goal:** Make degraded systems explicit, behaviorally meaningful, and non-silent across truth-bearing workflows.
**Requirements**: TRUTH-DEGRADE-01, TRUTH-MEMORY-01, TRUTH-OPS-01
**Depends on:** Phase 74
**Status**: [Complete]

Plans:
- [x] 75-01-PLAN.md — explicit degraded-state model and operator health truth surfaces
- [x] 75-02-PLAN.md — fail-closed behavior for unsafe or partially trusted memory paths

### Phase 76: Enforcement Boundary Audit

**Goal:** Prove that critical truth-bearing flows cannot bypass required validators, artifact writers, and sanctioned execution interfaces.
**Requirements**: TRUTH-BYPASS-01, TRUTH-CLAIM-01
**Depends on:** Phase 75
**Status**: [Complete]

Plans:
- [x] 76-01-PLAN.md — CLI, file-write, and validator boundary audit with bypass classification

### Phase 77: Execution Surface Governance

**Goal:** Narrow enforcement to authoritative truth boundaries so execution stays fast, recovery stays available, and only truth-bearing state transitions block under unsafe posture.
**Requirements**: TRUTH-DEGRADE-01, TRUTH-BYPASS-01, TRUTH-OPS-01, TRUTH-CLAIM-01
**Depends on:** Phase 76
**Status**: [Complete]

Plans:
- [x] 77-01-PLAN.md — canonical command governance map and classification contract
- [x] 77-02-PLAN.md — CLI governance wiring with warn-only, hard-gated, and recovery behavior

### Phase 78: Phase Truth Contracts

**Goal:** Standardize phase-level truth artifacts so every phase reports claimed outcomes, observable evidence, gaps, and final validity status.
**Requirements**: TRUTH-PHASE-01, TRUTH-VERIFY-01
**Depends on:** Phase 77
**Status**: [Complete]

Plans:
- [x] 78-01-PLAN.md — phase truth artifact contract and generation/update workflow
- [x] 78-02-PLAN.md — limited backfill of phase truth artifacts for phases 70-77

### Phase 79: End-to-End Integrity Gauntlet

**Goal:** Validate the entire truth-enforcement stack under adversarial failure conditions before milestone closeout.
**Requirements**: TRUTH-GAUNTLET-01, TRUTH-DRIFT-02, TRUTH-DEGRADE-01, TRUTH-BYPASS-01
**Depends on:** Phase 78
**Status**: [Complete]

Plans:
- [x] 79-01-PLAN.md — adversarial gauntlet suite for fake verification, missing commits, partial execution, degraded subsystems, and drift exposure

### Phase 80: Retroactive Verification Closure

**Goal:** Backfill evidence-first `VERIFICATION.md` artifacts for the late truth-hardening phases so milestone requirements can close against authoritative verification rather than summary-only claims.
**Requirements**: TRUTH-VERIFY-01, TRUTH-VERIFY-02, TRUTH-DRIFT-02, TRUTH-DEGRADE-01, TRUTH-MEMORY-01
**Depends on:** Phase 79
**Status**: [Planned]
**Gap Closure:** Closes missing `VERIFICATION.md` blockers from the `v0.7.0` milestone audit.

Plans:
- [ ] 80-01-PLAN.md — backfill verification artifacts for phases 72, 73, and 74 with evidence-first requirement coverage and final statuses
- [ ] 80-02-PLAN.md — backfill verification artifacts for phases 75 and 77 and restore late-phase requirement closure

### Phase 80.1: Memory Truth Reproval Closure

**Goal:** Re-prove model-facing memory fail-closed behavior and reconcile freshness from one consistent live truth posture so the remaining conditional closure from Phase 80 can become authoritative requirement satisfaction instead of partial evidence.
**Requirements**: TRUTH-MEMORY-01, TRUTH-DRIFT-02
**Depends on:** Phase 80
**Status**: [Planned]
**Gap Closure:** Closes the residual conditional proof gap surfaced by Phase 80 for memory fail-closed behavior and fresh live reconcile reproval.

Plans:
- [ ] 80.1-01-PLAN.md — reproduce degraded memory and live brain status truth from one controlled posture and backfill authoritative closure evidence
- [ ] 80.1-02-PLAN.md — refresh reconciliation truth inputs, re-run live reconcile proof, and finalize late-phase requirement closure before audit bookkeeping

### Phase 81: Audit Traceability & Nyquist Closure

**Goal:** Repair milestone bookkeeping drift after Phase 79, backfill missing validation surfaces for phases 73 through 79, and restore milestone auditability before archival.
**Requirements**: TRUTH-CLAIM-01, TRUTH-OPS-01
**Depends on:** Phase 80.1
**Status**: [Completed]
**Gap Closure:** Closes roadmap and requirements traceability drift plus missing Nyquist coverage from the `v0.7.0` milestone audit.

Plans:
- [x] 81-01-PLAN.md — sync roadmap and requirements truth for executed Phase 79 and restore truthful operator-facing milestone state
- [x] 81-02-PLAN.md — add retroactive validation artifacts for phases 73 through 79 and prepare milestone re-audit
- [x] 81-03-PLAN.md — final reconciliation and milestone closeout

---

<!-- GSD-AUTHORITY: 70-00-0:7c911fbf94919c37259bd9a0e5fbc54b842a98675e570dfb7f26b36d471e3daf -->
<!-- GSD-AUTHORITY: 72-02-1:57a2811dcafec0fda58a231bad017f4fcc19dab224287b3996d93c504c98e5fa -->
<!-- GSD-AUTHORITY: 72-01-1:80f7712e527b8e9280cfe989695a9386dbe0d8685e0201a21ebd1757785f347d -->

<!-- GSD-AUTHORITY: 72-00-0:97da5ec86fb4fef1e489f34a7f0b2bf3bf02e8a1e3ca6876deae070b19598553 -->
<!-- GSD-AUTHORITY: 70-01-1:9bad888438eeaf3e360197959355d24f2511adfba804680f87452c3b151a7d7f -->
<!-- GSD-AUTHORITY: 70-01-1:5d5125d2489fc33c17509e07f7402c1f5a4667e88ad5d74be95d8b94645cea82 -->

---

### Phase 82: Drift Remediation & Canonical Restoration

**Goal:** Resolve active CRITICAL drift, restore Postgres canonical memory, and re-validate Phase 81 closure under non-degraded conditions to achieve fully VALID milestone final state.

**Requirements**: DRIFT-REMED-01, TRUTH-VALIDATE-01
**Depends on:** Phase 81
**Status**: [Planned]
**Gap Closure:** Addresses blocked truth generation caused by degraded environment and outstanding drift from Phase 70; normalizes closure artifacts to VALID.

Plans:
- [ ] 82-01-PLAN.md — restore Postgres canonical memory and confirm healthy system state
- [ ] 82-02-PLAN.md — resolve Phase 70 CRITICAL drift and refresh reconciliation truth
- [ ] 82-03-PLAN.md — regenerate Phase 81 TRUTH to VALID in non-degraded mode
- [ ] 82-04-PLAN.md — re-run full validation sweep and finalize milestone audit
<!-- GSD-AUTHORITY: 70-01-1:beb0ddc7732b827583bacfcf630d45d611768d507d77971e0dfa115742ba5fb8 -->
<!-- GSD-AUTHORITY: 70-01-1:8abfe6e4f9d5bd76f5792caba0dc1e2fa35889cd7804ee408e0b470e7bb29dc7 -->
<!-- GSD-AUTHORITY: 70-01-1:c2afc766e8766fe1ec8a23243ee94865831adfe9610954a64b393236a5dce271 -->
<!-- GSD-AUTHORITY: 70-01-1:40ad0a63e1dc390f02f88a25b73c68c191fdd3ca7b75d2b33681fcc4aff3b8b7 -->

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
