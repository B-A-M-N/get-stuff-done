/**
 * Synthesis Metrics — Quality scoring and ranking for synthesis artifacts.
 *
 * Ownership: Phase 12 surface layer
 * Purpose: Compute quality metrics and rank artifacts for mission planning.
 */

const path = require('path');

function getSourceTypes(artifact) {
  const types = new Set();

  // From atom file extensions
  for (const atom of artifact.atom_ids_used || []) {
    const ext = path.extname(atom).toLowerCase();
    if (['.md', '.txt', '.rst', '.markdown'].includes(ext)) {
      types.add('document');
    } else if (['.json', '.csv', '.xml', '.yaml', '.yml'].includes(ext)) {
      types.add('data');
    } else {
      types.add('other');
    }
  }

  // From citation types
  for (const c of artifact.synthesis_citations || []) {
    types.add(c.type);
  }

  return types;
}

/**
 * Compute quality metrics for a single artifact (with sections).
 *
 * Metrics:
 * - density: atoms per byte (higher = more evidence per output byte)
 * - diversity: count of distinct source types (document, data, other, file, command, etc.)
 * - completeness: section coverage with atom density (0-1)
 * - evidence_richness: distinct citation types / total citations
 *
 * @param {object} artifact - Must include atom_ids_used, sections[], content, synthesis_citations
 * @returns {object} scores { density, diversity, completeness, evidence_richness, composite_score }
 */
function scoreArtifact(artifact) {
  const atoms = artifact.atom_ids_used || [];
  const atomCount = atoms.length;
  const contentLength = artifact.content?.length || 0;
  const sections = artifact.sections || [];

  // Density: atoms per byte (higher is better)
  const density = contentLength > 0 ? atomCount / contentLength : 0;

  // Diversity: distinct source types
  const diversity = getSourceTypes(artifact).size;

  // Completeness: section coverage
  const totalSections = sections.length;
  let completeness = 0;
  if (totalSections > 0) {
    const sectionsWithAtoms = sections.filter(s => s.atom_ids_used && s.atom_ids_used.length > 0).length;
    const totalAtomsInSections = sections.reduce((sum, s) => sum + (s.atom_ids_used?.length || 0), 0);
    const avgAtoms = totalAtomsInSections / totalSections;
    const normalizedCoverage = Math.min(avgAtoms / 10, 1); // cap at 1 for avg > 10
    completeness = (sectionsWithAtoms / totalSections) * normalizedCoverage;
  }

  // Evidence richness: distinct citation types / total citations
  const citations = artifact.synthesis_citations || [];
  const totalCitations = citations.length;
  let evidence_richness = 0;
  if (totalCitations > 0) {
    const citationTypes = new Set(citations.map(c => c.type));
    evidence_richness = citationTypes.size / totalCitations;
  }

  // Composite score with plan-defined weights (0.4, 0.2, 0.3, 0.1)
  const composite_score =
    density * 0.4 +
    diversity * 0.2 +
    completeness * 0.3 +
    evidence_richness * 0.1;

  return {
    density,
    diversity,
    completeness,
    evidence_richness,
    composite_score
  };
}

/**
 * Compute Jaccard similarity between two sets.
 * similarity = |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

/**
 * Find artifacts with similar atom usage within the same mission.
 * Uses Jaccard similarity on atom_ids_used sets.
 */
async function findSimilarArtifacts(artifact_id, threshold = 0.5) {
  if (!artifact_id) throw new Error('artifact_id is required');

  const store = require('./synthesis-store.cjs');

  const artifact = await store.getArtifactWithSections(artifact_id);
  if (!artifact) {
    throw new Error(`Artifact ${artifact_id} not found`);
  }

  const missionId = artifact.mission_id;
  // Get all artifacts for the same mission (including the artifact itself)
  const candidates = await store.findArtifacts({ mission_id: mission_id });

  const results = [];
  for (const candidate of candidates) {
    if (candidate.id === artifact_id) continue;
    const similarity = jaccardSimilarity(artifact.atom_ids_used || [], candidate.atom_ids_used || []);
    if (similarity >= threshold) {
      results.push({
        artifact: {
          id: candidate.id,
          type: candidate.artifact_type,
          mission_id: candidate.mission_id,
          created_at: candidate.created_at
        },
        similarity
      });
    }
  }

  // Sort by similarity desc, then created_at desc (newer wins ties)
  results.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return new Date(b.artifact.created_at) - new Date(a.artifact.created_at);
  });

  return results;
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
  rankMissionArtifacts,
  jaccardSimilarity,
  findSimilarArtifacts
};
