# Phase 47: Plane Roadmap & Issue Hierarchy Sync - Research

**Researched:** 2025-03-25
**Domain:** Plane API integration, roadmap synchronization, issue hierarchy management
**Confidence:** HIGH (architecture) / MEDIUM (Plane API specifics) / HIGH (implementation patterns)

## Summary

Phase 47 extends the existing Plane integration to synchronize ROADMAP.md content as Plane milestones and issues, creating full project visibility in Plane's UI and API. Building on Phase 45's plane-client.cjs (rate-limited, audited, async best-effort) and Phase 46's unified context layer, this phase implements a one-way GSD → Plane sync where ROADMAP milestones become Plane milestones, phases parent issues, and plans child issues.

The core implementation is `roadmap-plane-sync.cjs`, a new module that:
- Parses ROADMAP.md to extract milestones and phase content
- Discovers phase directories and PLAN files via `findPhaseInternal` (from core.cjs)
- Maps GSD phase/plan status to Plane issue states using the established mapping
- Calls plane-client.cjs methods to create/update milestones and issues
- Maintains idempotency through GSD-specific custom fields (`gsd_phase_number`, `gsd_plan_id`)
- Runs as fire-and-forget async hooks on ROADMAP writes and `gsd-tools roadmap-sync` manual command

**Primary recommendation:** Build roadmap-plane-sync as a standalone module following the state-plane-sync.cjs pattern. Extend plane-client.cjs with `createMilestone`, `createIssue`, `updateIssue`, and `linkIssueParent` methods. Trigger sync opportunistically after ROADMAP writes and provide a full reconciliation command for manual runs. All operations remain async best-effort, never blocking GSD workflows.

## User Constraints

### Locked Decisions (from CONTEXT.md)
- **Milestone mapping:** One Plane milestone per GSD milestone (v0.3.0 → Plane milestone with same version)
- **Issue granularity:** Phase = parent issue, Plan = child issue (asymmetrical with parent-child relationship)
- **Status mapping:** `[Planned]` → Todo, `[Research]` → Backlog/Todo, `[Discussed]` → Todo+label, `[In Progress]` → In Progress, `[Blocked]` → Blocked, `[Complete]`/`[Verified]` → Done
- **Sync trigger:** Deterministic triggers only — manual `gsd-tools roadmap-sync` command + on-write hooks for ROADMAP.md and SUMMARY completion
- **Data enrichment:** Use custom fields (`gsd_milestone_version`, `gsd_phase_number`, `gsd_plan_id`, `gsd_sync_version`, `gsd_last_synced_at`) and "Synced from GSD" label; avoid raw `file://` URIs
- **Authority:** GSD is authoritative for milestone assignment, canonical status, titles/ids, and phase/plan structure; Plane may own comments, assignee, estimates, external labels
- **Drift handling:** Log warnings, skip overwriting protected fields by default, provide `--force` flag to override

### Claude's Discretion
- Determine exact Plane API endpoints and payload structures (within REST conventions)
- Design reconciliation algorithm to detect and report drift
- Decide on parent-child linking mechanism (issue.parent field vs. issue relationships endpoint)
- Choose appropriate rate limits and batch sizes for bulk operations
- Design error handling strategy within async best-effort constraints

