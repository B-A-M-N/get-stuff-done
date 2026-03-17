# SUMMARY: 13-02 - Wire provider selection, prompt templates, and contract coverage

## Outcome
Exposed the multi-provider runtime through explicit provider selection and updated the documentation/test contract so provider support is clear without forcing live APIs into the default development path.

## What Changed
- Updated [gsd-tools.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs) so ITL commands accept:
  - `--provider`
  - `--provider-response-json`
  - `--provider-response-file`
- Updated user-facing/runtime docs in:
  - [help.md](/home/bamn/get-stuff-done/get-stuff-done/workflows/help.md)
  - [COMMANDS.md](/home/bamn/get-stuff-done/docs/COMMANDS.md)
  - [ARCHITECTURE.md](/home/bamn/get-stuff-done/docs/ARCHITECTURE.md)
- Locked those docs with contract assertions in [dostuff.test.cjs](/home/bamn/get-stuff-done/tests/dostuff.test.cjs).

## Verification
- `node --test tests/itl.test.cjs tests/dostuff.test.cjs`
- `npm run test:coverage`

## Notes
Multi-provider support is now explicit in the runtime contract, while live provider execution remains optional and outside the default deterministic test path.
