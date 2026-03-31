# Phase 12 Research: Canonical Schema and Adapter Layer

## Objective
Design the canonical schema and adapter boundary that let ITL stay provider-agnostic before actual multi-provider integrations land in Phase 13.

Additional steering:
- Phase 12 should formalize the data contract around the current deterministic ITL output instead of rewriting the extraction engine.
- The canonical schema must validate the existing interpretation, ambiguity, lockability, seed, and audit shapes without weakening current behavior.
- The adapter layer should introduce provider-facing interfaces and test fixtures, but not pull real Kimi/Gemini/OpenAI integrations forward from Phase 13.

## Standard Stack
- **Validation**
  - `zod`
- **Runtime**
  - existing CommonJS ITL modules under `get-stuff-done/bin/lib/`
- **Testing**
  - `node:test`
  - direct schema and adapter contract tests

## Architecture Patterns

### 1. Canonical schema wraps existing ITL contracts
The current ITL pipeline already emits deterministic JS objects.

Recommended behavior:
- Define explicit Zod schemas for interpretation, ambiguity, lockability, audit records, and seed payloads.
- Keep the normalized output shape stable so existing workflows and command docs do not break.
- Validate at module boundaries rather than sprinkling schema checks everywhere.

### 2. Adapter layer sits above canonical contracts
Phase 12 should create the seam where provider-specific mapping can plug in later.

Recommended behavior:
- Introduce a provider-agnostic adapter interface for:
  - narrative input preparation
  - provider response normalization into canonical schema
  - error reporting when provider payloads are incomplete or invalid
- Add a baseline internal adapter so the current deterministic extractor already flows through the same contract.

### 3. Preserve current command semantics
Narrative-first workflows should keep using the same routes and planning contracts.

Recommended behavior:
- Refactor ITL internals behind canonical contracts without changing:
  - `/dostuff:new-project`
  - `/dostuff:discuss-phase`
  - `/dostuff:verify-work`
  - `itl interpret`, `itl latest`, and seed commands
- Keep audit persistence readable and backwards-compatible where practical.

### 4. Treat invalid provider output as a first-class failure mode
The adapter boundary is only useful if malformed or partial payloads fail loudly and deterministically.

Recommended behavior:
- Add explicit parse/validation failures for invalid canonical data.
- Add contract tests for missing required fields, wrong types, and unsupported route hints.
- Keep fallback behavior narrow and explainable.

## Don’t Hand-Roll
- Do not couple the schema directly to a specific provider SDK.
- Do not replace the current deterministic ITL logic with mock provider calls.
- Do not delay schema validation until Phase 13; Phase 12 is where the boundary becomes real.
- Do not silently coerce obviously invalid provider payloads into “good enough” canonical data.

## Common Pitfalls
- Creating Zod schemas that disagree with the existing runtime shape
- Introducing adapters with no canonical tests
- Mixing provider integration concerns into the schema phase
- Breaking workflow-facing seed contracts while refactoring internal modules

## Code Examples
- Existing normalization helper: `get-stuff-done/bin/lib/itl-schema.cjs`
- Existing ITL orchestrator: `get-stuff-done/bin/lib/itl.cjs`
- Existing tests: `tests/itl.test.cjs`
- Existing planning/runtime docs: `get-stuff-done/workflows/help.md`, `docs/COMMANDS.md`

## Prescriptive Recommendation
Implement Phase 12 in two steps:

1. Replace the lightweight normalization helper with a real Zod-backed canonical schema layer that validates all current ITL outputs.
2. Introduce a provider-agnostic adapter boundary and route the current deterministic extractor through it as the first adapter.

That yields a real abstraction seam for Phase 13 without destabilizing the current workflows.