### Deferred Ideas (OUT OF SCOPE)
- Checkpoint/comment sync (Phase 48)
- Plane webhooks for Plane → GSD triggers (Phase 49)
- Firecrawl plane source adapter (allows GSD agents to read Plane data via Firecrawl)
- Full artifact path resolution via Planning Server URL
- Bi-directional sync for comments/assignee

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLANE-VISIBILITY-02 | ROADMAP.md → Plane milestones + issues sync | roadmap-plane-sync.cjs module; milestone/issue creation methods; status mapping |
| PLANE-SYNC-02 | One-way GSD→Plane reconciliation with drift detection | Sync patterns from state-plane-sync; idempotent operations; custom fields for tracking |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| plane-client.cjs | current (extends Phase 45) | Plane API client with rate limiting, retry, audit | Existing singleton; will add createMilestone/createIssue/updateIssue methods |
| roadmap.cjs | current | ROADMAP.md parsing (cmdRoadmapGetPhase, cmdRoadmapAnalyze) | Provides phase extraction, milestone detection; reuse instead of re-parsing |
| core.cjs | current | Shared utilities: safeFs, logWarn, normalizePhaseName, findPhaseInternal | Enforces sandbox, provides phase discovery from filesystem |
| state-plane-sync.cjs | current | Pattern for fire-and-forget sync hooks | Template for async best-effort integration; shows hook placement |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| context-schema.cjs | current (Phase 46) | Zod schema for unified context spec | Validate sync configuration (optional but recommended) |
| firecrawl-client.cjs | current (Phase 46) | Unified context retrieval | If Plane source adapter needed for GSD agents to read from Plane (deferred) |
| second-brain.cjs | current | Audit logging | Record all Plane API calls via `recordFirecrawlAudit` with `plane-` prefix |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend plane-client.cjs | Call Plane API directly from roadmap-plane-sync | Would duplicate rate limiting, retry, audit — increases maintenance burden |
| Hook into ROADMAP write | Background polling | Polling introduces delay, complexity, and duplicate writes; deterministic triggers preferred |
| Separate phase and plan issues | Flatten to single issues | Loses hierarchy; parent-child provides better structure but depends on Plane's linking capabilities |
| Force-sync by default | Interactive confirmation | Manual sync should be safe by default; `--force` provided for auto-reconciliation scenarios |

**Installation:**
No new npm packages. Extend existing modules:
- Modify `plane-client.cjs` to add milestone/issue methods
- Create `roadmap-plane-sync.cjs` as new module
- Update `roadmap.cjs` command to add hook (or create separate notifier)

**Version verification:**
```bash
# Verify current plane-client implementation
node -e "console.log(require('./get-stuff-done/bin/lib/plane-client.cjs'))"
# All dependencies are internal; no external version drift
```

## Architecture Patterns

### Recommended Project Structure
```
get-stuff-done/
├── bin/
│   └── lib/
│       ├── plane-client.cjs          # Extended: add createMilestone, createIssue, updateIssue, linkIssueParent
│       ├── roadmap-plane-sync.cjs    # New: ROADMAP → Plane sync orchestration
│       ├── roadmap.cjs               # May add sync command or integrate hook
│       ├── state-plane-sync.cjs      # Pattern reference
│       └── core.cjs                  # Provides findPhaseInternal, safeFs, logWarn
├── .planning/
│   ├── ROADMAP.md                    # Source of truth for milestones/phases
│   └── phases/                       # Phase directories with PLAN/SUMMARY files
├── tests/
│   └── roadmap-plane-sync.test.cjs   # New unit tests
└── .planning/phases/47-*-PLAN.md     # Planning artifacts for this phase
```

### Pattern 1: Fire-and-Forget Sync Hook

**What:** After any ROADMAP.md write, trigger async `syncRoadmapToPlane()` that completes in background. Errors are caught and logged but do not propagate to caller. This matches the `writeStateMd` pattern in state.cjs (lines 959-970).

**When to use:** For opportunistic freshness — when user updates ROADMAP, attempt immediate Plane mirroring.

**Implementation:**
```javascript
// In roadmap-plane-sync.cjs
async function notifyRoadmapChange(cwd, roadmapPath) {
  if (!planeClient.apiKey || !planeClient.projectId) return;
  try {
    await syncFullRoadmap(cwd);
  } catch (err) {
    logWarn('Roadmap sync failed (continuing):', { error: err.message });
  }
}
```

**Hook location:** Wrap `safeWriteFile` calls that write ROADMAP.md in `roadmap.cjs` (likely in `cmdRoadmapUpdatePlanProgress` and any other write operations).

### Pattern 2: Full Reconciliation Command

**What:** `gsd-tools roadmap-sync` performs a complete scan of ROADMAP.md and all phase directories, then synchronizes all milestones, phase issues, and plan issues to Plane. Detects drift and can operate in `--dry-run` or `--force` modes.

**When to use:** Manual operator invocation for initial sync, periodic reconciliation, or after resolving drift.

**Implementation:**
```javascript
// In roadmap.cjs or new commands module
function cmdRoadmapSync(cwd, options) {
  const result = syncFullRoadmap(cwd, { dryRun: options['dry-run'], force: options.force });
  output(result, false, JSON.stringify(result, null, 2));
}
```

