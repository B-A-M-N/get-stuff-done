# 📋 CODEBASE AUDIT & ARCHITECTURAL REVIEW
**Date:** 2026-03-25
**Status:** 🟡 **CRITICAL DRIFT IDENTIFIED**
**Revision:** MAR 25 AUTHORITATIVE REVISION
**Scope:** Complete codebase analysis (1,035 files, 40+ modules)

---

## 🎯 EXECUTIVE SUMMARY

The GSD codebase has **diverged significantly** from its original architecture. What was designed as a clean 11-module CLI tool with "zero runtime dependencies" has evolved into a 40+ module distributed system with PostgreSQL, RabbitMQ, and multiple external service integrations.

**Key Findings:**
- ❌ Architecture documentation is **15+ months out of date**
- ❌ **300% module growth** without corresponding architectural updates
- ❌ **Enforcement boundary eroded** - critical gates are voluntary
- ❌ **Silent error handling** masks critical failures (database, audit, sync)
- ❌ **State machine gaps** cause incorrect progression tracking
- ❌ **Context propagation broken** across session boundaries

**Good News:** All external integrations (Plane, Firecrawl, PostgreSQL, RabbitMQ) are **working correctly**. The system is functional but **fragile**.

**Top Priority:** Fix silent failures and restore enforcement boundary before addressing documentation and refactoring.

---

## 📊 CODEBASE METRICS

| Metric | Count |
|--------|-------:|
| Total code files | 1,035 |
| Library modules (`bin/lib/`) | 40+ |
| Test files | 63 |
| Agent specs | 15+ |
| Workflow definitions | 20+ |
| Documentation pages mapped | 7 (2,423 lines) |
| Largest file (verify.cjs) | 2,862 lines |
| Monolithic files (>900 lines) | 7 |

---

## ✅ WHAT WORKS (Current Capabilities)

### Core System
- ✅ Command dispatcher (30+ commands)
- ✅ Phase planning workflow (discuss → plan → verify)
- ✅ Execution with waves and checkpoints
- ✅ Safe file operations (sandbox, authority, checkpoints)
- ✅ Git integration (atomic commits, scope enforcement)
- ✅ Configuration management
- ✅ State tracking in STATE.md

### External Integrations
- ✅ **Plane** - Roadmap sync, checkpoint comments (fire-and-forget)
- ✅ **Firecrawl** - Context extraction with audit logging
- ✅ **PostgreSQL** - Persistent storage with project isolation
- ✅ **RabbitMQ** - Event bus with disconnected mode
- ✅ **Planning Server** - HTTP API + AST analysis (port 3011)
- ✅ **SearXNG** - Privacy-respecting search with policy enforcement

### Quality Systems
- ✅ Schema validation (Zod)
- ✅ Gate enforcement (when invoked)
- ✅ Sandboxing (path access control)
- ✅ Testing infrastructure (node --test, c8)
- ✅ Multi-provider AI adapters

---

## ❌ WHAT'S BROKEN (Critical Issues)

### 1. Silent Error Handling [PRODUCTION IMPACT: HIGH]

**Problem:** Empty `.catch(() => {})` blocks swallow errors in critical subsystems.

**Locations:**
```
second-brain.cjs:62  - _ensureAuditIndexes()
second-brain.cjs:76  - _initializeProjectIsolation()
roadmap.cjs:333      - Plane sync failure
audit.cjs:335,369    - Audit logging failures
```

**Impact:** Database initialization failures, audit trail loss, Plane desynchronization occur with zero indication.

**Fix Required:** Replace with `console.error(err)` + fallback strategies (retry, degraded mode, user notification).

---

### 2. Enforcement Boundary Erosion [PRODUCTION IMPACT: HIGH]

**Problem:** Original design: ALL writes MUST go through `safeWriteFile`, gates enforced via exit codes. Current: voluntary invocation.

**Evidence:**
- `.planning/audit/arch-enforcement.md`: "Every call into those primitives is voluntary. LLM agent compliance is the only enforcement mechanism."
- `verify phase-completeness` not called before `verify_phase_goal` in execute-phase
- `verify research-contract` never called in plan-phase critical path
- No pre-condition checking at CLI router level
- `_auto_chain_active` bypass has no scope restriction

**Impact:** Agents can skip critical gates → incomplete work, uncommitted changes, false phase completion.

**Fix Required:** Wrap workflow entry points with pre-conditions; make verification steps mandatory (non-zero exit on failure); restrict auto-chain bypass to non-human checkpoints.

---

### 3. State Machine Gaps [PRODUCTION IMPACT: MEDIUM]

**Problem:** No transition guards, paused state is heuristic, duplicate decisions accumulate.

**Locations:**
- `state.cjs:210-237` - `cmdStateAdvancePlan` uses counter, not live SUMMARY file check
- `state.cjs:684` - `buildStateFrontmatter` matches "paused"/"stopped" strings; `cmdStatePause` doesn't exist
- `state.cjs` - `cmdStateAddDecision` lacks deduplication

