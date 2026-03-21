---
phase: 25
slug: research-unified-normalization-pipeline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-21
---

# Phase 25 — Validation Strategy

## Goal-Backward Checks

### 1. Parity
What must be true: Both internal files and external JSONs must parse into a `ContextArtifact` using identical schemas.
Artifact: `tests/normalization-parity.test.cjs`
Check: The test suite passes.

### 2. Integration
What must be true: The context builder reads from the normalizer instead of raw files.
Artifact: `get-stuff-done/bin/lib/context.cjs`
Check: Integration test confirms `context build` works with normalized data.

## Nyquist Compliance Checklist
- [x] All requirements have coverage mapped to plans
- [x] Wave 0 validation framework exists (tests mapped)
- [x] Every task has an automated `<verify>` command
- [x] No human visual checks required
