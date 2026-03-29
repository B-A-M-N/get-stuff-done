# Roadmap

## Milestones

- [x] **v0.2.0 Orchestration Integrity** - Phases 15-22 (shipped 2026-03-18)
- [x] **v0.3.0 Trusted Context & Local Memory** - Phases 23-32 (Completed 2026-03-23)
- [x] **v0.5.0 Model-Facing Memory & Service Resilience** - Phases 53-54 (Completed 2026-03-27)
- [x] **v0.6.0 Open Brain Foundations** - Phase 55 (Completed 2026-03-27)
- [x] **v0.7.0 Truth Enforcement & Drift Elimination** - Phases 70-78 (Completed 2026-03-28)

## Archived Milestones

<details>
<summary>v0.1.0 Intent Translation Layer (Phases 1-14) — SHIPPED 2026-03-17</summary>

Delivered: narrative-first intake, deterministic ITL runtime, Zod schema layer, Claude/Gemini/Kimi/OpenAI adapters, standalone packages/itl module, 100% line-coverage gate.

See full archived roadmap: `.planning/milestones/v0.1.0-ROADMAP.md`

</details>

<details>
<summary>v0.2.0 Orchestration Integrity (Phases 15-22) — SHIPPED 2026-03-18</summary>

Delivered: Zod-validated execution artifacts, persistent checkpointing, mandatory runtime gates, pre-flight context enrichment, and full brownfield audit suite.

</details>

<details>
<summary>v0.6.0 Open Brain Foundations (Phase 55) — SHIPPED 2026-03-27</summary>

Delivered: separate `gsd_open_brain` sidecar schema, local-first embedding posture, curated ingestion, bounded semantic recall, feedback-driven reranking, workflow-context integration, and installed Codex `brain open-status` repair.

See full archived roadmap: `.planning/milestones/v0.6.0-ROADMAP.md`

</details>

### Phase 23: Research - Hard Context Sandbox

**Goal:** Implement core sandbox components (Guard module, path checks, and shell interceptor) to block unsanctioned file access.
**Requirements**: SANDBOX-01, SANDBOX-02, SANDBOX-03, SANDBOX-04
**Status**: [Completed]
**Plans:** 2/2 plans complete

Plans:
- [x] 23-01-PLAN.md — Core Guard logic and CLI gate implementation
- [x] 23-02-PLAN.md — Shell interceptor and verification suite

### Phase 24: Research - Canonical Identity & Storage

**Goal:** Implement the ContextArtifact schema, deterministic ID generator, and file-backed store for project context.
**Requirements**: SCHEMA-CANONICAL, ID-DETERMINISTIC, STORE-FILE-BACKED, CLI-INTEGRATION
**Status**: [Completed]
**Plans:** 3/3 plans executed

Plans:
- [x] 24-01-PLAN.md — Schema and Identity Foundation
- [x] 24-02-PLAN.md — Artifact Storage and Verification
- [x] 24-03-PLAN.md — CLI Integration

### Phase 25: Research - Unified Normalization Pipeline

**Goal:** Implement a unified normalization pipeline that transforms internal planning files and external documentation into validated `ContextArtifact` objects for the artifact store.
**Requirements**: NORMAL-INTERNAL, NORMAL-FIRE, NORMAL-PARITY
**Status**: [Completed]
**Plans:** 2/2 plans complete

Plans:
- [x] 25-01-PLAN.md — Implementation of Normalization Adapters
- [x] 25-02-PLAN.md — Pipeline Integration & Parity Testing

### Phase 26: Research & Implement AST-Aware Normalization (Tree-Sitter)

**Goal:** Integrate Tree-Sitter into the normalization pipeline to extract symbols and dependencies for the independent second brain.
**Requirements**: AST-SCHEMA-01, AST-PARSER-01, AST-INTERNAL-01, AST-EXTERNAL-01, AST-VERIFY-01
**Status**: [Completed]
**Plans:** 2/2 plans complete

Plans:
- [x] 26-01-PLAN.md — Schema Extension and AST Parser Implementation
- [x] 26-02-PLAN.md — Pipeline Integration and Verification

### Phase 27: Independent Memory Wiring (Postgres/RabbitMQ/Local Second Brain)

**Goal:** Implement the isolated memory foundation using Postgres and RabbitMQ to serve as the project's local consciousness.
**Requirements**: BRAIN-INFRA-01, BRAIN-STORAGE-01, BRAIN-INGEST-01, BRAIN-VERIFY-01
**Status**: [Completed]
**Plans:** 3/3 plans complete

Plans:
- [x] 27-01-PLAN.md — Infrastructure Foundation (Postgres & RabbitMQ)
- [x] 27-02-PLAN.md — Pipeline Integration and Verification
- [x] 27-03-PLAN.md — Local Planning Server implementation

