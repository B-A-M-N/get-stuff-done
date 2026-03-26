# Requirements: get-stuff-done

**Defined:** 2026-03-17
**Core Value:** Runtime-bound orchestration integrity — enforcement that cannot be bypassed by following a different workflow path

## v0.2 Requirements

### ENFORCE — Runtime Gate Enforcement

- [x] **ENFORCE-01**: Orchestrator refuses to proceed when `clarification_status: blocked` in STATE.md (applies to plan-phase, execute-phase, autonomous)
- [x] **ENFORCE-02**: `verify checkpoint-response` is a mandatory hard gate in execute-phase — wave cannot advance unless it passes
- [x] **ENFORCE-03**: `resume-project` routes to unblock flow when `clarification_status: blocked` rather than silently routing to execute/plan
- [x] **ENFORCE-04**: `autonomous` checks clarification_status per-phase and halts with explanation when blocked
- [x] **ENFORCE-05**: `verify research-contract` called as mandatory gate in `plan-phase` inline research path — not just in standalone `/gsd:research-phase` (audit found it is currently absent from plan-phase critical path)

### CHECKPOINT — Persistent Checkpoint Artifact

- [x] **CHECKPOINT-01**: Canonical CHECKPOINT.md written to phase directory on every blocking checkpoint
- [x] **CHECKPOINT-02**: CHECKPOINT.md re-read and validated by resume-project before routing continuation
- [x] **CHECKPOINT-03**: Checkpoint lifecycle tracked in STATE.md (pending / awaiting-response / resolved)
- [x] **CHECKPOINT-04**: `checkpointArtifactSchema` (Zod) defines the canonical shape of CHECKPOINT.md

### CONTEXT — Pre-flight Context Enrichment

- [x] **CONTEXT-01**: Before escalating clarification to user, system harvests STATE.md decisions, CONTEXT.md canonical_refs, and PLAN.md for auto-resolution candidates
- [x] **CONTEXT-02**: Clarification prompts include what was found in ambient state (pre-answered or narrowed questions)
- [x] **CONTEXT-03**: `discuss-seed` receives relevant ambient context fields alongside the narrative input
- [x] **CONTEXT-04**: ITL output (ambiguity score, lockability, clarification.mode) persisted to `{phase_dir}/{phase}-ITL.json` — currently lost when the discuss-phase session ends; plan-phase in a new window starts blind

### SURFACE — Workflow Surface Hardening

- [x] **SURFACE-01**: `research-phase` and `validate-phase` get blocked-state gate check at entry
- [x] **SURFACE-02**: `autonomous` gets per-phase blocked-state awareness and halts with a clear explanation and resume path
- [x] **SURFACE-03**: Orphaned workflow files reconciled — diagnose-issues, discovery-phase, node-repair, transition, verify-phase either wired to commands/gsd/ or removed with changelog note

### TEST — Scenario & Contract Tests

- [x] **TEST-01**: End-to-end behavioral test: ambiguous input → clarification fired → blocked state written to STATE.md → resume detects blocked → user resolves → continuation only after valid resolution
- [x] **TEST-02**: Gate behavior tests: plan-phase and execute-phase reject invocation when `clarification_status: blocked`
- [x] **TEST-03**: Checkpoint artifact lifecycle test: CHECKPOINT.md written on block, validated on resume, cleared on resolve
- [x] **TEST-04**: Execution artifact contract test: SUMMARY.md validated against `executionSummarySchema` post-execution
- [x] **TEST-05**: 5 currently untracked test files committed to git (checkpoint-contract, checkpoint-validator, state-clarification, verify-context-contract, verify-research-contract) — invisible to CI on clean checkout

### SCHEMA — Artifact Schema Hardening

