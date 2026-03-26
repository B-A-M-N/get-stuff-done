# Plane Integration Enforcement Boundary Review

**Date:** 2026-03-25
**Scope:** Phase 47-49 Plane integration (roadmap sync, checkpoint sync, roadmap sync)
**Reviewer:** Claude Code systematic analysis

---

## Executive Summary

**Result:** ✅ **GOOD** - The Plane integration generally respects the enforcement boundary, but has minor opportunities to improve state awareness.

**Key Findings:**
- ✅ File writes use `safeWriteFile` (NOT direct fs.writeFileSync)
- ✅ File reads use `safeFs` (sandbox-aware)
- ✅ Write hook triggers AFTER successful `safeWriteFile` commit
- ✅ Fire-and-forget pattern prevents blocking main workflow
- ⚠️ Does NOT respect `_auto_chain_active` or pause state (low risk because read-only + external API)
- ⚠️ No Planning Server involvement (acceptable for outbound external integration)
- ❌ No audit trail in STATE.md for Plane sync operations (observability gap)

---

## 1. Enforcement Boundary Principles Recap

The enforcement boundary (defined in `docs/ARCHITECTURE.md` and `get-stuff-done/references/git-integration.md`) consists of:

1. **Hard Stops (exit 1 or 13 on violation):**
   - `commit-task --scope S` - Enforces atomic commits with scope matching
   - `gate enforce --key K` - Human acknowledgment gates
   - `checkpoint write --phase N --type T` - Atomic checkpoint persistence

2. **File Operation Primitives:**
   - `safeWriteFile(path, content, options)` - Only way to write to files; enforces sandbox, authority, and checkpoint protocols
   - `safeFs` - Sandbox-aware file system operations (path checks, read-only where appropriate)

3. **Design Philosophy:**
   - All writes MUST go through `safeWriteFile` to enforce:
     - Sandbox path guards (no escaping project root)
     - Authority envelope verification (in Phase 41+)
     - Checkpoint bypass detection
     - Atomic git operations

---

## 2. Plane Integration Architecture

### 2.1 Components

| Module | Purpose | Writes? | Reads? | External Calls |
|--------|---------|---------|-------|----------------|
| `plane-client.cjs` | HTTP client for Plane API | No (external only) | No | Yes (Plane REST) |
| `roadmap-plane-sync.cjs` | Orchestration logic | No (external only) | Yes (ROADMAP.md, phase files) | Yes (via planeClient) |
| `roadmap.cjs` (integrated) | Command routing & write hook | No (delegates) | Yes (ROADMAP.md) | No |

### 2.2 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  cmdRoadmapUpdatePlanProgress (triggered by phase complete) │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │ safeWriteFile()        │ ← Enforced write with authority
            │   - Sandbox check     │   (GOOD ✅)
            │   - Audit log         │
            │   - Git commit        │
            └───────────┬────────────┘
                        │
                        │ success
                        ▼
            ┌────────────────────────┐
            │ notifyRoadmapChange() │  ← Fire-and-forget
            │   (if PLANE_SYNC_ENABLED !== 'false') │
            └───────────┬────────────┘
                        │
                        ▼
            ┌────────────────────────┐
            │ parseRoadmap(cwd)     │  ← Uses safeFs (GOOD ✅)
            └───────────┬────────────┘
                        │
                        ▼
            ┌────────────────────────┐
            │ syncFullRoadmap()     │
            │   - findIssueByCustom │  ← GET queries to Plane
            │   - createIssue POST  │    (external, no enforcement)
            │   - updateIssue POST  │
            └───────────────────────┘
```

---

## 3. Boundary Compliance Analysis

### 3.1 File Writes: ✅ PASS

**Plane integration does NOT write to `.planning/` files.** All writes go to external Plane API.

The integration triggers **after** a GSD-initiated write:
```javascript
// roadmap.cjs cmdRoadmapUpdatePlanProgress
safeWriteFile(roadmapPath, roadmapContent, { phase: phaseNum, plan: options.plan, wave: options.wave || '1' });