### Phase 28: Zero-Bypass Workflow Enforcement

**Goal:** Eliminate unvetted external data and manual workflow bypasses by hardening the execution contract and automating Second Brain lifecycle.
**Requirements**: ENFORCE-01, ENFORCE-02, ENFORCE-03, ENFORCE-04, BRAIN-SERVER-LOCAL
**Status**: [Completed]
**Plans:** 4/4 plans complete

Plans:
- [x] 28-01-PLAN.md — Purge search tools and harden summary schema
- [x] 28-02-PLAN.md — Authority Envelopes and Bypass Detection
- [x] 28-03-PLAN.md — Auto-Managed Second Brain
- [x] 28-04-PLAN.md — Finalize agent prompt purge (ENFORCE-06)

### Phase 29: Firecrawl Control Plane & StrongDM Parity

**Goal:** Transform Firecrawl into a centralized control plane for context management, providing strongdm-style visibility and control over all data flowing into the agent.
**Requirements**: FIRE-CONTROL-01, FIRE-VISIBILITY-01, FIRE-MAPPING-01, FIRE-ENFORCEMENT-01, FIRE-RETENTION-01, FIRE-REPORTING-01, FIRE-HEALTH-01
**Depends on:** Phase 28
**Status**: [Completed 2026-03-23]

Plans:
- [x] 29-01-PLAN.md — Firecrawl Control Plane Bridge (complete)
- [x] 29-02-PLAN.md — Schema registry, extract parity fix, rate limiting (complete)
- [x] 29-03-PLAN.md — Audit filtering, retention cleanup, health metrics (complete)

### Phase 30: Strict Context Determinism & Enforcement Hardening

**Goal:** Achieve full context determinism by routing all internal reads through Planning Server, making authority verification blocking, ensuring executor protocol compliance, and adding policy grant caching.
**Requirements**: ENFORCE-07, ENFORCE-08, CONTEXT-DETERMINISM-01, PERFORMANCE-01
**Depends on:** Phase 29
**Status**: [Completed 2026-03-23]

Plans:
- [x] 30-01-PLAN.md — Authority enforcement on reads, executor protocol fix, Planning Server exclusivity, grant caching, traceability fix
- [x] PLAN.md — Harden enforcement to mandatory and achieve full context determinism

### Phase 31: Project Isolation & Multi-Project Safety

**Goal:** Ensure GSD can be safely reused across multiple projects without data leakage or database collision. Project-specific database identity, path traversal prevention, and isolation documentation.
**Requirements**: ISOLATION-01, ISOLATION-02, ISOLATION-03
**Depends on:** Phase 30
**Status**: [Completed 2026-03-23]

Plans:
- [x] 31-01-PLAN.md — Project-unique DB naming, Planning Server realpath checks, audit project tagging, security documentation

### Phase 32: Enhanced Observability & Debugging Experience

**Goal:** Provide operators with easy-to-use logging, debugging, and diagnostics tools to rapidly identify and resolve issues during execution.
**Requirements**: OBSERV-01, OBSERV-02, OBSERV-03
**Depends on:** Phase 30
**Status**: [Completed 2026-03-23]

Plans:
- [x] 32-01-PLAN.md — Structured logging levels, debug command, execution trace, and error context

---

## v0.4.0 Critical Infrastructure & Security Hardening

**Goal:** Resolve critical execution infrastructure bugs and restore core system guarantees identified by comprehensive brownfield audit.

### Phase 39: Critical Execution Infrastructure Repair

**Goal:** Fix P0 showstopper bugs to restore basic system functionality.
**Requirements**: EXEC-REPAIR-01, EXEC-REPAIR-02, EXEC-REPAIR-03
**Depends on:** None
**Status**: [Complete]
**Plans:** 3/2 plans complete

Plans:
- [x] 39-01-PLAN.md — Implement safeWriteFile, fix safeGit.exec return type, move secondBrain require to top-level
- [x] 39-02-PLAN.md — Create unit tests for safeWriteFile and safeGit.exec, regression and smoke tests

---

### Phase 40: Policy Enforcement Integrity

**Goal:** Make policy grants functional in Postgres mode and eliminate shell injection risks.
**Requirements**: POLICY-INTEGRITY-01, POLICY-INTEGRITY-02
**Depends on:** Phase 39
**Status**: [In Progress]

Plans:
- [ ] 40-01-PLAN.md — Fix checkGrant() Postgres delegation, replace execSync with execFileSync in HTTP clients

---

### Phase 41: Authority System Completion

**Goal:** Implement authority envelope signing and secure fallback handling to fulfill stated guarantees.
**Requirements**: AUTH-COMPLETE-01, AUTH-COMPLETE-02, AUTH-COMPLETE-03
**Depends on:** Phase 39
**Status**: [In Progress]

