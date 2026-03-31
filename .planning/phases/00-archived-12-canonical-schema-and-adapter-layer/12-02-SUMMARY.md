# SUMMARY: 12-02 - Add provider-agnostic adapter seams and contract coverage

## Outcome
Added the provider-agnostic adapter seam Phase 13 will build on, while keeping the current deterministic extractor as the default internal adapter.

## What Changed
- Added [itl-adapters.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl-adapters.cjs) with:
  - adapter validation
  - default internal heuristic adapter
  - canonical interpretation flow through the adapter seam
- Routed [itl.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl.cjs) through that adapter seam instead of calling the extractor directly.
- Updated docs to describe the new canonical and adapter boundary honestly:
  - [help.md](/home/bamn/get-stuff-done/get-stuff-done/workflows/help.md)
  - [COMMANDS.md](/home/bamn/get-stuff-done/docs/COMMANDS.md)
  - [ARCHITECTURE.md](/home/bamn/get-stuff-done/docs/ARCHITECTURE.md)
- Added contract assertions in [dostuff.test.cjs](/home/bamn/get-stuff-done/tests/dostuff.test.cjs) so docs do not overclaim Phase 13 provider support.

## Verification
- `node --test tests/itl.test.cjs tests/dostuff.test.cjs`
- `npm run test:coverage`

## Notes
The adapter seam is real now, but concrete Kimi/Gemini/OpenAI implementations remain Phase 13 work.
