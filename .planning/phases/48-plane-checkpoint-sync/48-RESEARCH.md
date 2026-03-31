---
phase: 48
status: researched
researched: 2026-03-26
updated: 2026-03-26
supersedes:
  - phase: 45
    scope: partial
depends_on:
  - phase: 46
    reason: "Firecrawl is already the controlled retrieval and normalization boundary."
  - phase: 47
    reason: "Plane issue sync and issue lookup primitives already exist."
---

# Phase 48 Research: Plane Checkpoint and Summary Sync

## Summary

Phase 48 should be executed as a narrow extension of the existing Phase 47 Plane integration, not as a continuation of the original Phase 45 assumptions. The repo already has the useful Plane primitives for issue creation, update, hierarchy, and lookup. What is still missing is comment synchronization for checkpoint and summary artifacts.

Primary recommendation:
- add `PlaneClient.addComment(issueId, content)`
- implement `checkpoint-plane-sync.cjs` as a fire-and-forget hook after successful checkpoint commits
- implement `summary-plane-sync.cjs` behind an explicit `gsd-tools plane-sync summary` command
- do not make old `STATE.md -> Plane` mirroring a prerequisite

## Current Reality

### Usable primitives already present

- `get-stuff-done/bin/lib/plane-client.cjs`
  - already provides `_request`, retry, rate limiting, and audit logging
  - already provides `createMilestone`, `createIssue`, `updateIssue`, `linkIssueParent`, `updateProjectMetadata`
  - missing only `addComment(issueId, content)` for Phase 48
- `get-stuff-done/bin/lib/roadmap-plane-sync.cjs`
  - already provides `findIssueByCustomField(customFieldKey, customFieldValue, opts)`
  - already caches lookup results in `findIssueByCustomField.registry`
  - already uses authoritative identifiers `gsd_phase_number` and `gsd_plan_id`
- `get-stuff-done/bin/lib/commands.cjs`
  - already provides `cmdCheckpointWrite`
  - already writes and commits `CHECKPOINT.md`
  - this is the correct integration point for checkpoint comment sync
- `get-stuff-done/bin/gsd-tools.cjs`
  - already routes `checkpoint write`
  - does not currently expose any `plane-sync` command route

### Missing pieces

- `get-stuff-done/bin/lib/checkpoint-plane-sync.cjs`
- `get-stuff-done/bin/lib/summary-plane-sync.cjs`
- `tests/checkpoint-plane-sync.test.cjs`
- `tests/summary-plane-sync.test.cjs`
- `get-stuff-done/bin/lib/state-plane-sync.cjs`
- `tests/state-plane-sync.test.cjs`
- `.planning/phases/48-plane-checkpoint-sync/CONTEXT.md`

The old Phase 48 plans referenced that missing `CONTEXT.md`, so they were not executable as written.

## Dependency Interpretation

### Hard prerequisites

- Phase 46 is complete and verified.
  - Firecrawl now owns controlled retrieval and normalization.
  - Phase 48 does not need to solve context acquisition.
- Phase 47 is complete and documented.
  - Plane issue syncing and issue lookup already exist.
  - Phase 48 should reuse those identifiers and lookups directly.

### Not a hard prerequisite

- Phase 45 as originally planned.
  - The promised `state-plane-sync.cjs` and `STATE.md -> Plane` hook were never delivered.
  - The surviving useful artifact was `plane-client.cjs`, and later Phase 47 expanded it into the real Plane foundation.
  - Therefore Phase 48 should not wait on a retroactive Phase 45 backfill.

## Interfaces to Build Against

### Plane client

Current surface in `get-stuff-done/bin/lib/plane-client.cjs`:

```javascript
class PlaneClient {
  async _request(action, endpoint, body = null, method = 'POST') { ... }
  async updateProjectMetadata(metadata) { ... }
  async createMilestone(milestoneData) { ... }
  async createIssue(issueData) { ... }
  async updateIssue(issueId, updates) { ... }
  async linkIssueParent(issueId, parentId) { ... }
}
```

Needed addition:

```javascript
async addComment(issueId, content) {
  return this._request('add-comment', `projects/${this.projectId}/issues/${issueId}/comments`, { content });
}
```

### Issue lookup

Current surface in `get-stuff-done/bin/lib/roadmap-plane-sync.cjs`:

```javascript
async function findIssueByCustomField(customFieldKey, customFieldValue, opts = {}) -> Promise<Issue|null>
```

Recommended usage:
- checkpoint sync uses `gsd_phase_number`
- summary sync uses `gsd_plan_id`

### Checkpoint integration point

Current surface in `get-stuff-done/bin/lib/commands.cjs`:

```javascript
function cmdCheckpointWrite(cwd, phase, options, raw)
```

Observed behavior:
- validates required fields
- writes `CHECKPOINT.md`
- stages and commits it
- returns structured checkpoint payload

Recommended integration:
- after successful commit, call `notifyCheckpointWrite(phase, checkpointPath)` in fire-and-forget mode
- never let Plane failures change checkpoint write success

### Summary integration point

Current surface in `get-stuff-done/bin/gsd-tools.cjs`:
- no `plane-sync` route exists yet

Recommended addition:
- `plane-sync summary --phase <N> --plan <M>`
- validate required flags
- route to `summary-plane-sync.cjs`

## Testing Guidance

Use existing repo patterns:
- `node:test`
- `node:assert`
- env setup and cache clearing patterns from `tests/plane-client.test.cjs`

Phase 48 should add:
- `tests/checkpoint-plane-sync.test.cjs`
  - success path
  - missing Plane issue
  - Plane disabled
  - malformed or missing checkpoint file
- `tests/summary-plane-sync.test.cjs`
  - success path
  - missing plan issue
  - Plane disabled
  - malformed or missing summary file
  - router argument validation for `plane-sync summary`

## Design Constraints

- Sync remains best-effort and non-blocking.
- `.planning` remains the source of truth; Plane receives visibility comments only.
- Use existing GSD identifiers and lookup helpers rather than storing raw Plane IDs in planning artifacts.
- Summary sync should resolve the canonical `NN-NN-SUMMARY.md` using `findPhaseInternal`.
- Optional `STATE.md -> Plane` metadata sync remains deferred and non-blocking.

## Bottom Line

The correct Phase 48 rewrite is:
- build on Phase 47, not original Phase 45
- add comment posting primitive
- add checkpoint comment hook
- add explicit summary sync command
- add focused tests for both paths

Do not backfill old state-sync work just to satisfy numbering.