**Impact:** Incorrect state reporting, unreliable pause detection, duplicate STATE.md entries, false "Phase complete".

**Fix Required:** Add `cmdStatePause`/`cmdStateResume`; verify SUMMARY exists before phase completion; deduplicate decisions by content hash.

---

### 4. Context Propagation Broken [PRODUCTION IMPACT: MEDIUM]

**Problem:** ITL output (ambiguity scores, clarifications, research cues) lost across sessions.

**Evidence:**
- `itl-audit.cjs` produces output that dies with session
- `verify.cjs:550` - "Unresolved Ambiguities" is warning, not error
- `workflows/plan-phase.md` - No call to `verify research-contract` after researcher

**Impact:** Discuss-phase clarifications lost when context resets; plan-phase cannot see discuss outputs; research contract not enforced.

**Fix Required:** Persist ITL output to `{phase_dir}/{padded_phase}-ITL.json`; wire `verify research-contract` into plan-phase critical path; upgrade unresolved ambiguities to error.

---

### 5. Checkpoint Schema Fragmentation [PRODUCTION IMPACT: MEDIUM]

**Problem:** Two incompatible checkpoint schemas with no version field or migration.

**Schemas:**
- `artifact-schema.cjs` - Modern checkpoint format
- `frontmatter.cjs` - Legacy frontmatter-based

**Impact:** Checkpoints from different phases incompatible; verification must handle both; manual editing required for old checkpoints.

**Fix Required:** Consolidate to single schema with `version` field; add migration utility; deprecate legacy format with clear cutoff.

---

### 6. Package Extraction Gap [MAINTENANCE: HIGH]

**Problem:** ITL exists as both:
- `packages/itl/` (standalone npm-versioned package, 492 lines)
- `bin/lib/itl-*.cjs` (bundled internal modules)

**Impact:** Dual maintenance burden, unclear canonical location, risk of divergence.

**Fix Required:** Choose single location (recommend: internal modules since ITL is GSD-specific); remove duplication; document decision.

---

## 🔀 ARCHITECTURAL DRIFT ANALYSIS

### Original Architecture (As Documented 2025-01-24)

**Layers (5):**
```
Command Layer      → User entry points
Workflow Layer     → Orchestration logic
Agent Layer        → Specialized AI roles
CLI Tools Layer    → Low-level utilities
Reference Layer    → Shared knowledge
```

**Constraints:**
- Zero runtime dependencies
- No database, no server process
- Pure file I/O and LLM APIs
- 11 core CLI modules
- File-based state in `.planning/` only
- Hard enforcement via exit codes (1, 13)

### Current Architecture (As Built 2026-03-25)

**Growth:** 11 modules → **40+ modules** (300% increase)

**New Subsystems (29 modules):**
1. **ITL Expansion** (6): itl.cjs, itl-schema.cjs, itl-adapters.cjs, itl-extract.cjs, itl-ambiguity.cjs, itl-audit.cjs, itl-summary.cjs
2. **Context Enrichment** (4): context.cjs, context-store.cjs, context-schema.cjs, context-artifact.cjs
3. **Second Brain** (1 but 1,280 lines): PostgreSQL/SQLite memory + audit + grants
4. **Planning Server** (1 but 914 lines): HTTP API + AST analysis
5. **Plane Integration** (2): plane-client.cjs, roadmap-plane-sync.cjs, checkpoint-plane-sync.cjs
6. **Firecrawl Integration** (1): firecrawl-client.cjs
7. **Broker** (1): RabbitMQ publisher/subscriber
8. **Authority/Sandbox** (2): authority.cjs, sandbox.cjs
9. **Gate/Policy** (2): gate.cjs, policy.cjs

**Dependencies Added:**
- `pg` (PostgreSQL)
- `amqplib` (RabbitMQ)
- `zod` (^4.3.6)
- `web-tree-sitter` + native parsers

**Architecture Changes:**
- ✗ No database → **Primary: Postgres, Fallback: SQLite**
- ✗ No server process → **Planning Server HTTP API (port 3011)**
- ✗ File-only state → **Hybrid: files + DB + events**
- ✗ Clean layers → **Sprawling multi-subsystem**
- ✗ Zero deps → **6+ production dependencies**

**Documentation Status:**
- Last major update: 2025-01-24 (15 months stale)
- Current map: `.planning/codebase/` (2026-03-25, this document)
- Drift assessment: `.planning/audit/ARCHITECTURAL-DRIFT-ASSESSMENT-2026-03-25.md`
- Enforcement review: `.planning/audit/PLANE-INTEGRATION-ENFORCEMENT-REVIEW-2026-03-25.md`

---

## 🧪 TESTING & QUALITY