- [x] **SCHEMA-01**: `checkpointArtifactSchema` (Zod) — canonical shape for persisted CHECKPOINT.md (status, type, why_blocked, what_is_uncertain, choices, allow_freeform, resume_condition, resolved_at)
- [x] **SCHEMA-02**: `executionSummarySchema` (Zod) — canonical shape for SUMMARY.md (one_liner, work_completed, key_files, verification, requirements_completed)
- [x] **SCHEMA-03**: `cmdVerifySummary` upgraded to validate against `executionSummarySchema` (currently only checks file count)
- [x] **SCHEMA-04**: `checkpointResponseSchema` (Zod) formalizes the agent checkpoint return contract — replaces manual field-by-field checking in `cmdVerifyCheckpointResponse` (verify.cjs line 211)
- [x] **SCHEMA-05**: `interpretationResultSchema` / `baseSeedSchema` decomposed into composable sub-schemas — the current fat combined blob (interpretation + ambiguity + lockability + audit + route + clarification) is one opaque contract that's hard to extend and test in isolation

## v3 Requirements (Deferred)

- Hard state machine conductor runtime with explicit finite state transitions (beyond workflow-and-validator architecture)
- Escalation ladder for repeated clarifications (round 1-2 re-ask, round 3+ force decision or defer)
- Auto-retry with escalating model size on checkpoint failure
- Isolated test runner for full workflow simulation without live Claude calls

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rewrite planner/executor logic | Constraint from v0.1.0: enhance don't replace |
| New ITL providers | v0.1.0 shipped Claude/Gemini/Kimi/OpenAI adapters — sufficient for now |
| UI / web interface | CLI-first; web is a separate product surface |
| Multi-user / team collaboration | Single-user tool scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 15 | Complete |
| SCHEMA-04 | Phase 15 | Complete |
| SCHEMA-05 | Phase 15 | Complete |
| CHECKPOINT-04 | Phase 15 | Complete |
| CHECKPOINT-01 | Phase 16 | Complete |
| CHECKPOINT-02 | Phase 16 | Complete |
| CHECKPOINT-03 | Phase 16 | Complete |
| ENFORCE-01 | Phase 17 | Complete |
| ENFORCE-02 | Phase 17 | Complete |
| ENFORCE-03 | Phase 17 | Complete |
| ENFORCE-04 | Phase 17 | Complete |
| ENFORCE-05 | Phase 17 | Complete |
| CONTEXT-01 | Phase 18 | Complete |
| CONTEXT-02 | Phase 18 | Complete |
| CONTEXT-03 | Phase 18 | Complete |
| CONTEXT-04 | Phase 18 | Complete |
| SURFACE-01 | Phase 19 | Complete |
| SURFACE-02 | Phase 19 | Complete |
| SURFACE-03 | Phase 19 | Complete |
| SCHEMA-02 | Phase 19 | Complete |
| SCHEMA-03 | Phase 19 | Complete |
| TEST-01 | Phase 20 | Complete |
| TEST-02 | Phase 20 | Complete |
| TEST-03 | Phase 20 | Complete |
| TEST-04 | Phase 20 | Complete |
| TEST-05 | Phase 20 | Complete |
| SANDBOX-01 | Phase 23 | Complete |
| SANDBOX-02 | Phase 23 | Complete |
| SANDBOX-03 | Phase 23 | Complete |
| SANDBOX-04 | Phase 23 | Complete |
| EXEC-REPAIR-01 | Phase 39 | Complete |
| EXEC-REPAIR-02 | Phase 39 | Complete |
| EXEC-REPAIR-03 | Phase 39 | Complete |

**Coverage:**
- v0.2 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-18 — All requirements complete and verified*
| SCHEMA-CANONICAL | Phase 24 | Complete |
| ID-DETERMINISTIC | Phase 24 | Complete |
| STORE-FILE-BACKED | Phase 24 | Complete |
| CLI-INTEGRATION | Phase 24 | Complete |
| NORMAL-INTERNAL | Phase 25 | Complete |
| NORMAL-FIRE | Phase 25 | Complete |
| NORMAL-PARITY | Phase 25 | Complete |
| CLI-PARITY | Phase 25 | Complete |
| BRAIN-SERVER-LOCAL | Phase 27 | Complete |

<!-- GSD-AUTHORITY: 28-02-3:f99811b45e84926c5b636e0b397449694f995d5695628f49c48d8cc8045f8930 -->


### ENFORCE — Zero-Bypass Extensions (v0.3)

