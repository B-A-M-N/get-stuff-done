# Roadmap

## Milestones

- [x] **v0.2.0 Orchestration Integrity** - Phases 15-22 (shipped 2026-03-18)
- [x] **v0.3.0 Trusted Context & Local Memory** - Phases 23-32 (Completed 2026-03-23)

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
**Status**: [Planned]

Plans:
- [ ] 40-01-PLAN.md — Fix checkGrant() Postgres delegation, replace execSync with execFileSync in HTTP clients

---

### Phase 41: Authority System Completion

**Goal:** Implement authority envelope signing and secure fallback handling to fulfill stated guarantees.
**Requirements**: AUTH-COMPLETE-01, AUTH-COMPLETE-02, AUTH-COMPLETE-03
**Depends on:** Phase 39
**Status**: [Planned]

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
**Status**: [Planned]

Plans:
- [ ] 43-01-PLAN.md — Replace safeGit.exec with execGit, remove safeGit, add POLICY_CACHE_TTL_MS config, wire clearAll() to revocations

---

### Phase 44: Observability & Error Handling Polish

**Goal:** Fix remaining P2/P3 issues and improve diagnostics and code quality.
**Requirements**: OBSERV-POLISH-01, OBSERV-POLISH-02
**Depends on:** Phase 39, Phase 40
**Status**: [Planned]

Plans:
- [ ] 44-01-PLAN.md — Fix audit.cjs sqlite require guard, remove dead code, add policy decision logging

### Phase 45: Plane-Augmented Context Control

**Goal:** Mirror GSD state to Plane for visibility and test control while keeping .planning/ as source of truth; integrate Firecrawl as unified context layer.
**Requirements**: PLANE-SYNC-01, PLANE-VISIBILITY-01, FIRECRAWL-CONTROL-01
**Depends on:** Phase 44
**Status**: [Planned]

Plans:
- [x] 45-01-PLAN.md — Implement plane-client, STATE.md mirroring, and configuration

---

### Phase 46: Firecrawl Context Integration

**Goal:** Update GSD agents to use Firecrawl's crawl API for all context retrieval instead of direct file reads and WebSearch.
**Requirements**: FIRECRAWL-CONTROL-02, CONTEXT-UNIFY-01
**Depends on:** Phase 45
**Status**: [Planned]

Plans:
- [x] 46-01-PLAN.md — Unified context spec schema and Firecrawl client extensions
- [x] 46-02-PLAN.md — Firecrawl service adapters and /v1/context/crawl endpoint
- [ ] 46-03-PLAN.md — Agent migration to unified context and smoke tests

---

### Phase 47: Plane Roadmap & Issue Hierarchy Sync

**Goal:** Extend Plane sync to include ROADMAP.md → Plane milestones + issues, creating full project visibility.
**Requirements**: PLANE-VISIBILITY-02, PLANE-SYNC-02
**Depends on:** Phase 46
**Status**: [Planned]

Plans:
- [ ] 47-01-PLAN.md — PlaneClient methods + sync orchestration with idempotent upsert, drift detection, force
- [ ] 47-02-PLAN.md — Test coverage + command integration + ROADMAP write hook

---

### Phase 48: Plane Checkpoint & Comment Sync

**Goal:** Mirror GSD checkpoints and summaries to Plane as issue comments, providing full traceability.
**Requirements**: PLANE-VISIBILITY-03, PLANE-SYNC-03
**Depends on:** Phase 47
**Status**: [Planned]

Plans:
- [ ] 48-01-PLAN.md — Sync CHECKPOINT.md and SUMMARY.md to Plane issue comments

---

### **Phase 51 — [URGENT INSERT] Enforcement Boundary Restoration**

**Goal:** Restore enforcement boundary integrity by making critical gates mandatory, persisting cross-session context, and eliminating bypass vectors. Inserted after Phase 48/49 due to P0 architectural drift identified in 2026-03-25 audit. Does not follow numeric order; ordering is intentional to address critical system guarantees without disrupting planned Plane sync sequence.
**Requirements**: ENFORCE-09, ENFORCE-10, ENFORCE-11, ENFORCE-12, ENFORCE-13, STATE-01, STATE-02, CONFIG-01, METRICS-01
**Depends on:** None (can be inserted immediately)
**Status**: [Planned]

