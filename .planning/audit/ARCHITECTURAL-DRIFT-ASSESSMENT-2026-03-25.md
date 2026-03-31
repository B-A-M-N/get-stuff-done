# Architectural Drift Assessment

**Assessment Date:** 2026-03-25
**Assessor:** Claude Code (systematic analysis)
**Project:** get-stuff-done (GSD)
**Current Milestone:** v0.4.0 Critical Infrastructure & Security Hardening (Phase 47 complete)

---

## Executive Summary

**Status:** 🟡 **Significant Architectural Drift Detected**

The GSD codebase has evolved dramatically from its originally documented architecture. The system has expanded from a clean 5-layer meta-prompting framework into a complex distributed-like system with database integration, embedded servers, and multiple external control planes. **The architectural documentation has not kept pace with implementation**, creating a dangerous knowledge gap between what the docs say and how the system actually works.

**Key Findings:**
- ❌ Architecture documentation is 15+ months out of date (last updated 2025-01-24)
- ❌ Tech stack documentation claims "zero runtime dependencies" but system requires Postgres, RabbitMQ, Zod
- ❌ 300% module growth: original 11 CLI modules → 40+ modules with overlapping responsibilities
- ❌ Enforcement boundary has eroded: critical gates are voluntary, not mandatory
- ❌ Configuration drift: 5+ config keys written but never read
- ❌ Schema fragmentation: 2 incompatible checkpoint schemas with no cross-reference
- ❌ Incomplete package extraction: ITL is both a package and internal modules
- ⚠️ New critical subsystems lack architectural documentation entirely (Second Brain, Planning Server, Firecrawl Control Plane, Plane Sync)

---

## 1. Original Architecture (As Documented)

### 1.1 Layered Design (5 Layers)

```
Command Layer (commands/gsd/*.md)     → User entry points
Workflow Layer (workflows/*.md)       → Orchestration logic
Agent Layer (agents/*.md)             → Specialized AI roles
CLI Tools Layer (bin/gsd-tools.cjs)   → Low-level utilities
Reference Layer (references/*.md)     → Shared knowledge
```

**Core CLI Modules (11):**
- `core.cjs` - Error handling, utilities
- `state.cjs` - STATE.md management
- `phase.cjs` - Phase directory operations
- `roadmap.cjs` - ROADMAP.md management
- `config.cjs` - Configuration
- `verify.cjs` - Validation
- `template.cjs` - Template filling
- `frontmatter.cjs` - YAML operations
- `init.cjs` - Context loading
- `commands.cjs` - Command routing (later addition)
- `model-profiles.cjs` - Model resolution

### 1.2 Design Principles

1. **Fresh Context Per Agent** - No context rot
2. **Thin Orchestrators** - Workflows don't do heavy lifting
3. **File-Based State** - All state in `.planning/` (no database)
4. **Absent = Enabled** - Feature flag defaults
5. **Defense in Depth** - Gates, verification loops, atomic commits

### 1.3 Explicit Boundaries

**No external dependencies:**
- No database
- No server process
- No external services
- Pure file I/O and LLM APIs

**Enforcement Boundary:**
- Hard stops via exit codes (1, 13)
- Three primitives: `commit-task`, `gate enforce`, `checkpoint write`
- Validation via `verify integrity` (exit code based)

---

## 2. Current Architectural Reality

### 2.1 System Has Grown to 40+ CLI Modules

The `get-stuff-done/bin/lib/` directory has ballooned to **40 modules**:

**Original 11** (still present but some enhanced):
core, state, phase, roadmap, config, verify, template, frontmatter, init, model-profiles, commands

**New Major Subsystems (29 new modules):**

#### ITL Expansion (6 modules)
- `itl.cjs` - Main ITL coordinator
- `itl-schema.cjs` - Canonical Zod schemas
- `itl-adapters.cjs` - Provider adapter registry
- `itl-extract.cjs` - Narrative extraction
- `itl-ambiguity.cjs` - Ambiguity detection
- `itl-audit.cjs` - SQLite audit logging
- `itl-summary.cjs` - Summary generation

#### Context Enrichment (4 modules)
- `context.cjs` - Context management
- `context-store.cjs` - Artifact storage
- `context-schema.cjs` - Context artifact schemas
- `context-artifact.cjs` - Artifact model

