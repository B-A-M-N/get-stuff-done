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
**Status**: [Planned]

Plans:
- [ ] 39-01-PLAN.md — Implement safeWriteFile, fix safeGit.exec return type, move secondBrain require to top-level

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
- [ ] 41-01-PLAN.md — Wire authority.signFile(), secure fallback secret, fail-secure sandbox error handling, bypass audit logging

---

### Phase 42: Planning Server Security Hardening

**Goal:** Restrict planning server access and activate AST parsing for proper code analysis.
**Requirements**: PLANNING-SERVER-01, PLANNING-SERVER-02
**Depends on:** Phase 39
**Status**: [Planned]

Plans:
- [ ] 42-01-PLAN.md — Block .planning/ exposure, initialize Tree-Sitter, add degraded mode warnings

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

---

## v0.2.0 Orchestration Integrity

... (rest of the file)

<!-- GSD-AUTHORITY: 28-02-3:55f9931d8818c5453cd0c6cab0cfe3a4ad85d0e2435a859b3a4087f2ce91feae -->
