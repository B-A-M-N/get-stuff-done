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

## Next Milestone Goals

No next milestone is defined yet.

Recommended next step:
- run `gsd:new-milestone "<name>"` to define the next version scope, requirements, and roadmap

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
*Last updated: 2026-03-17 after v0.1.0 milestone*
