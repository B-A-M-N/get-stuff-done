# SUMMARY: 11-02 - Tighten the coverage contract and document test-surface limits

## Outcome
Aligned the coverage script, documentation, and test-surface claims with the actual stable baseline enforced in this repo.

## What Changed
- Updated [package.json](/home/bamn/get-stuff-done/package.json) so `npm run test:coverage` gates the scoped ITL runtime surface instead of the entire `bin/lib` tree.
- Documented the stable coverage baseline in:
  - [help.md](/home/bamn/get-stuff-done/get-stuff-done/workflows/help.md)
  - [COMMANDS.md](/home/bamn/get-stuff-done/docs/COMMANDS.md)
- Made the boundary explicit:
  - dev dependencies, including `c8`, must be installed
  - direct tests `tests/itl.test.cjs` and `tests/dostuff.test.cjs` form the stable coverage path
  - subprocess-heavy suites remain valuable regressions but are not implied by the coverage gate

## Verification
- `npm install`
- `npm run test:coverage`

## Notes
Phase 11 now leaves an honest coverage baseline for later phases instead of implying whole-repo or subprocess-heavy coverage guarantees that are not actually enforced.