### Coverage
- **Files:** ~70% (64 src vs 45 test files)
- **Lines:** Likely lower due to monolithic files
- **Gaps:**
  - `itl-audit.cjs` - no test
  - `policy-grant-cache.cjs` - no test
  - `context-artifact.cjs` - no test
  - `second-brain-grant.test.cjs` - placeholder stubs
  - `copilot-install.test.cjs` - stubs

### Missing Test Types
- ❌ Integration tests (end-to-end workflows)
- ❌ Contract tests (Plane API, Firecrawl protocol, RabbitMQ formats)
- ⚠️ Unit tests incomplete for new modules

---

## 🔧 CONFIGURATION & DEBT

### Configuration Drift
- 5+ config keys written but never read
- Environment variables scattered (no single source of truth)
- No validation on load (e.g., `PLANNING_SERVER_TOKEN` required when auth=mandatory)
- Plane sync feature flag inconsistencies

### Technical Debt
1. **Monolithic files** (7 >900 lines): verify.cjs (2,862), second-brain.cjs (1,280), commands.cjs (1,173), state.cjs (1,016), planning-server.cjs (914), phase.cjs (911), init.cjs (904)
2. **Stale worktrees:** 3 orphaned agent worktrees (.claude/worktrees/) consuming 15MB
3. **Silent catches:** Dozens in critical paths
4. **Schema fragmentation:** 2 checkpoint formats
5. **Package duplication:** ITL in two locations

---

## 🚨 OBSERVABILITY GAPS

- ❌ Logging not structured (no JSON, no correlation IDs)
- ❌ Health check incomplete (only AST status, missing subsystems)
- ❌ Metrics exported but no Grafana dashboards/alerts
- ❌ No distributed tracing across services
- ❌ Plane sync operations not logged to STATE.md
- ❌ Degraded modes (AST unavailable, RabbitMQ disconnected) not prominently signaled

---

## 📈 DEPLOYMENT CONCERNS

- ❌ No process manager configs (systemd, pm2, Docker)
- ❌ Port conflicts undetected (Planning Server 3011, Firecrawl 3002, Plane 3003)
- ❌ No startup validation for occupied ports
- ❌ No docker-compose for full stack (Postgres + RabbitMQ + services)

---

## 🎯 REMEDIATION PRIORITIES

### Tier 1: Immediate (Production Risk) - **START HERE**
1. ✅ Fix silent error handling (add logging + fallbacks)
2. ✅ Restore enforcement boundary (make primitives mandatory)
3. ✅ Implement state machine guards (live verification, pause/resume)
4. ✅ Persist ITL output across sessions
5. ✅ Consolidate checkpoint schemas (add versioning)

### Tier 2: High (Developer Experience)
6. Split monolithic files (verify.cjs, second-brain.cjs, etc.)
7. Resolve ITL package duplication
8. Add integration test suite
9. Config validation on startup
10. Plane sync audit trail in STATE.md

### Tier 3: Medium (Observability & Ops)
11. Structured logging (JSON, correlation IDs)
12. Complete health check (all subsystems)
13. Grafana dashboards + alerts
14. Distributed tracing
15. Deployment configs (systemd, docker-compose)

### Tier 4: Low (Documentation)
16. Rewrite architecture docs **OR** prune subsystems to match original scope
17. Single source of truth for environment variables
18. Port conflict detection
19. Contract tests for external APIs
20. Cleanup stale worktrees utility

---

## 📚 REFERENCE DOCUMENTS

This authoritative revision supersedes all previous architectural documentation. Reference files:

- `.planning/codebase/STACK.md` - Tech stack details
- `.planning/codebase/ARCHITECTURE.md` - Current architecture (as-built)
- `.planning/codebase/STRUCTURE.md` - Directory layout and organization
- `.planning/codebase/CONVENTIONS.md` - Coding patterns and style
- `.planning/codebase/TESTING.md` - Test framework and coverage
- `.planning/codebase/INTEGRATIONS.md` - External services configuration
- `.planning/codebase/CONCERNS.md` - Complete issue catalog

**Audit Trail:**
- `.planning/audit/ARCHITECTURAL-DRIFT-ASSESSMENT-2026-03-25.md`
- `.planning/audit/PLANE-INTEGRATION-ENFORCEMENT-REVIEW-2026-03-25.md`
- `.planning/audit/quality-tests.md`
- `.planning/audit/workflow-surfaces.md`
- `ARCHITECTURE-DRIFT-RESPONSE-SUMMARY.md`
- `project_executor_commit_enforcement.md`

---

## 🔒 COMMITMENT

This document represents the **authoritative understanding** of the codebase as of 2026-03-25. All future architectural decisions, refactoring plans, and onboarding should reference this revision.

**Next action:** Address Tier 1 priorities in order, starting with silent error handling.

---

*Generated by parallel gsd-codebase-mapper agents on 2026-03-25*
*Committed: 98a4150*