- [x] **ENFORCE-06**: Zero-approval theater — WebSearch/WebFetch removed from CLI and agent prompts; all external context via Firecrawl only
- [x] **ENFORCE-07**: Authority envelope signing enforced for writes to restricted paths (sandbox + signature verification)
- [x] **ENFORCE-08**: Authority envelope verification for reads of restricted files (blocking exit(13) on invalid)
- [x] **ENFORCE-09**: Pre-condition checking and phase completeness gate
- [x] **ENFORCE-10**: Workflow pre-condition gate standardization

---

## v0.3 Requirements

### CONTEXT — Strict Context Determinism

- [ ] **CONTEXT-DETERMINISM-01**: All internal file access goes through Planning Server — agents cannot use direct file reads for code/docs; audit/logging unified
- [ ] **PERFORMANCE-01**: Policy grant caching — Firecrawl client caches policy checks for 60s to reduce DB load

### ISOLATION — Multi-Project Safety

- [x] **ISOLATION-01**: Project-unique database identity — Postgres DB name includes project root hash to prevent collision
- [x] **ISOLATION-02**: Planning Server path traversal prevention — uses realpath to ensure files served are within project root
- [x] **ISOLATION-03**: Audit project segregation — all audit records tagged with project identifier for multi-project deployments

### OBSERV — Enhanced Observability

- [x] **OBSERV-01**: Structured logging — configurable log levels (debug/info/warn/error) with timestamps and colors
- [x] **OBSERV-02**: Debug log command — `gsd-tools debug log --follow` streams recent activity with filtering
- [x] **OBSERV-03**: Error context capture — on failure, write structured JSON with command, args, cwd, stack for post-mortem

### PLANE — Plane-Augmented Context Control

- [x] **PLANE-SYNC-01**: STATE.md changes mirrored to Plane project metadata via updateProjectMetadata API
- [x] **PLANE-VISIBILITY-01**: Plane sync is async best-effort, non-blocking, continues working when Plane unavailable

### FIRE — Firecrawl Control Plane & StrongDM Parity

- [ ] **FIRE-CONTROL-01**: Centralized access to Firecrawl via `gsd-tools` (all operations funnel through `firecrawl-client.cjs`)
- [ ] **FIRE-VISIBILITY-01**: Schema-validated extraction of external documentation — all external context uses `extract` with approved schemas, not `scrape`
- [ ] **FIRE-MAPPING-01**: Verified Context Mapping — domain-to-schema registry enabling automatic selection of extraction schema based on URL domain
- [ ] **FIRE-ENFORCEMENT-01**: Rate limiting and quota enforcement per domain pattern to prevent abuse and manage Firecrawl load
- [ ] **FIRE-RETENTION-01**: Audit log lifecycle management — partitioned storage, TTL-based cleanup, and archival strategy
- [ ] **FIRE-REPORTING-01**: Queryable audit logs with filters (date range, domain, action, status) for compliance and debugging
- [ ] **FIRE-HEALTH-01**: Metrics dashboard showing error rates, latency by domain, and sync health status

---

## v3 Requirements (Deferred)

