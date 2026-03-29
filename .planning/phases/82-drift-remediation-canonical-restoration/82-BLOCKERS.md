# Phase 82 Execution Blocker

**Detected**: 2026-03-28T21:38:00Z (updated 2026-03-29)

## Failed Task

82-01: Restore Postgres canonical memory and refresh health

## Observed State (Current Diagnosis)

The system is blocked by **truth posture degradation**, not CLI dispatch issues. Actual blockers:

1. **Postgres authentication failure** (PRIMARY BLOCKER)
   - `gsd-tools brain status` shows:
     - `configured_backend: "postgres"`
     - `active_backend: "sqlite"`
     - `degraded: true`
     - `degraded_reason: "postgres_auth_failed"`
     - `model_facing_memory.available: false`
   - Impact: Canonical memory unavailable, all truth-bearing workflows blocked

2. **Open Brain runtime split (Phase 70 drift)**
   - Inconsistent `degraded` flag between repo-local and installed runtimes
   - Causes drift finding: `phase70-open-brain-runtime-split`
   - Requires fix in `open-brain.cjs` `getBackendState()` degraded computation

3. **Planning-server hardcoded integrity claims (P0 truth violation)**
   - Audit logs contain `integrity: { narrative_drift_score: 1.0, coherence_check_passed: true }`
   - These are static optimistic lies violating TRUTH-CLAIM-01
   - Must replace with `integrity: null` or computed evidence-bound value

4. **Test instability (48 failures)**
   - Undermines trust in enforcement, but not directly blocking Phase 82
   - Secondary concern; may address after truth restoration

## Verification Commands Demonstrating Blockage

```bash
# Shows degraded state and Postgres fallback
node get-stuff-done/bin/gsd-tools.cjs brain status

# Shows UNSAFE canonical state and blocked workflows
node get-stuff-done/bin/gsd-tools.cjs health check

# Confirms degraded mode
node get-stuff-done/bin/gsd-tools.cjs degraded-mode
```

## Required Fixes (In Order)

1. **Restore Postgres connectivity** (82.A-02)
   - Check credentials: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD
   - Verify Postgres process running: `pg_isready` or `ps aux | grep postgres`
   - Test manual connect: `sudo -u postgres psql -l`
   - Ensure database exists: `gsd_local_brain_<project_hash>`
   - Fix pg_hba.conf, password rotation, or privileges as needed
   - Verify: `brain status --require-postgres` exits 0, `health check` shows `canonical_state: "HEALTHY"`

2. **Resolve Open Brain degraded flag inconsistency** (82.A-03)
   - After Postgres fixed, ensure `backendState.degraded` accurately reflects fallback state
   - Both repo-local and installed runtimes must agree on degraded flag

3. **Remove hardcoded integrity claims** (82.A-04)
   - Replace all `integrity: { narrative_drift_score: 1.0, coherence_check_passed: true }` with `integrity: null`
   - Ensure downstream consumers handle null without crashes

4. **Regenerate Phase 81 TRUTH in non-degraded mode** (82.A-05)
   - After Postgres restored, regenerate 81-TRUTH to achieve `final_status: "VALID"`

5. **Final validation sweep** (82.A-06)
   - Run `validate-all --strict` to confirm exit 0

## Acceptance Criteria

- `brain status --require-postgres` exits 0
- `health check` shows `model_facing_memory.canonical_state === "HEALTHY"`
- `degraded_mode === false`
- Round-trip write/read test succeeds on Postgres
- Drift scan shows `phase70-open-brain-runtime-split` resolved
- Planning-server emits no `1.0` integrity literals
- `81-TRUTH.yaml` contains `final_status: VALID`
- `validate-all --strict` exits 0