# PROJECT: get-stuff-done (Intent Translation Layer Enhancement)

## Current State

Version `0.1.0` is shipped.

Delivered in `v0.1.0`:
- narrative-first intake across initialization, discussion, and verification
- deterministic ITL runtime with ambiguity, lockability, and SQLite audit persistence
- coexistence-safe fork installation under `dostuff`-scoped surfaces
- canonical Zod schema layer and concrete Claude/Gemini/Kimi/OpenAI adapters
- standalone `packages/itl` module with `interpret_narrative(input_text, context_data)`
- stable `100%` line-coverage gate for the scoped ITL runtime and package surfaces

## Current Core Value

Provider-aware narrative interpretation that improves the user interaction layer without weakening GSD planning rigor.

## Current Milestone: v0.2.0 Orchestration Integrity

**Goal:** Harden the enforcement model from workflow-described to runtime-bound — add a persistent checkpoint artifact, mandatory gate checks, pre-flight context enrichment, schema contracts for execution artifacts, and full end-to-end scenario tests.

**Target features:**
- Runtime gate enforcement (blocked clarification state prevents plan/execute/autonomous)
- Persistent CHECKPOINT.md artifact written, re-read, and audited across resume boundaries
- Pre-flight context enrichment: ambient state harvested before escalating clarification to user
- Workflow surface hardening (research-phase, validate-phase, autonomous get blocked-state awareness)
- Orphaned workflow reconciliation (diagnose-issues, discovery-phase, node-repair, transition, verify-phase)
- End-to-end behavioral scenario tests for pause→clarify→blocked→resume→resolve loop
- Zod schemas for CHECKPOINT.md and SUMMARY.md artifacts; cmdVerifySummary upgraded to contract validation

## Archived Context

<details>
<summary>v0.1.0 planning context</summary>

### Vision
Improve the human interaction layer of `get-stuff-done` by introducing a provider-agnostic "Intent Translation Layer" (ITL) that adapts user narrative into the structured inputs required by the existing GSD engines (Initialization, Discussion, Planning, Research, Execution, and Verification).

### Core Principles
- **Enhance, Don't Replace:** The ITL sits between the user and the existing GSD engines.
- **Preserve Agent Behavior:** The underlying planning/execution logic remains untouched; only the interface is altered.
- **Provider Agnostic:** Support Claude, Kimi, Gemini, and OpenAI through one canonical contract.
- **100% Reliability:** Mandatory test coverage for all new and modified code.

### Core Constraint
The ITL must adapt user input into the existing engines’ expected structures. It must not rewrite or replace planner, executor, governance, or research logic except where minimal interface changes are strictly necessary.

</details>

---
*Last updated: 2026-03-17 after v0.2.0 milestone start*

<!-- GSD-AUTHORITY: 28-02-3:6246a0e1bd7a78137c07b0209fe665f20443acbec8c7bef492e7f12ca64992b7 -->