#### Second Brain (3 modules)
- `second-brain.cjs` - Knowledge graph interface
- `brain-manager.cjs` - Brain lifecycle
- `policy-grant-cache.cjs` - Policy caching

#### Authority & Policy (3 modules)
- `authority.cjs` - Envelope signing/verification
- `policy.cjs` - Policy enforcement
- `openbox-policy.cjs` - Default policy

#### Firecrawl Integration (3 modules)
- `firecrawl-client.cjs` - External service client
- `firecrawl-normalizer.cjs` - Data transformation
- `searxng-client.cjs` - Search provider

#### Planning Server (2 modules)
- `planning-server.cjs` - Embedded HTTP server
- `audit.cjs` - Server audit logging

#### AST & Normalization (4 modules)
- `ast-parser.cjs` - Tree-sitter wrapper
- `internal-normalizer.cjs` - Internal doc pipeline
- `firecrawl-normalizer.cjs` - External doc pipeline
- `schema-registry.cjs` - Schema management

#### Observability (2 modules)
- `next-step.cjs` - Progress tracking
- `profile-pipeline.cjs` - User profiling

#### Plane Integration (2 modules)
- `plane-client.cjs` - Plane API client
- `roadmap-plane-sync.cjs` - Sync orchestration

#### Infrastructure (3 modules)
- `sandbox.cjs` - Path & shell guards
- `milestone.cjs` - Milestone operations
- `gate.cjs` - Gate management
- `broker.cjs` - Message broker (RabbitMQ)
- `artifact-schema.cjs` - Artifact validation

### 2.2 New Dependencies (Breaking "No Server, No DB" Rule)

**package.json dependencies:**
```json
{
  "dependencies": {
    "pg": "^8.20.0",           // PostgreSQL client
    "amqplib": "^0.10.9",      // RabbitMQ client
    "web-tree-sitter": "^0.26.7", // AST parsing
    "zod": "^4.3.6"            // Schema validation
  }
}
```

**Architecture Principle Violated:** Original design explicitly stated "No database, no server, no external dependencies." This was a core simplicity guarantee.

**Reality:** The system now requires:
- PostgreSQL (optional but documented as primary)
- RabbitMQ (for message queue)
- Tree-Sitter WASM modules (4 files in `bin/wasm/`)
- SQLite (audit logging fallback)

### 2.3 Package Extraction Inconsistency

**What Should Be:** The ITL was extracted to `packages/itl/` as a standalone package.

**Reality:** Both exist simultaneously:
- `packages/itl/` (standalone package) ✓
- `get-stuff-done/bin/lib/itl-*.cjs` (internal modules) ✓
- `get-stuff-done/workflows/*.md` still reference internal paths

**Problem:** Duplication creates maintenance burden and version skew risk. The standalone package exports only `interpret_narrative`, but the internal modules include adapters, schema, audit, summary — the package is incomplete or the internal modules are orphaned.

### 2.4 New Critical Subsystems Without Documentation

The following major subsystems appear in the code but have **no corresponding architecture documentation**:

1. **Planning Server** (`planning-server.cjs`) - An embedded Express-like HTTP server that routes file reads through authority checks. Port: configurable via `GSD_PLANNING_HOST`. This is a fundamental architectural shift: the system now runs a server process.

2. **Second Brain** (`second-brain.cjs`, `brain-manager.cjs`) - A knowledge graph using Postgres + RabbitMQ. Described in STATE.md as "the project's local consciousness." This is a major distributed systems component.

3. **Firecrawl Control Plane** - Firecrawl is no longer just a crawler; it's described as a "centralized control plane for context management, providing strongdm-style visibility."

4. **Plane Integration** - Bi-directional sync with Plane (project management tool). Roadmap, checkpoints, and summaries are mirrored to Plane issues and comments.

5. **Context Artifact Store** - A unified content-addressed storage system for normalized planning documents and codebase analysis.

6. **Sandbox** - A guard module that intercepts shell operations and path access. Introduces mandatory security boundaries.

7. **Authority System** - Cryptographic envelope signing for all writes and reads. Introduced in Phase 28, completed in Phase 41 (planned).

None of these appear in the 2025-01-24 architecture docs. The `.planning/codebase/ARCHITECTURE.md` is **15 months stale**.

---

## 3. Critical Architectural Gaps

### 3.1 Enforcement Boundary Erosion (Highest Risk)

The original architecture defined a clear **enforcement boundary** using exit codes. The audit report (`.planning/audit/arch-enforcement.md`) confirms this boundary has eroded:

