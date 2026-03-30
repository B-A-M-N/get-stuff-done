/**
 * Synthesis Metrics — Quality scoring and ranking for synthesis artifacts.
 *
 * Ownership: Phase 12 surface layer
 * Purpose: Compute quality metrics and rank artifacts for mission planning.
 */

/**
 * Compute quality metrics for a single artifact (with sections).
 *
 * Metrics:
 * - density: sections per atom (normalized)
 * - diversity: unique atom count (raw)
 * - completeness: has sections (binary)
 * - evidence_richness: content length in KB
 *
 * @param {object} artifact - Must include atom_ids_used, sections[], content
 * @returns {object} scores { density, diversity, completeness, evidence_richness, composite_score }
 */
function scoreArtifact(artifact) {
  const atomCount = artifact.atom_ids_used?.length || 0;
  const sectionCount = artifact.sections?.length || 0;
  const contentLength = artifact.content?.length || 0;

  // Density: sections per atom (cap at 1.0, 0 if no atoms)
  const density = atomCount > 0 ? Math.min(sectionCount / atomCount, 1.0) : 0;

  // Diversity: unique atom count (log-scaled to dampen large numbers)
  // log10(1 + atomCount) gives 0 for 0, 1 for 1-9, 2 for 10-99, 3 for 100-999, etc.
  const diversity = Math.log10(1 + atomCount);

  // Completeness: has at least one section (binary)
  const completeness = sectionCount > 0 ? 1 : 0;

  // Evidence richness: content length in KB (cap at 50 for score)
  const evidence_richness = Math.min(contentLength / 1000, 50);

  // Composite: weighted sum (weights should sum to ~1 for intuitive scaling)
  // Adjust based on what matters most for your use case
  const composite_score =
    density * 0.15 +
    diversity * 0.25 +
    completeness * 0.30 +
    (evidence_richness / 50) * 0.30; // normalize to 0-1

  return {
    density,
    diversity,
    completeness,
    evidence_richness,
    composite_score: Math.min(composite_score, 1.0) // cap at 1.0
  };
}

/**
 * Rank all artifacts for a mission by composite quality score.
 *
 * @param {string} missionId
 * @param {number} [limit=10] - Max results
 * @returns {Promise<object>} { mission_id, total, ranked: [] }
 */
async function rankMissionArtifacts(missionId, limit = 10) {
  if (!missionId) {
    throw new Error('missionId is required');
  }

  const store = require('./synthesis-store.cjs');

  // Get timeline (includes all artifact fields)
  const artifacts = await store.getMissionSynthesisTimeline(missionId);

  // Enrich with sections and compute scores
  const scored = await Promise.all(
    artifacts.map(async (artifact) => {
      const sections = await store.getSynthesisSections(artifact.id);
      const metrics = scoreArtifact({
        ...artifact,
        sections
      });

      return {
        id: artifact.id,
        type: artifact.artifact_type,
        created_at: artifact.created_at,
        sections: sections.length,
        atoms: artifact.atom_ids_used?.length || 0,
        citations: artifact.synthesis_citations?.length || 0,
        content_length: artifact.content?.length || 0,
        score: metrics.composite_score,
        metrics
      };
    })
  );

  // Sort: composite_score DESC, then created_at DESC (newer wins ties)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return {
    mission_id: missionId,
    total: artifacts.length,
    ranked: scored.slice(0, limit)
  };
}

module.exports = {
  scoreArtifact,
  rankMissionArtifacts
};
