# Roadmap

## Milestones

- [x] **v0.1.0 Intent Translation Layer** - Phases 1-14 (shipped 2026-03-17)
- [x] **v0.2.0 Orchestration Integrity** - Phases 15-21 (shipped 2026-03-18)

## Archived Milestones

<details>
<summary>v0.1.0 Intent Translation Layer (Phases 1-14) — SHIPPED 2026-03-17</summary>

Delivered: narrative-first intake, deterministic ITL runtime, Zod schema layer, Claude/Gemini/Kimi/OpenAI adapters, standalone packages/itl module, 100% line-coverage gate.

See full archived roadmap: `.planning/milestones/v0.1.0-ROADMAP.md`

</details>

### Phase 23: Research - Hard Context Sandbox

**Goal:** Implement core sandbox components (Guard module, path checks, and shell interceptor) to block unsanctioned file access.
**Requirements**: SANDBOX-01, SANDBOX-02, SANDBOX-03, SANDBOX-04
**Depends on:** Phase 22
**Plans:** 2/2 plans complete

Plans:
- [ ] 23-01-PLAN.md — Core Guard logic and CLI gate implementation
- [ ] 23-02-PLAN.md — Shell interceptor and verification suite

### Phase 24: Research - Canonical Identity & Storage

**Goal:** Implement the ContextArtifact schema, deterministic ID generator, and file-backed store for project context.
**Requirements**: SCHEMA-CANONICAL, ID-DETERMINISTIC, STORE-FILE-BACKED, CLI-INTEGRATION
**Depends on:** Phase 23
**Plans:** 2/3 plans executed

Plans:
- [ ] 24-01-PLAN.md — Schema and Identity Foundation
- [ ] 24-02-PLAN.md — Artifact Storage and Verification
- [ ] 24-03-PLAN.md — CLI Integration

### Phase 25: Research - Unified Normalization Pipeline

**Goal:** Implement a unified normalization pipeline that transforms internal planning files and external documentation into validated `ContextArtifact` objects for the artifact store.
**Requirements**: NORMAL-INTERNAL, NORMAL-FIRE, NORMAL-PARITY
**Depends on:** Phase 24
**Plans:** 2/2 plans complete

Plans:
- [ ] 25-01-PLAN.md — Implementation of Normalization Adapters
- [ ] 25-02-PLAN.md — Pipeline Integration & Parity Testing

### Phase 26: Research & Implement AST-Aware Normalization (Tree-Sitter)

**Goal:** Integrate Tree-Sitter into the normalization pipeline to extract symbols and dependencies for the independent second brain.
**Requirements**: AST-SCHEMA-01, AST-PARSER-01, AST-INTERNAL-01, AST-EXTERNAL-01, AST-VERIFY-01
**Depends on:** Phase 25
**Plans:** 2/2 plans complete

Plans:
- [ ] 26-01-PLAN.md — Schema Extension and AST Parser Implementation
- [ ] 26-02-PLAN.md — Pipeline Integration and Verification

### Phase 27: Independent Memory Wiring (Postgres/RabbitMQ/Local Second Brain)

**Goal:** Implement the isolated memory foundation using Postgres and RabbitMQ to serve as the project's local consciousness.
**Requirements**: BRAIN-INFRA-01, BRAIN-STORAGE-01, BRAIN-INGEST-01, BRAIN-VERIFY-01
**Depends on:** Phase 26
**Plans:** 3/3 plans complete

Plans:
- [ ] 27-01-PLAN.md — Infrastructure Foundation (Postgres & RabbitMQ)
- [ ] 27-02-PLAN.md — Pipeline Integration and Verification
- [ ] 27-03-PLAN.md — Local Planning Server implementation

### Phase 28: Zero-Bypass Workflow Enforcement

**Goal:** Eliminate unvetted external data and manual workflow bypasses by hardening the execution contract and automating Second Brain lifecycle.
**Requirements**: ENFORCE-01, ENFORCE-02, ENFORCE-03, ENFORCE-04, BRAIN-SERVER-LOCAL
**Depends on:** Phase 27
**Plans:** 3/3 plans created

Plans:
- [ ] 28-01-PLAN.md — Purge search tools and harden summary schema
- [ ] 28-02-PLAN.md — Authority Envelopes and Bypass Detection
- [ ] 28-03-PLAN.md — Auto-Managed Second Brain

---

## v0.2.0 Orchestration Integrity

... (rest of the file)