Plans:
- [ ] 41-01-PLAN.md — Complete authority system: enforce signing on writes, verification on reads, secure fallback, audit logging, and tests

---

### Phase 42: Planning Server Security Hardening

**Goal:** Restrict planning server access and activate AST parsing for proper code analysis.
**Requirements**: PLANNING-SERVER-01, PLANNING-SERVER-02
**Depends on:** Phase 39
**Status**: [Completed] (4/4 plans complete)

Plans:
- [x] 42-01-PLAN.md — Block .planning/ exposure, initialize Tree-Sitter, add degraded mode warnings
- [x] 42-02-PLAN.md — Implement mandatory authentication, rate limiting, concurrency caps, and request validation
- [x] 42-03-PLAN.md — Enhanced health endpoint, comprehensive metrics, and audit logging
- [x] 42-04-PLAN.md — Integration test suite and phase completion summary

---

### Phase 43: Git API Unification & Cache Management

**Goal:** Remove broken safeGit API and make policy cache TTL configurable.
**Requirements**: GIT-UNIFY-01, CACHE-CONFIG-01
**Depends on:** Phase 39
**Status**: [Complete]

Plans:
- [ ] 43-01-PLAN.md — Replace safeGit.exec with execGit, remove safeGit, add POLICY_CACHE_TTL_MS config, wire clearAll() to revocations

---

### Phase 44: Observability & Error Handling Polish

**Goal:** Fix remaining P2/P3 issues and improve diagnostics and code quality.
**Requirements**: OBSERV-POLISH-01, OBSERV-POLISH-02
**Depends on:** Phase 39, Phase 40
**Status**: [Completed 2026-03-26]

Plans:
- [ ] 44-01-PLAN.md — Fix audit.cjs sqlite require guard, remove dead code, add policy decision logging

### Phase 45: Plane-Augmented Context Control

**Goal:** Mirror GSD state to Plane for visibility and test control while keeping .planning/ as source of truth; integrate Firecrawl as unified context layer.
**Requirements**: PLANE-SYNC-01, PLANE-VISIBILITY-01, FIRECRAWL-CONTROL-01
**Depends on:** Phase 44
**Status**: [Retired 2026-03-26; superseded by Phases 47 and 48]

Ledger note: Phase 45 was not executed as planned. `plane-client.cjs` and `tests/plane-client.test.cjs` survive as groundwork, but the original state-mirroring integration never landed and the useful Plane foundation was delivered later by Phases 47 and 48. See `.planning/phases/45-plane-augmented-context-control/45-RETIREMENT.md`.

Plans:
- [ ] 45-01-PLAN.md — Retired; do not execute as originally written

---

### Phase 46: Firecrawl Context Integration

**Goal:** Update GSD agents to use Firecrawl's crawl API for all context retrieval instead of direct file reads and WebSearch.
**Requirements**: FIRECRAWL-CONTROL-02, CONTEXT-UNIFY-01
**Depends on:** Phase 45
**Status**: [Completed 2026-03-26]

Ledger note: `46-01`, `46-02`, and `46-03` now have summary evidence. `46-02` was implemented in the actual local Firecrawl worktree at `/home/bamn/firecrawl-local`, and live smoke verification passed on 2026-03-26.

Plans:
- [x] 46-01-PLAN.md — Unified context spec schema and Firecrawl client extensions
- [x] 46-02-PLAN.md — Firecrawl service adapters and /v1/context/crawl endpoint
- [x] 46-03-PLAN.md — Agent migration to unified context and smoke tests

---

### Phase 47: Plane Roadmap & Issue Hierarchy Sync

**Goal:** Extend Plane sync to include ROADMAP.md → Plane milestones + issues, creating full project visibility.
**Requirements**: PLANE-VISIBILITY-02, PLANE-SYNC-02
**Depends on:** Phase 46
**Status**: [Completed 2026-03-25]

Plans:
- [x] 47-01-PLAN.md — PlaneClient methods + sync orchestration with idempotent upsert, drift detection, force
- [x] 47-02-PLAN.md — Test coverage + command integration + ROADMAP write hook

---

### Phase 48: Plane Checkpoint & Comment Sync

**Goal:** Mirror GSD checkpoints and summaries to Plane as issue comments, providing full traceability.
**Requirements**: PLANE-VISIBILITY-03, PLANE-SYNC-03
**Depends on:** Phase 47
**Status**: [Completed 2026-03-26]

Ledger note: Phase 48 was executed after rewrite/reconciliation against current Phase 46/47 reality. Checkpoint sync now hooks from `cmdCheckpointWrite`, and summary sync is exposed through `gsd-tools plane-sync summary`.