**Output format:**
```json
{
  "synced": true,
  "milestones": { "created": 0, "updated": 1, "unchanged": 0 },
  "phases": { "created": 1, "updated": 0, "unchanged": 0, "skipped": 0 },
  "plans": { "created": 2, "updated": 0, "unchanged": 0, "skipped": 0 },
  "drift_detected": 0,
  "duration_ms": 1245
}
```

### Pattern 3: Idempotent Upsert via Custom Fields

**What:** Store GSD identifiers (`gsd_milestone_version`, `gsd_phase_number`, `gsd_plan_id`) in Plane custom fields. Before creating a new milestone/issue, query Plane for an existing entity with matching GSD ID. If found, update it; if not, create new. This ensures repeated runs converge to the same state.

**When to use:** All sync operations to prevent duplicate milestones/issues on re-runs.

**Implementation approach:**
1. For each milestone version: search Plane milestones with filter `gsd_milestone_version={version}`; if 0 → create, if 1 → update, if >1 → error (data corruption)
2. For each phase: search Plane issues with filter `gsd_phase_number={phase}` and `type=Phase`; similar up
3. For each plan: search issues with `gsd_plan_id={plan_id}`; update parent link if needed

### Anti-Patterns to Avoid

- **Blocking main flow:** Never await sync operations in command handlers; always fire-and-forget or run in background.
- **Re-parsing ROADMAP repeatedly:** Parse once per sync run and reuse in-memory representation; use `findPhaseInternal` to cross-validate.
- **Blind overwrites:** Respect `--force` semantics and conflict detection; do not overwrite Plane-owned fields (assignee, comments, external labels).
- **Missing error boundaries:** Each milestone/issue sync should be independent; failure on one must not halt entire batch.
- **Hardcoded Plane IDs:** Never store raw Plane milestone/issue IDs in GSD artifacts; rely on GSD IDs as authoritative lookup keys.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Plane API HTTP client | Custom fetch wrapper | Extend existing `plane-client.cjs` with new methods | Already has rate limiting, retry, audit; consistency with Phase 45 |
| Roamdmap parsing logic | Manual regex on ROADMAP.md | Use `roadmap.cjs` existing functions (`cmdRoadmapGetPhase`, `findPhaseInternal`) | Handles edge cases: shipped milestones, multiple heading levels, malformed content |
| Phase directory discovery | Walk filesystem manually | `findPhaseInternal` from `core.cjs` | Centralized logic; respects archived milestones, normalization, slug parsing |
| Logging infrastructure | Write to console directly | `logWarn`, `logError`, `logDebug` from `core.cjs` | Consistent format with colors, timestamps, and log-level control |
| Single-status persistence | Store state in separate file | Use Plane custom fields and GSD IDs for idempotency | Plane becomes the projection; no additional state files needed |
| Retry/backoff logic | Manual setTimeout loops | PlaneClient `_request` already has exponential backoff (1s, 2s, 4s + jitter) | Proven implementation; just use `_request` in new methods |

**Key insight:** The Plane sync should be a thin orchestration layer. All complex concerns (rate limiting, retry, audit, error handling) are already solved in `plane-client.cjs`. The new code primarily does data transformation and batch coordination.

## Common Pitfalls

### Pitfall 1: Incomplete Status Mapping Leading to Inconsistent UI

**What goes wrong:** GSD status text in ROADMAP.md doesn't match Plane's allowed state values exactly, causing Plane API rejections or ambiguous display.

**Why it happens:** ROADMAP uses bracketed checkboxes `[ ]`, `[x]` and verbal status fields; Plane expects specific state names like "Todo", "In Progress", "Done", "Blocked". Direct mapping may miss edge cases like "[Research]" or "[Discussed]".

**How to avoid:**
- Implement explicit mapping function:
  ```javascript
  function mapGSDStatusToPlane(roadmapStatus) {
    const map = {
      'Planned': 'Todo',
      'Research': 'Backlog',
      'Discussed': 'Todo',  // plus label 'discussed'
      'In Progress': 'In Progress',
      'Blocked': 'Blocked',
      'Complete': 'Done',
      'Verified': 'Done'
    };
    return map[roadmapStatus] || 'Todo';
  }
  ```
- Add special handling for label injection if Plane supports it and status is "Discussed".
- Validate mapped state against Plane's allowed values (query Plane API `/states` if needed during init).

**Warning signs:** Plane API errors mentioning invalid state; issues appear in Plane with wrong status; drift detection reports frequent status mismatches.

