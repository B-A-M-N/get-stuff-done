# Phase 13 Research: Multi-Provider Support

## Objective
Implement real Kimi, Gemini, and OpenAI support on top of the canonical schema and adapter seam from Phase 12.

Additional steering:
- Phase 13 should add real provider-facing adapters and prompt handling without breaking the deterministic internal fallback path.
- Provider integrations must normalize back into the canonical ITL schema rather than leaking provider-specific payloads into workflow code.
- The phase should stay honest about environment boundaries: API keys and live-provider smoke tests may be optional or fixture-driven in local development.

## Standard Stack
- **Validation and canonical contract**
  - existing Zod-backed `itl-schema.cjs`
- **Runtime**
  - provider adapters under `get-stuff-done/bin/lib/itl*.cjs`
  - provider registry / prompt selection helpers
- **Testing**
  - `node:test`
  - deterministic fixture-based adapter tests first
  - optional live smoke tests only if clearly isolated from the default test path

## Architecture Patterns

### 1. Canonical-in, canonical-out
Provider adapters should only differ in how they prepare requests and parse responses.

Recommended behavior:
- Convert canonical ITL requests into provider-native payloads per provider.
- Parse provider responses back into canonical interpretation objects immediately.
- Reuse Phase 12 schema validation to reject malformed provider output.

### 2. Provider registry instead of scattered branching
Provider support becomes hard to maintain if selection logic is spread across workflows.

Recommended behavior:
- Centralize provider registration, lookup, and prompt-template selection.
- Keep a default internal adapter for deterministic/offline operation.
- Make provider selection explicit in config or CLI options rather than hidden.

### 3. Prompt templates are provider-specific, contracts are not
Different providers may need different prompts or structured-output formats.

Recommended behavior:
- Store provider-specific prompt builders or templates behind the adapter/registry layer.
- Preserve one canonical interpretation contract across all providers.
- Avoid letting provider prompt details leak into `dostuff` workflows.

### 4. Test with fixtures first, live calls second
Live-provider tests are useful but should not become the default gate.

Recommended behavior:
- Add deterministic fixture tests for request mapping and response normalization.
- If live tests are added, isolate them behind opt-in flags or environment guards.
- Keep the normal test and coverage gates stable without external network access.

## Don’t Hand-Roll
- Do not bypass the canonical schema when parsing provider output.
- Do not force live API access into the default test path.
- Do not duplicate workflow logic per provider.
- Do not overclaim provider parity before the adapters share the same canonical assertions.

## Common Pitfalls
- Provider-specific conditionals leaking into `itl.cjs` or workflow docs
- Inconsistent prompt/response handling across adapters
- Weak fixture coverage for malformed provider responses
- Treating live-provider availability as a requirement for normal development

## Code Examples
- Canonical schema layer: `get-stuff-done/bin/lib/itl-schema.cjs`
- Adapter seam: `get-stuff-done/bin/lib/itl-adapters.cjs`
- Existing ITL runtime: `get-stuff-done/bin/lib/itl.cjs`
- Prior research:
  - `.planning/research/SUMMARY.md`
  - `.planning/research/ARCHITECTURE.md`
  - `.planning/research/FEATURES.md`
  - `.planning/research/PITFALLS.md`

## Prescriptive Recommendation
Implement Phase 13 in two steps:

1. Add a provider registry plus concrete Kimi, Gemini, and OpenAI adapters that map requests/responses through the canonical schema.
2. Add provider selection, prompt registry behavior, and deterministic adapter contract tests/docs while keeping live-provider testing optional.

That delivers real provider support while preserving the stable local developer experience.
