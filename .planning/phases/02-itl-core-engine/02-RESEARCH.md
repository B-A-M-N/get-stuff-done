# Phase 2 Research: ITL Core Engine

## Goal
Plan an initial Intent Translation Layer that can accept narrative input, generate a structured interpretation summary, detect ambiguity, and persist an audit trail without yet rewriting the broader GSD workflows.

## Key Decisions

### 1. Keep Phase 2 inside the existing Node/CommonJS codebase
- Implement Phase 2 under `get-stuff-done/bin/lib/` and related workflow/command files.
- Do not introduce a TypeScript build pipeline yet.
- Reserve the standalone TypeScript/plugin extraction for Phase 14 as already defined in the roadmap.

### 2. Use `dostuff` as the first public ITL entry point
- Phase 1 already created `dostuff` as a soft narrative entry point.
- Phase 2 should upgrade it from a simple router into the first workflow that:
  - accepts multi-paragraph narrative input,
  - produces a structured interpretation summary,
  - flags ambiguity,
  - records an audit trail,
  - and only then routes onward.

### 3. Keep provider SDKs out of scope for Phase 2
- Phase 2 should be provider-agnostic by contract, not by adapter implementation.
- Use host-agent/workflow prompts to obtain structured interpretation, then normalize and persist it inside GSD.
- Defer provider-specific adapters and registries to Phases 11 and 12.

### 4. Add a small internal ITL module surface
- Recommended module split:
  - `itl-schema.cjs` — normalize/validate extracted intent objects
  - `itl-ambiguity.cjs` — ambiguity heuristics and confidence scoring
  - `itl-audit.cjs` — persistence and retrieval helpers
  - `itl-summary.cjs` — user-facing interpretation summary rendering
- Keep the API narrow and phase-scoped so later schema/adapters can replace internals safely.

### 5. Persist audit data locally under `.planning/`
- Store ITL audit data in a dedicated area such as `.planning/itl/`.
- Use SQLite for the audit trail to satisfy `TR-03`, but keep the schema minimal:
  - sessions / narrative inputs
  - extracted intent blobs
  - ambiguity findings
  - assumptions / confidence metadata

## Risks to Plan Around
- SQLite dependency choice must remain compatible with the repo’s existing Node support expectations.
- Markdown/workflow integration is already regex-heavy, so plan files must include strong regression coverage.
- `dostuff` should not silently bypass existing GSD routing safeguards when ambiguity is high.

## Phase Boundary
- In scope:
  - internal ITL modules
  - ambiguity logic
  - audit persistence
  - `dostuff` integration
  - tests/fixtures for all new behavior
- Out of scope:
  - `/gsd:new-project` integration
  - `/gsd:discuss-phase` integration
  - provider SDK adapters
  - full standalone extraction/plugin packaging