- Automated schema discovery from documentation (FIRE-MAPPING-02)
- Distributed rate limiting across multiple GSD instances
- Real-time alerting on anomaly patterns
- Integration with external SIEM/log aggregation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replace Firecrawl with custom scraper | Firecrawl is production-ready, self-hostable, and provides extract/map |
| Build separate audit UI | CLI + Grafana/Prometheus for now; web UI is separate product |
| Multi-tenant audit isolation | Single-user tool scope |
| PII redaction in logs | Assume trusted environment; can add later if needed |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENFORCE-01 | Phase 17 | Complete |
| ENFORCE-02 | Phase 17 | Complete |
| ENFORCE-03 | Phase 17 | Complete |
| ENFORCE-04 | Phase 17 | Complete |
| ENFORCE-05 | Phase 17 | Complete |
| CHECKPOINT-04 | Phase 15 | Complete |
| CHECKPOINT-01 | Phase 16 | Complete |
| CHECKPOINT-02 | Phase 16 | Complete |
| CHECKPOINT-03 | Phase 16 | Complete |
| CONTEXT-01 | Phase 18 | Complete |
| CONTEXT-02 | Phase 18 | Complete |
| CONTEXT-03 | Phase 18 | Complete |
| CONTEXT-04 | Phase 18 | Complete |
| SURFACE-01 | Phase 19 | Complete |
| SURFACE-02 | Phase 19 | Complete |
| SURFACE-03 | Phase 19 | Complete |
| SCHEMA-02 | Phase 19 | Complete |
| SCHEMA-03 | Phase 19 | Complete |
| TEST-01 | Phase 20 | Complete |
| TEST-02 | Phase 20 | Complete |
| TEST-03 | Phase 20 | Complete |
| TEST-04 | Phase 20 | Complete |
| TEST-05 | Phase 20 | Complete |
| SANDBOX-01 | Phase 23 | Complete |
| SANDBOX-02 | Phase 23 | Complete |
| SANDBOX-03 | Phase 23 | Complete |
| SANDBOX-04 | Phase 23 | Complete |
| SCHEMA-CANONICAL | Phase 24 | Complete |
| ID-DETERMINISTIC | Phase 24 | Complete |
| STORE-FILE-BACKED | Phase 24 | Complete |
| CLI-INTEGRATION | Phase 24 | Complete |
| NORMAL-INTERNAL | Phase 25 | Complete |
| NORMAL-FIRE | Phase 25 | Complete |
| NORMAL-PARITY | Phase 25 | Complete |
| CLI-PARITY | Phase 25 | Complete |
| AST-SCHEMA-01 | Phase 26 | Complete |
| AST-PARSER-01 | Phase 26 | Complete |
| AST-INTERNAL-01 | Phase 26 | Complete |
| AST-EXTERNAL-01 | Phase 26 | Complete |
| AST-VERIFY-01 | Phase 26 | Complete |
| BRAIN-INFRA-01 | Phase 27 | Complete |
| BRAIN-STORAGE-01 | Phase 27 | Complete |
| BRAIN-INGEST-01 | Phase 27 | Complete |
| BRAIN-VERIFY-01 | Phase 27 | Complete |
| BRAIN-SERVER-LOCAL | Phase 27 | Complete |
| ENFORCE-06 | Phase 28 | Complete |
| ENFORCE-07 | Phase 30 | Complete |
| ENFORCE-08 | Phase 30 | Complete |
| ENFORCE-09 | Phase 51 | Complete |
| ENFORCE-10 | Phase 51 | Complete |
| CONTEXT-DETERMINISM-01 | Phase 30 | Complete |
| PERFORMANCE-01 | Phase 30 | Complete |
| ISOLATION-01 | Phase 31 | Complete |
| ISOLATION-02 | Phase 31 | Complete |
| ISOLATION-03 | Phase 31 | Complete |
| OBSERV-01 | Phase 32 | Complete |
| OBSERV-02 | Phase 32 | Complete |
| OBSERV-03 | Phase 32 | Complete |
| FIRE-CONTROL-01 | Phase 29 | In Progress |
| FIRE-VISIBILITY-01 | Phase 29 | In Progress |
| FIRE-MAPPING-01 | Phase 29 | In Progress |
| FIRE-ENFORCEMENT-01 | Phase 29 | In Progress |
| FIRE-RETENTION-01 | Phase 29 | In Progress |
| FIRE-REPORTING-01 | Phase 29 | In Progress |
| FIRE-HEALTH-01 | Phase 29 | In Progress |
| PLANNING-SERVER-01 | Phase 42 | Complete |
| PLANNING-SERVER-02 | Phase 42 | Complete |
| PLANE-SYNC-01 | Phase 45 | Complete |
| PLANE-VISIBILITY-01 | Phase 45 | Complete |
| FIRECRAWL-CONTROL-02 | Phase 46 | Complete |
| CONTEXT-UNIFY-01 | Phase 46 | Complete |
| PLANE-VISIBILITY-02 | Phase 47 | Complete |
| PLANE-SYNC-02 | Phase 47 | Complete |

**Coverage:**
- v0.2 requirements: 39 total ✓
- v0.3 requirements: 7 total (in progress)
- Unmapped: 0 ✓

---

*Last updated: 2026-03-23 — Added v0.3 Firecrawl Control Plane requirements*
<!-- GSD-AUTHORITY: 29-02-1:PENDING -->