**Gap 1: Voluntary Enforcement**
- `gsd-tools.cjs` has **no pre-condition checking** at CLI router level
- Any workflow command can be invoked in **any project state**
- Enforcement relies entirely on LLM agent compliance with prose instructions

**Gap 2: Missing Verification Gates**
- `verify phase-completeness` **never called** before `verify_phase_goal` in `execute-phase`
- `verify research-contract` **never called** in `plan-phase` critical path after researcher returns
- `verify checkpoint-response` is **workflow-described, not mandatory**

**Gap 3: Auto-Chain Bypass**
- `_auto_chain_active` flag has **no scope restriction**
- Any agent can set it
- Does NOT exclude `checkpoint:human-action` type in code

**Gap 4: State Machine Weaknesses**
- No transition guards: `plan-phase` can run mid-execution, `execute-phase` can run with no plans
- `cmdStateAdvancePlan` transitions to "Phase complete" based on **counter field**, not live disk check
- Paused state is **heuristic string matching**, not explicit state
- `cmdStateAddDecision` has **no deduplication**

### 3.2 Configuration Drift

**Written but never read (dead config):**

| Config Key | Written By | Read By | Impact |
|------------|-----------|---------|--------|
| `mode` | `new-project.md` | N/A | Silent default to interactive |
| `granularity` | `new-project.md` | N/A | Unused |
| `workflow.auto_advance` | workflows | N/A (separate CLI call required) | New workflows default to false silently |
| `adversarial_test_harness` | Unknown | Not in VALID_CONFIG_KEYS | Stale config, no implementation |
| `planning.search_gitignored` | config.cjs | Not used in search logic | Flag exists but no effect |

**Risk:** Users think they're configuring behavior that isn't active. Silent failures degrade trust.

### 3.3 Schema Fragmentation

**Two incompatible checkpoint schemas coexist:**

1. **ITL Clarification Checkpoint Schema** (`clarificationCheckpointSchema` in `itl-ambiguity.cjs`)
   - Used during `discuss-phase` for ambiguity resolution
   - Fields: `type`, `severity`, `message`, `evidence`, `requires_escalation`

2. **Agent Return Contract Checkpoint** (`verify checkpoint-response` in `verify.cjs`)
   - Used by agents to report progress/halted states
   - Fields: `checkpoint: { type, path, payload }`

**No cross-reference or shared type.** They evolve independently, creating drift risk. Phase 16 (Checkpoint Artifact Lifecycle) attempted to unify but apparently didn't.

**Additional schema issues:**
- `deferred_ideas` and `out_of_scope` in `discussionSeedSchema` **always populated from same source** (`anti_requirements`) → duplicate data
- `lockabilityFindingSchema` uses single-value enum `['blocker']` → no gradations possible without breaking change
- `Performance Metrics` table written by `cmdStateRecordMetric` but **never parsed** by `parseStateSnapshot` → write-onlytelemetry

### 3.4 Context Propagation Failures

**ITL Output Not Persisted:**
- Ambiguity score, findings, and `clarification.mode = blocking` determination exist **only for lifespan of discuss-phase session**
- When `plan-phase` runs in a new context window, it never sees them
- `verify research-contract` exists but **never called in plan-phase critical path**

**Result:** The adversarial ambiguity gate that's supposed to prevent unstable constraints from hardening into scope is effectively bypassed in normal operation.

**PRD Express Path** generates CONTEXT.md without `research_cues` block, further weakening context handoff.

### 3.5 Documentation Lag

**Outdated Documents:**
- `docs/ARCHITECTURE.md` - Last updated 2025-01-24 ❌
- `.planning/codebase/ARCHITECTURE.md` - Same date ❌
- `docs/stack.md` analysis - 2025-02-14, claims "zero runtime dependencies" ❌

**Missing Documents Entirely:**
- No ADRs (Architecture Decision Records) for major shifts
- No documentation for Planning Server, Second Brain, Firecrawl Control Plane, Plane Sync
- No updated component diagrams showing current system
- No migration guide from v0.1 architecture to current state

**Help Documentation** (`commands/gsd/help.md`) is updated and accurate, but it's user-facing, not architect-level.

---

## 4. Root Cause Analysis

### 4.1 Feature-First Culture

