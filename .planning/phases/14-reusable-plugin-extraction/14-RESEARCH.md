# Phase 14 Research: Reusable Plugin Extraction

## Objective
Extract the ITL into a standalone package boundary with a clean Node.js-friendly API and TypeScript surface, without breaking the in-repo runtime that already uses the ITL internally.

Additional steering:
- The first extraction target should be a self-contained package inside the repo, not an abstract future promise.
- The package should expose a clean conceptual API around narrative interpretation rather than leaking GSD workflow internals.
- The extracted package must preserve the canonical schema and provider-registry behavior added in earlier phases.

## Standard Stack
- **Packaging**
  - local package directory under `packages/`
  - CommonJS runtime plus TypeScript declaration surface
- **Validation**
  - `zod`
- **Testing**
  - `node:test`
  - direct package API tests

## Architecture Patterns

### 1. Standalone package boundary first
The extraction is only real if a consumer can import a package entrypoint instead of reaching into `get-stuff-done/bin/lib`.

Recommended behavior:
- Create a dedicated `packages/itl/` package with its own `package.json`.
- Expose a clean top-level API for narrative interpretation and provider support.
- Keep GSD-specific workflow helpers out of the standalone package surface.

### 2. Clean conceptual API over internal plumbing
The standalone consumer should not need to know about `buildInterpretationResult` or workflow seed details.

Recommended behavior:
- Expose `interpret_narrative(input_text, context_data)` as the primary API.
- Expose a small number of supporting utilities only where they help portability:
  - `build_provider_request(...)`
  - `get_supported_providers()`
  - canonical schemas

### 3. Preserve standardized output
Extraction is only useful if consumers get the same canonical contract GSD already relies on.

Recommended behavior:
- Return interpretation, ambiguity, lockability, summary, and provider request data in one stable object.
- Keep provider normalization and schema validation inside the package.
- Verify package output with direct tests.

### 4. Do not require live providers for package verification
The portable package should remain testable offline.

Recommended behavior:
- Test fixture-based provider normalization through the package API.
- Keep live provider execution optional and out of the default package test path.

## Don’t Hand-Roll
- Do not export GSD workflow-only helpers as the public package API.
- Do not make the package depend on `.planning/` or repo-local state.
- Do not require network access to verify the extracted package.
- Do not introduce a TypeScript requirement for consumers just to use the runtime.

## Common Pitfalls
- Calling it a package while still requiring consumers to import deep repo paths
- Exposing too much of the internal GSD runtime surface
- Letting the extracted API drift from the canonical schema used by GSD
- Forgetting TypeScript declarations or package metadata

## Code Examples
- Runtime source of truth: `get-stuff-done/bin/lib/itl*.cjs`
- Existing adapter contract: `get-stuff-done/bin/lib/itl-adapters.cjs`
- Existing schema contract: `get-stuff-done/bin/lib/itl-schema.cjs`
- Existing tests: `tests/itl.test.cjs`

## Prescriptive Recommendation
Implement Phase 14 in two steps:

1. Create a standalone `packages/itl` package with a clean entrypoint and TypeScript declarations.
2. Verify the extracted package with direct tests and align docs/coverage with the new package boundary.

That yields a real reusable package while keeping the in-repo GSD runtime intact.
