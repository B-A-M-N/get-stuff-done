# SUMMARY: 12-03 - Replay / Reproduce Workflow

## Outcome
Implemented deterministic replay of synthesis artifacts using `derivePhaseTruth`, with integrity verification and mission reconstruction capabilities.

## What Changed
- **`bin/lib/synthesis-replay.cjs`**:
  - `replayArtifact(artifact_id, options)` → `{ replayed_content, matches, failure_category, errors }`
  - `verifyArtifactIntegrity(artifact_id)` → boolean shortcut
  - `reconstructMissionState(mission_id)` → aggregates per-artifact integrity
- **Failure categorization** (strict):
  - `NOT_FOUND` — artifact missing
  - `MISSING_ATOM` — provenance file absent on disk
  - `VALIDATION_REJECTION` — `derivePhaseTruth` threw
  - `CONTENT_MISMATCH` — YAML compare failed (drift)
- **CLI commands** (`bin/lib/commands.cjs`):
  - `gsd verify-synthesis <artifact_id>` — exits 0 (match) / 1 (drift) / 2 (not found)
  - `gsd replay-mission <mission_id>` — batch report (JSON)
- **Determinism fixture**: `.planning/phases/12-synthesis-retrieval-replay/fixtures/phase52-derived-truth.yaml`
- **Test**: `tests/determinism.test.cjs` ensures `derivePhaseTruth(52)` output remains byte-identical

## Verification
- Unit: `synthesis-replay.test.cjs` (7 tests) + `determinism.test.cjs` (1 test) all passing
- Integration: `verify-synthesis syn_7aa51411a4c1de59` reports match ✅; `replay-mission 52` reports 100% intact
- Replay algorithm:
  1. Load artifact + sections
  2. Collect atoms (artifact + section atoms), sort deterministically
  3. Verify all atoms exist on disk
  4. Call `derivePhaseTruth(cwd, mission_id, { now: stored_generated_at })`
  5. Render YAML and compare to stored `artifact.content` (trim-normalized)
  6. Return categorized pass/fail

## Notes
- Replay does NOT require PostgreSQL; works with SQLite fallback.
- Stored artifact's `generated_at` is re-used to ensure deterministic regeneration.
- Any `matches: false` result includes `failure_category` for downstream triage.