The roadmap shows aggressive phase-based delivery:
- v0.1.0: ITL (14 phases) ✓
- v0.2.0: Orchestration Integrity (8 phases) ✓
- v0.3.0: Trusted Context & Local Memory (10 phases) ✓
- v0.4.0: Critical Infrastructure (12+ phases) in progress

**Each milestone adds entirely new subsystems** without revisiting the architectural baseline. The pressure to deliver phases (average 15min execution time) prioritizes implementation over documentation.

### 4.2 Lack of Architecture Governance

- **No ADR process** - Major decisions (introduce Postgres, add HTTP server, extract ITL) aren't recorded with rationales and trade-offs
- **No architecture review checkpoints** - Phases complete based on requirement coverage, not architectural consistency
- **Audit reports exist but aren't acted upon** - The `arch-enforcement.md` audit identifies gaps but they remain open (status: "Planned" in ROADMAP.md)

### 4.3 Documentation as Afterthought

The `.planning/codebase/` directory is meant for brownfield mapping **of the target project**, not GSD itself. There's no equivalent "meta" documentation for GSD's own architecture. The docs in `docs/` and `.planning/codebase/` are static artifacts created during initial development.

---

## 5. Risk Assessment

| Risk | Severity | Likelihood | Impact | Mitigation Priority |
|------|----------|------------|--------|---------------------|
| **Silent enforcement bypass** | Critical | High | System guarantees invalidated | 🔴 P0 |
| **Stale architecture docs** | Critical | Certain | Onboarding errors, bad decisions | 🔴 P0 |
| **Configuration drift** | High | Medium | User confusion, support burden | 🟠 P1 |
| **Schema fragmentation** | High | Medium | Checkpoint failures, data loss | 🟠 P1 |
| **Incomplete ITL extraction** | Medium | High | Maintenance overhead | 🟡 P2 |
| **Missing subsystem docs** | Medium | Certain | Knowledge silos, bus factor | 🟡 P2 |
| **Write-only metrics** | Low | High | Lost observability | 🟢 P3 |

---

## 6. Recommendations (Prioritized)

### P0: Immediate Safety & Guarantees

**1. Restore Enforcement Boundary** (Estimated: 2-3 phases)
   - Add `state assert` pre-condition command to verify project state before any workflow
   - Wire `state assert` into every workflow's init step as **exit 1 on failure**
   - Make `verify phase-completeness` mandatory before `verify_phase_goal` in `execute-phase`
   - Add `verify research-contract` to `plan-phase` critical path (after researcher)
   - Implement explicit `cmdStatePause` / `cmdStateResume` pair to replace heuristic string matching
   - Add deduplication to `cmdStateAddDecision`

**2. Persist Critical Context**
   - Persist ITL ambiguity/lockability output to `{phase_dir}/{padded_phase}-ITL.json` for cross-session availability
   - Surface "Resume Requires User Input" as **blocking advisory** in plan-phase and execute-phase init

**3. Close Auto-Chain Bypass**
   - Restrict `_auto_chain_active` scope to specific agent types only
   - Add code check to exclude `checkpoint:human-action` type from auto-advance

### P1: Correct Configuration & Schema Drift

**4. Fix Configuration System**
   - Remove or implement `mode`/`granularity` config fields
   - Add `workflow.auto_advance` to `loadConfig()` return value
   - Remove `adversarial_test_harness` from VALID_CONFIG_KEYS or implement it

**5. Unify Checkpoint Schemas**
   - Create shared `checkpoint-base.cjs` with common fields
   - Make both schemas extend the base
   - Add migration for existing checkpoint artifacts

**6. Fix Performance Metrics**
   - Add parser for `Performance Metrics` table in STATE.md
   - Expose metrics via `gsd:progress` or new `gsd:metrics` command

**7. Fix Duplicate Data**
   - Separate `deferred_ideas` and `out_of_scope` sources in `discussionSeedSchema`
   - Remove redundancy in seed output

### P2: Documentation Recovery

**8. Regenerate Architecture Documentation** (Estimated: 1 dedicated research phase)
   - Use `/gsd:map-codebase` on GSD itself to generate current architecture
   - Update all docs in `docs/` and `.planning/codebase/` with current reality
   - Create component diagrams showing:
     - Current subsystems (40+ modules organized by concern)
     - Planning Server request flow
     - Second Brain data flow
     - Firecrawl control plane
     - Plane sync bidirectional flow
   - Document the **evolution** from v0.1.0 to v0.4.0 as ADRs

