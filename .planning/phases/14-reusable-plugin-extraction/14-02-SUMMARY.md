# SUMMARY: 14-02 - Verify standardized package output and align docs and coverage

## Outcome
Verified the extracted package through direct tests and aligned the stable docs/coverage contract with the new package boundary.

## What Changed
- Added direct package verification in [itl-package.test.cjs](/home/bamn/get-stuff-done/tests/itl-package.test.cjs) covering:
  - canonical output shape
  - provider-aware fixture normalization
  - provider request builders
  - clean API aliases
  - error handling and fallback paths
- Updated [package.json](/home/bamn/get-stuff-done/package.json) so `npm run test:coverage` now covers both:
  - `get-stuff-done/bin/lib/itl*.cjs`
  - `packages/itl/**/*.cjs`
- Updated docs/contracts in:
  - [help.md](/home/bamn/get-stuff-done/get-stuff-done/workflows/help.md)
  - [COMMANDS.md](/home/bamn/get-stuff-done/docs/COMMANDS.md)
  - [ARCHITECTURE.md](/home/bamn/get-stuff-done/docs/ARCHITECTURE.md)
  - [dostuff.test.cjs](/home/bamn/get-stuff-done/tests/dostuff.test.cjs)

## Verification
- `node --test tests/itl.test.cjs tests/itl-package.test.cjs tests/dostuff.test.cjs`
- `npm run test:coverage`

## Notes
The stable verification path now includes the standalone package and remains deterministic/offline-friendly.
