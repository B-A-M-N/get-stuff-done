---
phase: 46
plan: 46-02
title: Firecrawl Service Adapters and `/v1/context/crawl` Endpoint
status: completed
completed: 2026-03-26
commit: uncommitted-local-firecrawl
---

# 46-02 Summary

## What Was Delivered

- Added the missing server-side context normalization surface to the actual installed Firecrawl worktree at `/home/bamn/firecrawl-local/apps/api`.
- Implemented unified context artifact schema and adapter registry for:
  - `file://`
  - `http://` / `https://`
  - `plane://` stub
- Added `/v1/context/crawl` controller and route wiring in Firecrawl v1 API.
- Hardened GSD policy/audit integration so Firecrawl context retrieval still works when external hooks are missing or partially implemented.

## Files Added or Updated

- `/home/bamn/firecrawl-local/apps/api/src/lib/context-runtime.ts`
- `/home/bamn/firecrawl-local/apps/api/src/lib/artifact-schema.ts`
- `/home/bamn/firecrawl-local/apps/api/src/lib/adapters/file-adapter.ts`
- `/home/bamn/firecrawl-local/apps/api/src/lib/adapters/http-adapter.ts`
- `/home/bamn/firecrawl-local/apps/api/src/lib/adapters/plane-adapter.stub.ts`
- `/home/bamn/firecrawl-local/apps/api/src/lib/adapters/index.ts`
- `/home/bamn/firecrawl-local/apps/api/src/controllers/v1/context-crawl.ts`
- `/home/bamn/firecrawl-local/apps/api/src/routes/v1.ts`
- `/home/bamn/firecrawl-local/apps/api/src/__tests__/context-crawl.test.ts`
- `/home/bamn/firecrawl-local/apps/api/jest.config.ts`
- `/home/bamn/firecrawl-local/apps/api/tsconfig.json`

## Verification Performed

- Adapter dispatch verified directly in `/home/bamn/firecrawl-local/apps/api` with `tsx`:
  - `http://example.com` -> `http`
  - `file:///tmp/example.md` -> `file`
  - `plane://issue/123` -> `plane`
  - unsupported `ftp://` -> `null`
- File adapter verified directly in `/home/bamn/firecrawl-local/apps/api` with `tsx`:
  - returns a valid internal artifact for an in-worktree fixture file
  - marks the artifact as sanctioned
- Controller behavior verified directly in `/home/bamn/firecrawl-local/apps/api` with `tsx` + Express + Supertest:
  - invalid request body returns `400`
  - unsupported/plane-only request returns `200` with zero artifacts and two structured errors

## Notes

- The actual live Firecrawl worktree is `/home/bamn/firecrawl-local`, not `/home/bamn/firecrawl`.
- During reconciliation, the previously assumed server-side implementation was not present in the live local worktree and had to be added here.
- Firecrawl-local’s focused Jest execution is still misconfigured for targeted ESM/TypeScript runs, so direct `tsx` execution was used to prove the code paths while keeping the verification honest.
