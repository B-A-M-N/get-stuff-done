# SUMMARY: 13-01 - Implement concrete provider adapters and a shared registry

## Outcome
Added a real provider registry and concrete ITL adapters for Claude, Gemini, Kimi, and OpenAI on top of the canonical schema layer.

## What Changed
- Expanded [itl-adapters.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl-adapters.cjs) to include:
  - supported-provider registry
  - explicit provider lookup
  - provider-specific request builders
  - provider-specific response normalization
  - deterministic fallback behavior when no provider response is supplied
- Updated [itl.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl.cjs) so interpretation results now flow through explicit provider selection and preserve provider request details in the returned canonical payload.
- Extended the canonical metadata/schema contract in [itl-schema.cjs](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/itl-schema.cjs) to track provider identity and provider request shapes.
- Added direct adapter coverage in [itl.test.cjs](/home/bamn/get-stuff-done/tests/itl.test.cjs) for:
  - provider registry contents
  - provider-specific request shapes
  - response normalization across Claude, Gemini, Kimi, and OpenAI
  - malformed/unsupported provider behavior

## Verification
- `node --test tests/itl.test.cjs`
- `npm run test:coverage`

## Notes
The runtime now has concrete provider adapters, but default local operation still does not require live network access.