Plans:
- [x] 48-01-PLAN.md — Sync CHECKPOINT.md to Plane phase issue comments
- [x] 48-02-PLAN.md — Summary-to-Plane comment synchronization

---

### Phase 51 — [URGENT INSERT] Enforcement Boundary Restoration

**Goal:** Restore enforcement boundary integrity by making critical gates mandatory, persisting cross-session context, and eliminating bypass vectors. Inserted after Phase 48/49 due to P0 architectural drift identified in 2026-03-25 audit. Does not follow numeric order; ordering is intentional to address critical system guarantees without disrupting planned Plane sync sequence.
**Requirements**: ENFORCE-09, ENFORCE-10, ENFORCE-11, ENFORCE-12, ENFORCE-13, STATE-01, STATE-02, CONFIG-01, METRICS-01
**Depends on:** None (can be inserted immediately)
**Status**: [Completed 2026-03-26]

Plans:
- [x] 51-01-PLAN.md — Pre-condition checking and phase completeness gate
- [x] 51-02-PLAN.md — Research contract mandatory, ITL persistence, auto-chain restriction
- [x] 51-03-PLAN.md — State deduplication, explicit pause/resume, config cleanup, metrics parser

---

### Phase 52 — [QUALRAINT] Truth Enforcement & Hardening

**Goal:** Eliminate divergence between claimed and provable system behavior. Implement secret leakage prevention, validation proof harness, and automated truth audit to close quality gaps identified in 2026-03-25 audit.
**Requirements**: QUALITY-01, QUALITY-02, QUALITY-03, QUALITY-04
**Depends on:** Phase 51 (enforcement gates must be functional)
**Status**: [Completed 2026-03-26; Verified 2026-03-26]

Plans:
- [x] 52-01-PLAN.md — Test coverage closure (≥85% across critical modules)
- [x] 52-02-PLAN.md — SafeLogger + kill tests for secret leakage prevention
- [x] 52-03-PLAN.md — Validation proof system with adversarial test harness
- [x] 52-04-PLAN.md — Truth audit engine (requirement → evidence mapping)

---

### Phase 49: Plane Webhooks & Incremental Sync

**Goal:** Implement real-time Plane → GSD sync via webhooks, enable external triggers and CI integration.
**Requirements**: PLANE-WEBHOOK-01, PLANE-TRIGGER-01
**Depends on:** Phase 48
**Status**: [Completed 2026-03-26]

Ledger note: Phase 49 was implemented on the existing Planning Server + broker surfaces. Inbound Plane events now flow through `POST /v1/plane/webhook`, are normalized, and publish broker triggers without directly mutating planning files.

Plans:
- [x] 49-01-PLAN.md — Webhook listener, event handlers, CI integration

---

### Phase 50: Plane Integration Observability

**Goal:** Add monitoring, diagnostics, and multi-mode support for Plane-augmented deployments.
**Requirements**: OBSERV-PLANE-01, OBSERV-PLANE-02
**Depends on:** Phase 49
**Status**: [Completed 2026-03-26]

Plans:
- [x] 50-01-PLAN.md — gsd:plane-status, structured logs, circuit breaker, metrics

---

## v0.5.0 Model-Facing Memory & Service Resilience

### Phase 53: Second Brain Connection & Fallback Hardening

**Goal:** Eliminate noisy Second Brain auth/pool churn and make Postgres or SQLite backend state deterministic, operator-visible, and safe for repeated test and CLI execution.
**Requirements**: BRAIN-OPS-01, BRAIN-OPS-02, BRAIN-OPS-03
**Depends on:** Phase 50
**Status**: [Complete]
**Plans:** 1/1 plans complete

Plans:
- [x] 53-01-PLAN.md — pool lifecycle cleanup, deterministic fallback, backend health/runbook output

---

### Phase 54: Model-Facing Second Brain via MCP

**Goal:** Make Second Brain directly usable by planner and executor workflows through the GenAI toolkit MCP without bypassing Firecrawl's external-context boundary.
**Requirements**: MEMORY-MCP-01, MEMORY-MCP-02
**Depends on:** Phase 53
**Status**: [Complete]
**Plans:** 2/2 plans complete

Plans:
- [x] 54-01-PLAN.md — MCP-backed memory access contract, degraded-mode enforcement, and planner/executor toolbox split
- [x] 54-02-PLAN.md — workflow memory-pack integration, Firecrawl boundary verification, and executor lifecycle writeback

---

<!-- GSD-AUTHORITY: 54-02-1:d4740e23039f501be1528082a93a6b7b76ca8f84015fe6752362e2363060bce1 -->

## v0.7.0 Truth Enforcement & Drift Elimination

**Goal:** Convert the system from workflow-following correctness into mechanically enforced truth, where claims, verification, degraded mode, and execution history are all provable through observable artifacts and enforced boundaries.

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
