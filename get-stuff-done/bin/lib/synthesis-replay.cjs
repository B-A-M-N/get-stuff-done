/**
 * Synthesis Replay — Reconstruct and verify synthesis artifacts.
 *
 * Ownership: Phase 12 surface layer
 * Purpose: Provide replay and integrity verification for stored synthesis artifacts.
 */

const store = require('./synthesis-store.cjs');

/**
 * Reconstruct the complete state of a mission's synthesis artifacts.
 * Validates integrity and aggregates metrics.
 *
 * @param {string} missionId
 * @returns {Promise<object>} reconstruction report
 */
async function reconstructMissionState(missionId) {
  if (!missionId) {
    throw new Error('missionId is required');
  }

  // Fetch all artifacts in timeline order
  const artifacts = await store.getMissionSynthesisTimeline(missionId);

  // Enrich with sections and compute per-artifact integrity
  const enriched = await Promise.all(
    artifacts.map(async (artifact) => {
      const sections = await store.getSynthesisSections(artifact.id);

      // Integrity check: if sections exist, verify content matches reconstruction
      let integrity = 'intact';
      if (sections.length > 0) {
        const reconstructed = sections.map(s => s.section_content).join('\n\n');
        // Normalize whitespace for comparison
        const normalizedStored = (artifact.content || '').trim().replace(/\s+$/gm, '');
        const normalizedReconstructed = reconstructed.trim().replace(/\s+$/gm, '');
        if (normalizedStored !== normalizedReconstructed) {
          integrity = 'drift';
        }
      }

      return {
        id: artifact.id,
        type: artifact.artifact_type,
        created_at: artifact.created_at,
        section_count: sections.length,
        atom_count: artifact.atom_ids_used?.length || 0,
        citation_count: artifact.synthesis_citations?.length || 0,
        integrity,
        sections
      };
    })
  );

  // Aggregate metrics
  const allAtoms = new Set(enriched.flatMap(a => a.atom_ids_used || []));
  const artifactStatuses = enriched.map(a => a.integrity);
  const allIntact = artifactStatuses.every(s => s === 'intact');

  return {
    mission_id: missionId,
    artifact_count: enriched.length,
    total_sections: enriched.reduce((sum, a) => sum + a.section_count, 0),
    total_atoms_unique: allAtoms.size,
    overall_status: allIntact ? 'intact' : 'degraded',
    artifacts: enriched.map(a => ({
      id: a.id,
      type: a.type,
      created_at: a.created_at,
      sections: a.section_count,
      atoms: a.atom_count,
      citations: a.citation_count,
      integrity: a.integrity
    }))
  };
}

/**
 * Verify a single artifact's integrity.
 *
 * @param {string} artifactId
 * @returns {Promise<object>} verification result { ok, overall, details }
 */
async function verifyArtifactIntegrity(artifactId) {
  if (!artifactId) {
    throw new Error('artifactId is required');
  }

  const artifact = await store.getArtifactWithSections(artifactId);

  if (!artifact) {
    return {
      ok: false,
      error: 'Artifact not found',
      code: 'missing',
      overall: 'failed'
    };
  }

  // Check required fields
  const hasRequired = artifact.artifact_type && artifact.content && artifact.atom_ids_used;

  // Content integrity: sections should reconstruct to content
  const sections = artifact.sections || [];
  const reconstructed = sections.map(s => s.section_content).join('\n\n');
  const normalizedStored = (artifact.content || '').trim().replace(/\s+$/gm, '');
  const normalizedReconstructed = reconstructed.trim().replace(/\s+$/gm, '');
  const contentMatch = normalizedStored === normalizedReconstructed;

  // Citation completeness: all atom_ids_used should appear in citations
  const atomSet = new Set(artifact.atom_ids_used || []);
  const citedSet = new Set(
    (artifact.synthesis_citations || []).flatMap(c => c.atom_ids_used || [])
  );
  const missingCitations = [...atomSet].filter(a => !citedSet.has(a));
  const citationsComplete = missingCitations.length === 0;

  const overall = hasRequired && contentMatch && citationsComplete ? 'verified' : 'drift';

  return {
    ok: true,
    exists: true,
    id: artifactId,
    artifact_type: artifact.artifact_type,
    created_at: artifact.created_at,
    checks: {
      has_required_fields: hasRequired,
      content_match: contentMatch,
      citations_complete: citationsComplete,
      missing_citations: missingCitations
    },
    overall
  };
}

module.exports = {
  reconstructMissionState,
  verifyArtifactIntegrity
};
