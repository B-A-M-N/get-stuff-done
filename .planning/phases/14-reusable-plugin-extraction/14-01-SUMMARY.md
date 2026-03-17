# SUMMARY: 14-01 - Create a standalone ITL package with a clean public API

## Outcome
Created a standalone ITL package under `packages/itl` with a clean public API centered on narrative interpretation.

## What Changed
- Added [packages/itl/package.json](/home/bamn/get-stuff-done/packages/itl/package.json) as a dedicated package boundary.
- Added [packages/itl/index.cjs](/home/bamn/get-stuff-done/packages/itl/index.cjs) with a standalone public API:
  - `interpret_narrative(input_text, context_data)`
  - `build_provider_request(input_text, context_data)`
  - `get_supported_providers()`
  - canonical schemas
- Added [packages/itl/index.d.ts](/home/bamn/get-stuff-done/packages/itl/index.d.ts) so the package is TypeScript-friendly without requiring TypeScript at runtime.

## Verification
- `node --test tests/itl-package.test.cjs`
- `npm run test:coverage`

## Notes
The standalone package is self-contained and does not depend on `.planning/` or workflow markdown.