### Pitfall 2: Race Conditions Between Concurrent Syncs

**What goes wrong:** Two ROADMAP writes happen in quick succession, triggering overlapping async sync operations. The first sync reads old ROADMAP, the second reads new ROADMAP, but they complete out of order, leaving Plane in stale state.

**Why it happens:** Fire-and-forget hooks don't coordinate; multiple `notifyRoadmapChange` calls run concurrently without serialization.

**How to avoid:**
- Implement a simple in-memory queue in `roadmap-plane-sync.cjs`: debounce rapid calls (e.g., coalesce within 500ms), or process sequentially using a promise chain.
- Alternatively, accept eventual consistency: the last write wins naturally if Plane operations are idempotent; shorter-lived race window is acceptable for non-critical visibility.
- Document that Plane may show intermediate state; eventual consistency is by design.

**Warning signs:** Plane milestone/issue counts fluctuate unexpectedly; audit logs show interleaved operations from different GSD invocations.

### Pitfall 3: Rate Limit Exhaustion During Bulk Initial Sync

**What goes wrong:** Running `gsd-tools roadmap-sync` on a project with 30 phases and 80 plans hits Plane's rate limit (default 60 RPM), causing temporary failures and partial sync.

**Why it happens:** Each milestone creation or issue update consumes one API call. Bulk operations can exceed per-minute quotas, especially with retries on transient failures.

**How to avoid:**
- Leverage plane-client's existing token bucket rate limiting (PLANE_RATE_LIMIT_RPM default 60). Ensure it's active and properly decremented per API call.
- Add adaptive pacing: if rate limit error received, back off for the indicated period and resume.
- Consider batching: if Plane API supports bulk create endpoints, prefer them over individual calls (requires plane-client extension).
- For very large projects, allow operator to temporarily increase `PLANE_RATE_LIMIT_RPM` or run sync in chunks (per milestone).

**Warning signs:** Rate limit errors in logs ("HTTP 429" or "Rate limit exceeded"); sync takes excessively long due to repeated backoffs; partial completion with many skipped items.

### Pitfall 4: Parent-Child Relationship Not Supported by Plane Instance

**What goes wrong:** The Plane deployment (self-hosted or cloud) does not support issue hierarchies or the expected parent field. Attempts to set parent fail with HTTP 400 or silently ignore.

**Why it happens:** Plane's issue linking may require a separate "relationships" endpoint or specific `parent` field name. Custom field approach might be needed for hierarchy representation.

**How to avoid:**
- Research Plane API version being used (likely `plane.so` latest). Determine exact mechanism for parent-child linking:
  - Option A: Issue creation payload includes `parent: issue_id`
  - Option B: Separate `POST /issues/{id}/relationships` after creation
  - Option C: Use custom field `gsd_parent_phase` to encode parent phase number
- Implement feature detection: try creating an issue with parent; if fails with 400, fall back to custom field labeling and log warning.
- Document the fallback behavior and ensure drift detection accounts for missing parent links.

**Warning signs:** Plane API returns "parent field is read-only" or "unknown field parent"; issues appear in Plane but not grouped under phase issues.

### Pitfall 5: Data Divergence from Manual Plane Edits