**9. Document New Subsystems**
   - Create subsystem docs for: Planning Server, Second Brain, Firecrawl Control Plane, Plane Integration, Authority System, Context Store
   - Include deployment diagrams, failure modes, operational runbooks

**10. Update Reference Materials**
   - Fix `docs/STACK.md` to reflect actual dependencies (Postgres, RabbitMQ, Zod)
   - Update `docs/ARCHITECTURE.md` with current layered view (this may need to be renamed to "Historical Architecture")
   - Create `docs/SUBSYSTEMS.md` as master index

**11. Create Migration Guide**
   - Document how to understand the shift from "file-only" to "hybrid (files + services)"
   - Explain when Postgres is required vs optional
   - Provide troubleshooting for common setup issues

### P3: Code Health

**12. Complete ITL Package Extraction**
   - Decide: either delete internal `itl-*.cjs` modules and use `packages/itl`, OR
   - Keep internal but make package a thin re-export layer
   - Ensure version consistency between package and internal usage

**13. Remove Dead Code**
   - Delete first definition of `stateExtractField` in `state.cjs` (line 184 is the real one, line 12 is dead)
   - Audit for other duplicate definitions or orphaned functions

**14. Add Integration Tests for Enforcement**
   - End-to-end tests that deliberately bypass workflows (direct CLI calls) to verify `state assert` blocks them
   - Test that `verify research-contract` actually fails when contract violated
   - Test checkpoint schema compatibility

---

## 7. Architectural Decision Registry (Proposed)

To prevent future drift, establish ADR process:

**Future Decisions Needed:**
1. **ADR-XXX: Dual-Module ITL Strategy** - Why both package and internal modules exist
2. **ADR-XXX: Planning Server Necessity** - Why we need an HTTP server vs pure file ops
3. **ADR-XXX: Second Brain Requirements** - Why Postgres + RabbitMQ vs file-based
4. **ADR-XXX: Firecrawl as Control Plane** - Shift from crawler to gatekeeper
5. **ADR-XXX: Plane as Source of Truth?** - Current: `.planning/` is source, Plane is mirror. Evaluate bidirectional sync risks

---

## 8. Suggested Immediate Actions

**For the current Phase 48-49 work (Plane checkpoint sync):**

⚠️ **Caution:** The Plane sync features are being built on top of an architecture whose documentation doesn't match reality. Before proceeding:

1. **Verify the actual current architecture** by reading key modules:
   - `get-stuff-done/bin/lib/roadmap-plane-sync.cjs`
   - `get-stuff-done/bin/lib/plane-client.cjs`
   - `get-stuff-done/workflows/47-plane-roadmap-sync/*.md`

2. **Check for drift in the Plane sync itself:**
   - Are checkpoints being written via `safeWriteFile` with authority envelopes?
   - Is the Planning Server being used for reads?
   - Are all writes going through the enforcement boundary primitives?
   - Does the Plane integration respect the `_auto_chain_active` bypass risks?

3. **Update the relevant architecture docs** before completing Phase 48:
   - At minimum, add a section to `docs/ARCHITECTURE.md` describing the Plane integration pattern
   - Document the data flow: GSD → Plane (bi-directional)
   - Note any enforcement boundary crossings

---

## 9. Conclusion

The GSD project suffers from **architectural technical debt** accumulated through rapid feature delivery. The code has evolved 300% beyond its original design, but the documentation, enforcement mechanisms, and governance processes haven't scaled accordingly.

**The system likely works** (phases are completing, tests pass), but **the guarantees are weaker than claimed** and **the knowledge base is dangerously stale**.

**Next steps:**
1. 🛑 **Stop** adding new features until P0 risks are addressed
2. 📋 **Create** ADR process and document recent decisions
3. 🔧 **Restore** enforcement boundary (P0 items)
4. 📚 **Regenerate** architecture documentation from actual code
5. ✅ **Verify** that all completed phases actually meet their stated architectural requirements

The good news: the system is **well-tested** (100% coverage gates exist) and **intentionally designed** (phases have clear requirements). The fix is primarily about **closing the loop** between intent and implementation, not rewriting code.

---

**Assessment prepared by:** Claude Code systematic review
**Review status:** Ready for team review
**Recommended next action:** Create Phase 51 (or 53) "Architecture Consistency & Documentation Recovery" to address P0 and P1 items
