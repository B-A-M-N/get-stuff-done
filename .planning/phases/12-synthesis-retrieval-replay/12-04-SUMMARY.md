# SUMMARY: 12-04 - Ranking / Comparison Primitives

## Outcome
Implemented evidence-quality scoring engine for synthesis artifacts with deterministic metrics and similarity detection.

## What Changed
- **`bin/lib/synthesis-metrics.cjs`**:
  - `scoreArtifact(artifact)` → `{ density, diversity, completeness, evidence_richness, composite_score }`
  - `rankMissionArtifacts(missionId, limit=10)` → `{ mission_id, total, ranked[] }` sorted DESC by composite score
  - `jaccardSimilarity(setA, setB)` and `findSimilarArtifacts(artifact_id, threshold=0.5)` for similarity-based reuse detection
- **Metric formulas** (plan-defined):
  - `density = atom_count / content_length` (atoms per byte)
  - `diversity = count(DISTINCT source_types)` (from atom extensions + citation types)
  - `completeness = (sections_with_atoms / total_sections) * (avg_atoms_per_section / 10 capped)`
  - `evidence_richness = distinct_citation_types / total_citations`
  - `composite_score = density*0.4 + diversity*0.2 + completeness*0.3 + evidence_richness*0.1`
- **CLI command** (`bin/lib/commands.cjs`):
  - `gsd rank-synthesis <mission_id> [--limit N] [--raw]` → JSON table of ranked artifacts
- **Tests**: `tests/synthesis-metrics.test.cjs` expanded with unit fixtures (8 tests passing)

## Verification
- Unit tests cover density, diversity, completeness, richness, Jaccard edge cases
- CLI `gsd rank-synthesis 52` executes and prints ranked results
- All functions compute from `synthesis_artifacts` fields only; no external calls

## Notes
- Ranking is **advisory only**; never used for truth gating, blocking, or correctness signals.
- `findSimilarArtifacts` searches within the same mission (cross-mission reuse can be added later).
- Composite score weights lock to plan values (0.4/0.2/0.3/0.1) to avoid speculative tuning.
