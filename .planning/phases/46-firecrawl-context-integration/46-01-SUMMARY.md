---
phase: 46
plan: 01
subsystem: firecrawl-context-integration
tags:
  - context
  - firecrawl
  - client
  - schema
requires: []
provides:
  - unified-context-spec
  - firecrawl-client-methods
  - context-retrieval-api
affects:
  - firecrawl-client
  - testing
'tech-stack':
  added:
    - zod (schema validation)
  patterns:
    - singleton-client-pattern
    - schema-validation
    - async-method-mocking
'key-files':
  created:
    - get-stuff-done/bin/lib/context-schema.cjs
    - tests/firecrawl-crawl.test.cjs
  modified:
    - get-stuff-done/bin/lib/firecrawl-client.cjs
'key-decisions': []
patterns-established: []
requirements-completed:
  - FIRECRAWL-CONTROL-02
  - CONTEXT-UNIFY-01
context_artifact_ids: []
duration: 15min
completed: 2026-03-25T04:38:00Z
---

# Phase 46 Plan 01: Firecrawl Context Integration — Client Foundation

## One-liner

Defined unified context specification schema and extended FirecrawlClient with crawl/getArtifact methods.

## Summary

This plan establishes the client-side foundation for unified context retrieval. It introduces a canonical specification schema for context crawls and adds two critical methods to the FirecrawlClient singleton: `crawl(spec)` for batch context retrieval and `getArtifact(id)` for fetching individual artifacts.

## What Was Built

### 1. context-schema.cjs

Created `get-stuff-done/bin/lib/context-schema.cjs` defining `crawlSpecSchema`:

```javascript
{
  sources: z.array(z.string().min(1)).min(1),
  options: z.object({
    extract_schema: z.any().optional(),
    filter_globs: z.array(z.string()).optional(),
    max_total_bytes: z.number().int().positive().optional(),
    timeout_ms: z.number().int().positive().optional(),
    normalize: z.boolean().optional(),
  }).optional(),
}
```

This schema enforces that at least one source is provided and validates optional parameters.

### 2. FirecrawlClient Extensions

Extended `get-stuff-done/bin/lib/firecrawl-client.cjs`:

- Added `async crawl(spec)` - validates spec against `crawlSpecSchema`, dispatches to `/v1/context/crawl`
- Added `async getArtifact(id)` - validates non-empty string ID, dispatches to `/v1/artifacts/get`

Both methods integrate seamlessly with existing audit logging, rate limiting, and policy enforcement via `_request()`.

### 3. Unit Tests

Created comprehensive test suite `tests/firecrawl-crawl.test.cjs` (8 tests, all passing):

- Validation tests for missing sources, empty/whitespace IDs
- Parameter dispatch verification (correct action, endpoint, body)
- Async method behavior and return values
- Singleton client usage with proper `_request` mocking and restoration

## Verification

All automated verification passed:

- `context-schema.cjs` exports `crawlSpecSchema` and parses valid/invalid specs correctly
- `firecrawl-client.cjs` contains `async crawl(spec)`, `async getArtifact(id)`, and `crawlSpecSchema.parse`
- Test suite runs clean with 8/8 passing: `node --test tests/firecrawl-crawl.test.cjs`

## Deviations from Plan

None — plan executed exactly as written.

## Outcome

Agents can now use a single unified API:

```javascript
const client = require('./get-stuff-done/bin/lib/firecrawl-client.cjs');

// Batch retrieval
const crawlResult = await client.crawl({
  sources: ['plane://project/requirements', '.planning/', 'https://docs.example.com'],
  options: { normalize: true, max_total_bytes: 500000 }
});

// Individual artifact fetch
const artifact = await client.getArtifact('abc123...');
```

This enables the planned migration from direct file reads to Firecrawl-mediated context in subsequent phases.
