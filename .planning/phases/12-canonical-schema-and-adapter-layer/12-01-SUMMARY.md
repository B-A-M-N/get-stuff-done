# SUMMARY: 12-01 - Introduce Zod-backed canonical schemas for the ITL runtime surface

## Outcome
Replaced the lightweight ITL normalization helper with a Zod-backed canonical schema layer that validates the current runtime contracts without changing workflow-facing behavior.

## What Changed
- Rebuilt [itl-schema.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl-schema.cjs) around canonical Zod schemas for:
  - interpretation payloads
  - ambiguity and lockability results
  - audit records
  - initialization, discuss-phase, and verification seeds
- Updated [itl.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl.cjs) to validate interpretation results and all public seed payloads before they are returned.
- Updated [itl-audit.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl-audit.cjs) so persisted rows round-trip through the canonical audit schema.
- Expanded [itl.test.cjs](/home/bamn/get-stuff-done/tests/itl.test.cjs) with canonical parse coverage and invalid-shape assertions.

## Verification
- `node --test tests/itl.test.cjs`
- `npm run test:coverage`

## Notes
This phase tightened the internal data contract without changing the installed `/dostuff:*` workflow behavior.