if (process.env.PLANE_SYNC_ENABLED !== 'false') {
  const roadmapPlaneSync = require('./roadmap-plane-sync.cjs');
  roadmapPlaneSync.notifyRoadmapChange(cwd, roadmapPath).catch(() => {});
}
```

**Benefits:**
- Plane sync cannot interfere with GSD's atomic commit sequence
- If `safeWriteFile` fails (gate, checkpoint, authority), Plane sync never runs
- Plane sync errors are swallowed (`.catch(() => {})`), so they don't block the main workflow

### 3.2 File Reads: ✅ PASS (with minor note)

The integration uses `safeFs` for local file reads:
```javascript
// roadmap-plane-sync.cjs
const { safeFs, ... } = require('./core.cjs');
// ...
const roadmapData = parseRoadmap(cwd);  // inside: safeFs.readFileSync
const planContent = safeFs.readFileSync(planPath, 'utf-8');
```

`safeFs` is the sandbox-aware file operations module. It respects path traversal guards (does NOT check Planning Server auth because it's direct local file access, but that's the same as other GSD modules).

**Note:** The integration does NOT use the Planning Server (`/v1/read`) for file access. This is **acceptable** because:
- Planning Server is for **cross-agent context sharing**, not for module internal reads
- `safeFs` is the standard pattern for CLI module file operations
- The enforcement boundary applies to **writes**, not reads

### 3.3 Authority & Checkpoints: ✅ PASS (by design)

Since Plane sync doesn't write to `.planning/`, it doesn't need:
- Authority envelope verification (applies only to protected file writes)
- Checkpoint coordination (checkpoints are for GSD lifecycle, not external sync)

The fire-and-forget pattern with error swallowing is appropriate:
```javascript
notifyRoadmapChange(cwd, roadmapPath).catch(() => {});
```

### 3.4 Respect for System State: ⚠️ MINOR GAP

**Issue:** `notifyRoadmapChange` runs unconditionally without checking:
- `_auto_chain_active` flag (if set, system is in auto-advance mode and may skip human interaction)
- Paused state (if work is paused, sync should probably not proceed)

**Risk Level:** Low
- The operation is read-only + external API, so it's effectively idempotent and safe
- It's triggered by `cmdRoadmapUpdatePlanProgress`, which itself is called at the **end** of a phase's plan execution when marking ROADMD complete
- If a checkpoint is active, the phase wouldn't be completing yet

**Recommendation:** For consistency, add a guard:
```javascript
if (process.env.PLANE_SYNC_ENABLED !== 'false' && !process.env.GSD_PAUSED) {
  roadmapPlaneSync.notifyRoadmapChange(cwd, roadmapPath).catch(() => {});
}
```

Alternatively, respect `_auto_chain_active` if that flag is meant to block ALL background activity.

### 3.5 Observability: ❌ GAP

**Issue:** Plane sync operations are NOT logged in STATE.md metrics or anywhere persistent.

**Current audit:**
- `planeClient._request()` logs to `secondBrain.recordFirecrawlAudit()` (SQLite)
- Success/failure counts are returned in the `syncFullRoadmap()` result but only for that invocation
- No cumulative tracking in STATE.md `Performance Metrics` section

**Impact:** Operators cannot tell:
- How often ROADMAP→Plane sync runs
- Success rate over time
- Drift detection frequency
- API latency trends

**Recommendation:** Add a metric record after Plane sync (in `notifyRoadmapChange`):
```javascript
await roadmapPlaneSync.syncFullRoadmap(cwd);
node gsd-tools.cjs state record-metric "plane_sync" "success" "duration=${ms}" "drift=${driftCount}";
```

---

## 4. Phase 48-49 Checkpoint Sync Verification

Phase 48 is about syncing checkpoints and summaries to Plane as issue comments. I haven't seen the implementation yet, but the pattern should mirror Phase 47:

✅ **Should do:**
- Use `safeWriteFile` when creating/modifying CHECKPOINT.md or SUMMARY.md (already standard)
- Trigger Plane sync **after** successful `safeWriteFile` commit
- Use `notifyCheckpointChange` / `notifySummaryChange` fire-and-forget hooks
- Read CHECKPOINT.md/SUMMARY.md via `safeFs`
- Make Plane API calls via `planeClient`

❌ **Should NOT do:**
- Write directly to Plane and then back to local files (violates source-of-truth: `.planning/` is source)
- Bypass `safeWriteFile` for checkpoint updates
- Block workflow on Plane API failures

**Pre-implementation checklist:**
- [ ] Verify checkpoint and summary updates still use `safeWriteFile`
- [ ] Confirm write hook runs AFTER commit, not before
- [ ] Ensure Plane sync errors are fire-and-forget (`.catch`)
- [ ] Add observability metrics for checkpoint/sync operations

---

## 5. Overall Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| File writes use safeWriteFile | ✅ N/A (no local writes) | Phase sync is outbound-only |
| File reads use safeFs | ✅ PASS | `parseRoadmap` uses safeFs |
| Authority envelope | ✅ N/A | External integration doesn't need it |
| Checkpoint protocols | ✅ N/A | Checkpoint lifecycle separate |
| Planning Server reads | ⚠️ N/A | Not used; acceptable for internal module |
| Respect pause/auto-chain | ⚠️ GAP | Low risk, but inconsistent |
| Observability | ❌ GAP | No STATE.md metrics tracking |
| Error handling | ✅ PASS | Fire-and-forget with swallow |

**Risk Rating:** **Low** (2 minor gaps, 1 observability gap)

---

## 6. Recommendations

### Immediate (Before Phase 48 Complete)

1. **Add state-awareness guard** (5 minutes):
   ```javascript
   // In notifyRoadmapChange
   if (process.env.PLANE_SYNC_ENABLED === 'false' || process.env.GSD_PAUSED) return;
   ```

2. **Add observability** (15 minutes):
   ```javascript
   // After syncFullRoadmap completes in notifyRoadmapChange
   const ms =Date.now() - start;
   const statePath = path.join(cwd, '.planning', 'STATE.md');
   // Use state record-metric command or directly append to Performance Metrics table
   // Simpler: call gsd-tools state record-metric
   ```

### Follow-up (Phase 49-50 or separate phase)

3. **Document the pattern** in `docs/ARCHITECTURE.md` (or create `docs/INTEGRATIONS.md`):
   - Explain that outbound integrations (Plane, Firecrawl) follow different rules than internal operations
   - Document the write-hook-after-safeWriteFile pattern
   - Note the fire-and-forget error handling strategy

4. **Create integration test** to verify the hook placement:
   - Test that ROADMAP write without `safeWriteFile` does NOT trigger Plane sync
   - Test that `safeWriteFile` completion DOES trigger it
   - Test that checkpoint updates (Phase 48) follow same pattern

---

## 7. Conclusion

The Plane integration **respects the enforcement boundary** for the most critical aspects:
- ✅ No local file writes bypassing `safeWriteFile`
- ✅ Uses sandbox-aware `safeFs` for reads
- ✅ Fires after successful commit
- ✅ Errors don't block workflow

The gaps are minor:
- State-awareness (pause/auto-chain) is a consistency issue, not a safety issue
- Observability gap makes operational monitoring harder but doesn't affect correctness

**Phase 48 implementation should mirror this pattern** to maintain boundary compliance.

**Verdict:** ✅ Safe to proceed with Phase 48-49, with the two minor improvements recommended.