Plans:
- [ ] 51-01-PLAN.md — Pre-condition checking and phase completeness gate
- [ ] 51-02-PLAN.md — Research contract mandatory, ITL persistence, auto-chain restriction
- [ ] 51-03-PLAN.md — State deduplication, explicit pause/resume, config cleanup, metrics parser

---

### Phase 51 — [URGENT INSERT] Enforcement Boundary Restoration

**Goal:** Restore enforcement boundary integrity by making critical gates mandatory, persisting cross-session context, and eliminating bypass vectors. Inserted after Phase 48/49 due to P0 architectural drift identified in 2026-03-25 audit. Does not follow numeric order; ordering is intentional to address critical system guarantees without disrupting planned Plane sync sequence.
**Requirements**: ENFORCE-09, ENFORCE-10, ENFORCE-11, ENFORCE-12, ENFORCE-13, STATE-01, STATE-02, CONFIG-01, METRICS-01
**Depends on:** None (can be inserted immediately)
**Status**: [Planned]

Plans:
- [ ] 51-01-PLAN.md — Pre-condition checking and phase completeness gate
- [ ] 51-02-PLAN.md — Research contract mandatory, ITL persistence, auto-chain restriction
- [ ] 51-03-PLAN.md — State deduplication, explicit pause/resume, config cleanup, metrics parser

---

### Phase 52 — [QUALRAINT] Truth Enforcement & Hardening

**Goal:** Eliminate divergence between claimed and provable system behavior. Implement secret leakage prevention, validation proof harness, and automated truth audit to close quality gaps identified in 2026-03-25 audit.
**Requirements**: QUALITY-01, QUALITY-02, QUALITY-03, QUALITY-04
**Depends on:** Phase 51 (enforcement gates must be functional)
**Status**: [Planned]

Plans:
- [ ] 52-01-PLAN.md — Test coverage closure (≥85% across critical modules)
- [ ] 52-02-PLAN.md — SafeLogger + kill tests for secret leakage prevention
- [ ] 52-03-PLAN.md — Validation proof system with adversarial test harness
- [ ] 52-04-PLAN.md — Truth audit engine (requirement → evidence mapping)

---

### Phase 49: Plane Webhooks & Incremental Sync

**Goal:** Implement real-time Plane → GSD sync via webhooks, enable external triggers and CI integration.
**Requirements**: PLANE-WEBHOOK-01, PLANE-TRIGGER-01
**Depends on:** Phase 48
**Status**: [Planned]

Plans:
- [ ] 49-01-PLAN.md — Webhook listener, event handlers, CI integration

---

### Phase 50: Plane Integration Observability

**Goal:** Add monitoring, diagnostics, and multi-mode support for Plane-augmented deployments.
**Requirements**: OBSERV-PLANE-01, OBSERV-PLANE-02
**Depends on:** Phase 49
**Status**: [Planned]

Plans:
- [ ] 50-01-PLAN.md — gsd:plane-status, structured logs, circuit breaker, metrics

---

$1
... (rest of the file)

<!-- GSD-AUTHORITY: 28-02-3:55f9931d8818c5453cd0c6cab0cfe3a4ad85d0e2435a859b3a4087f2ce91feae -->
<!-- GSD-AUTHORITY: 42-42-04-1:8041f8bf3f51284502fbc7c376f1b954e2c70ec20bae8f12a78fafd89504b6f5 -->
<!-- GSD-AUTHORITY: 47-47-02-1:3784f5e2a75880fd689bb11a77bd059a2573319d43760bf89c2fd82983304f9a -->
<!-- GSD-AUTHORITY: 51-01-1:5e58f732c148a9957695314cba5d79158b71e94281c49af5afe7bcc1cd9cd2a5 -->
<!-- GSD-AUTHORITY: 51-51-02-1:4743a94cde125fb8ed4e85ff6b8d7f72b1396669cc89ff79a43fd55048b83e31 -->