**What goes wrong:** User manually renames a milestone in Plane UI or changes an issue status. On next GSD sync, the rename gets overwritten (if GSD changes the title) or drift accumulates (if GSD doesn't track GSD IDs).

**Why it happens:** Without proper conflict detection and respect for Plane-owned fields, sync becomes destructive.

**How to avoid:**
- Use GSD custom fields (`gsd_phase_number`, etc.) as immutable identifiers. Only update Plane fields that are explicitly GSD-owned:
  - GSD-owned: title (with caution), description, state (status), milestone_id, parent_id
  - Plane-owned: assignee, external labels, comments, custom fields not prefixed with `gsd_`
- When syncing, compare Plane's current `gsd_last_synced_at` with GSD's intention. If Plane field differs and is GSD-owned, consider it drift and log it. If Plane-owned field differs, ignore.
- Provide `--force` to override drift for GSD-owned fields after explicit operator consent.
- Do not delete or archive Plane entities automatically; soft deletion should be manual to prevent data loss.

**Warning signs:** Audit logs show frequent overwrites of manually edited Plane data; users complain that Plane changes don't persist.

## Code Examples

### Example 1: plane-client.cjs Method Extension (createIssue)

Based on existing `updateProjectMetadata` pattern in `plane-client.cjs` (lines 175-177), new methods follow same structure:

```javascript
// Source: get-stuff-done/bin/lib/plane-client.cjs (to be extended)
async createMilestone(milestoneData) {
  return this._request('create-milestone', `projects/${this.projectId}/milestones`, milestoneData);
}

async createIssue(issueData) {
  return this._request('create-issue', `projects/${this.projectId}/issues`, issueData);
}

async updateIssue(issueId, updates) {
  return this._request('update-issue', `projects/${this.projectId}/issues/${issueId}`, updates);
}

async linkIssueParent(issueId, parentId) {
  return this._request('link-parent', `projects/${this.projectId}/issues/${issueId}/parent`, { parent_id: parentId });
}
```

Each uses `_request` for rate limiting, retry, and audit automatically. The `_request` method already implements exponential backoff (1s, 2s, 4s) and token bucket rate limiting (lines 118-149).

### Example 2: roadmap-plane-sync.cjs Main Sync Orchestration

```javascript
// New module: get-stuff-done/bin/lib/roadmap-plane-sync.cjs
const { safeFs } = require('./core.cjs');
const { findPhaseInternal, getMilestoneInfo } = require('./core.cjs');
const planeClient = require('./plane-client.cjs');
const { logWarn, logInfo } = require('./core.cjs');
const roadmapAnalyze = require('./roadmap.cjs').cmdRoadmapAnalyze;

async function syncFullRoadmap(cwd, options = {}) {
  const start = Date.now();
  const results = {
    milestones: { created: 0, updated: 0, unchanged: 0, errors: 0 },
    phases: { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 },
    plans: { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 },
    drift_detected: 0,
    errors: []
  };

  // Check Plane configured
  if (!planeClient.apiKey || !planeClient.projectId) {
    return { synced: false, reason: 'Plane not configured' };
  }

  try {
    // 1. Get ROADMAP analysis
    const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
    const roadmapContent = safeFs.readFileSync(roadmapPath, 'utf-8');
    const { milestones, phases } = roadmapAnalyze(cwd, true); // raw = true returns structured data

    // 2. For each milestone in ROADMAP, ensure Plane milestone exists
    for (const milestone of milestones) {
      try {
        const version = milestone.version; // e.g., "v0.3.0"
        const name = milestone.heading.trim();

        // Search existing milestone by gsd_milestone_version custom field
        // (Plane API search/filter to be designed based on actual endpoints)
        // For now, assume upsert via create with idempotency key or search-then-create

        // Upsert logic here — call planeClient.createMilestone or update if exists
        // Track results in results.milestones

      } catch (err) {
        results.milestones.errors++;
        results.errors.push({ type: 'milestone', version: milestone.version, error: err.message });
        logWarn('Milestone sync failed', { version: milestone.version, error: err.message });
      }
    }

    // 3. For each phase, create phase issue (parent) and plan issues (children)
    const phasesDir = path.join(cwd, '.planning', 'phases');
    for (const phase of phases) {
      try {
        const phaseInfo = findPhaseInternal(cwd, phase.number);
        if (!phaseInfo) {
          results.phases.skipped++;
          continue;
        }

        // Build phase issue payload with GSD IDs and description
        // Create or update phase issue
        // Track phase results

        // For each plan in phaseInfo.plans, read PLAN.md to get scope/acceptance
        // Create or update child issue with parent reference
        // Track plan results

      } catch (err) {
        results.phases.errors++;
        results.errors.push({ type: 'phase', phase: phase.number, error: err.message });
        logWarn('Phase sync failed', { phase: phase.number, error: err.message });
      }
    }

    results.duration_ms = Date.now() - start;
    results.synced = true;
  } catch (err) {
    results.synced = false;
    results.error = err.message;
  }

  return results;
}

// Hook for ROADMAP write events
async function notifyRoadmapChange(cwd, roadmapPath) {
  if (!planeClient.apiKey || !planeClient.projectId) return;
  try {
    const result = await syncFullRoadmap(cwd, { dryRun: false });
    logInfo('Roadmap sync completed', result);
  } catch (err) {
    logWarn('Roadmap sync failed (continuing):', { error: err.message });
  }
}

module.exports = { syncFullRoadmap, notifyRoadmapChange };
```

**Notes:**
- Uses `findPhaseInternal` (core.cjs:598) to discover phase directories and plan file lists.
- Relies on `roadmap.cjs` parse logic for milestone extraction.
- Wrap all Plane calls in try/catch individually to prevent one failure from blocking batch.
- Uses `logWarn` and `logInfo` from `core.cjs` for consistent logging.

### Example 3: ROADMD Hook Integration

If `cmdRoadmapUpdatePlanProgress` (roadmap.cjs:228) is the primary ROADMAP mutator, wrap the final `safeWriteFile`:

```javascript
// In roadmap.cjs, after roadmapContent is modified and before safeWriteFile:
safeWriteFile(roadmapPath, roadmapContent, { phase: phaseNum, plan: options.plan, wave: options.wave || '1' });

// Replace with:
safeWriteFile(roadmapPath, roadmapContent, { phase: phaseNum, plan: options.plan, wave: options.wave || '1' });
// Fire-and-forget async roadmap sync
if (process.env.PLANE_SYNC_ENABLED !== 'false') {
  const roadmapSync = require('./roadmap-plane-sync.cjs');
  roadmapSync.notifyRoadmapChange(cwd, roadmapPath).catch(() => {});
}
```

This mirrors the pattern in `state.cjs:writeStateMd` (lines 966-969) for STATE.md sync.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No Plane visibility | STATE.md → Plane project metadata sync (Phase 45) | 2026-03-24 | Basic project state visible in Plane |
| Manual status tracking | ROADMAP.md → Plane milestones + issues (Phase 47) | Proposed | Full roadmap visible with hierarchy |
| Ad-hoc context retrieval | Firecrawl unified `crawl(spec)` (Phase 46) | 2026-03-24 | Single source for all context |
| Unstructured Plane sync | Extended plane-client with createMilestone/createIssue | Proposed | Consistent API client across sync features |

**Deprecated/outdated:**
- Direct file reads by agents for context (being replaced by Firecrawl `crawl`, but not in Phase 47 scope)
- Manual Plane updates (automated sync eliminates human duplication)

## Open Questions

1. **Plane API Parent-Child Linking Exactness**
   - What we know: Plane supports issue relationships; common patterns include `parent` field or `relationships` subresource. Phase 45 research mentioned "Plane API v1 specifications" but didn't capture details.
   - What's unclear: Exact endpoint names, payload structure, and whether child issues require explicit parent linking after creation.
   - Recommendation: Inspect Plane API OpenAPI spec if available in deployment; add a small discovery script to test parent linking against a test Plane instance. Design fallback using custom field `gsd_parent_phase` if native linking unavailable.

2. **Milestone Search/Filter Mechanism**
   - What we know: plane-client currently only has `updateProjectMetadata`. Need methods for milestone CRUD and list/filter.
   - What's unclear: Whether Plane API provides list endpoints with custom field filtering (e.g., `GET /milestones?gsd_milestone_version=v0.3.0`). If not, we may need to store a local index of GSD→Plane ID mappings in a file (`.planning/plane-index.json`) to avoid repeated search.
   - Recommendation: Design plane-client methods with flexible query support; if custom field filters unavailable, implement a simple in-memory cache that persists to `.planning/plane-mappings.json` (subject to authority envelopes? likely needs to be in `.planning/`).

3. **Bulk vs Individual API Calls**
   - What we know: plane-client currently does one-action-per-request. Bulk create endpoints (if available) would reduce rate limit pressure.
   - What's unclear: Does Plane API expose batch endpoints for milestones/issues? Most REST APIs do not.
   - Recommendation: Assume individual endpoints; monitor performance. If bulk needed later, extend plane-client with `batchCreateMilestones` etc., and update roadmap-plane-sync to batch per milestone.

4. **Validation & Testing Strategy**
   - What we know: Phase 45 created unit tests mocking `_makeRequest`. Phase 46 followed similar patterns. We'll need tests for roadmap-plane-sync that mock plane-client calls and verify correct mapping.
   - What's unclear: Integration test environment with live Plane instance? Likely out of scope for Phase 47; unit tests with 100% coverage are sufficient per GSD standards.
   - Recommendation: Follow existing test patterns (tests/plane-client.test.cjs) — stub plane-client methods, assert payloads, test status mapping, error handling, dry-run mode. Add tests that verify `findPhaseInternal` usage for phase discovery.

## Validation Architecture

**Test Framework:** node:test (built-in), assert

**Quick run command:**
```bash
node --test tests/roadmap-plane-sync.test.cjs
```

**Full suite command:**
```bash
node --test tests/
```

**Phase Requirements → Test Map**

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PLANE-VISIBILITY-02 | Milestone/issue creation from ROADMAP | unit | `node --test tests/roadmap-plane-sync.test.cjs::test_milestone_upsert` | ❌ Wave 0 |
| PLANE-VISIBILITY-02 | Status mapping from ROADMAP to Plane | unit | `node --test tests/roadmap-plane-sync.test.cjs::test_status_mapping` | ❌ Wave 0 |
| PLANE-SYNC-02 | Drift detection and logging | unit | `node --test tests/roadmap-plane-sync.test.cjs::test_drift_detection` | ❌ Wave 0 |
| PLANE-SYNC-02 | Dry-run and force modes | unit | `node --test tests/roadmap-plane-sync.test.cjs::test_dry_run_and_force` | ❌ Wave 0 |
| Both | Error handling and continuation | unit | `node --test tests/roadmap-plane-sync.test.cjs::test_error_handling` | ❌ Wave 0 |

**Sampling Rate:**
- Per task commit: `node --test tests/roadmap-plane-sync.test.cjs` (runs all tests in module)
- Per wave merge: `node --test tests/` (entire suite)
- Phase gate: Full suite green before `/gsd:verify-work`

**Wave 0 Gaps:**
- [ ] `tests/roadmap-plane-sync.test.cjs` — comprehensive unit tests covering sync orchestration, mapping, error handling, dry-run, force
- [ ] `tests/plane-client-methods.test.cjs` (if plane-client is extended) — unit tests for new createMilestone/createIssue/updateIssue methods (could be part of existing plane-client.test.cjs update)
- No special framework config required; node:test is built-in

If plane-client extensions are tested within the module, update existing `tests/plane-client.test.cjs`:
- [ ] Add tests for `createMilestone` payload formation and `_request` call
- [ ] Add tests for `createIssue` with parent reference
- [ ] Add tests for `updateIssue` with partial updates

## Sources

### Primary (HIGH confidence)
- `get-stuff-done/bin/lib/plane-client.cjs` — PlaneClient singleton with rate limiting, retry, audit (Lines 1-181)
- `get-stuff-done/bin/lib/state-plane-sync.cjs` — Fire-and-forget sync pattern (Lines 1-33)
- `get-stuff-done/bin/lib/roadmap.cjs` — ROADMAP parsing functions: `cmdRoadmapGetPhase`, `cmdRoadmapAnalyze`, `findPhaseInternal` usage (Lines 1-310)
- `get-stuff-done/bin/lib/core.cjs` — `findPhaseInternal` phase discovery (Lines 598-665), safe utilities, logging
- `.planning/phases/45-plane-augmented-context-control/45-01-PLAN.md` — Implementation pattern reference for Plane integration (Lines 1-425)
- `.planning/phases/47-plane-roadmap-sync/47-CONTEXT.md` — User decisions, status mapping, trigger strategy, data enrichment (Lines 1-256)

### Secondary (MEDIUM confidence)
- Plane API v1 specifications (implied from Phase 45 research; not directly verified) — Endpoint patterns: `/v1/projects/{id}/milestones`, `/v1/projects/{id}/issues`, custom fields for GSD IDs
- Plane issue hierarchy support (parent-child) — Inference from standard issue tracker patterns; exact implementation details TBD (confidence MEDIUM)

### Tertiary (LOW confidence)
- Plane API rate limits and bulk operation endpoints — Not verified; will depend on actual Plane deployment version and configuration
- Custom field search/filter capabilities — Assumed to support querying by `gsd_*` fields; may require alternative indexing if unsupported

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Based on existing codebase; plane-client, roadmap.cjs, core.cjs are verified
- Architecture: HIGH — Follows established state-plane-sync pattern; decisions locked in CONTEXT.md
- Pitfalls: MEDIUM — Some based on general distributed systems patterns; Plane-specific quirks to be validated during implementation
- Plane API specifics: MEDIUM — Inferred from common REST patterns and Phase 45; exact endpoints and payload fields may need minor adjustments

**Research date:** 2026-03-25
**Valid until:** 30 days (stable architecture, but Plane API version changes possible)
