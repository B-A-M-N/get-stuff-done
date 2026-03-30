let store = require('./synthesis-store.cjs');
let phaseTruth = require('./phase-truth.cjs');
const fs = require('fs');
const path = require('path');

// Test hooks for dependency injection (defined unconditionally, set to no-ops in production)
const __setStore = process.env.NODE_ENV === 'test' ? (s) => { store = s; } : () => {};
const __setPhaseTruth = process.env.NODE_ENV === 'test' ? (p) => { phaseTruth = p; } : () => {};

function extractGeneratedAt(content) {
  const match = content.match(/^generated_at:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

async function replayArtifact(artifactId, options = {}) {
  const cwd = options.cwd || process.cwd();
  try {
    const artifact = await store.getArtifactWithSections(artifactId);
    if (!artifact) {
      return { matches: false, failure_category: 'NOT_FOUND', artifact_id: artifactId, errors: ['Artifact not found'] };
    }

    const atomIds = new Set(artifact.atom_ids_used || []);
    for (const section of artifact.sections || []) {
      for (const atom of section.atom_ids_used || []) {
        atomIds.add(atom);
      }
    }

    const missing = [];
    for (const atom of atomIds) {
      if (!fs.existsSync(path.join(cwd, atom))) missing.push(atom);
    }
    if (missing.length > 0) {
      return { matches: false, failure_category: 'MISSING_ATOM', artifact_id: artifactId, errors: [`Missing: ${missing.join(', ')}`] };
    }

    const storedTime = extractGeneratedAt(artifact.content);
    const derived = await phaseTruth.derivePhaseTruth(cwd, artifact.mission_id, { now: storedTime });
    const replayed = phaseTruth.renderYaml(derived) + '\n';

    if (replayed.trim() === (artifact.content || '').trim()) {
      return { matches: true, artifact_id: artifactId, failure_category: null, errors: [], replayed_content: replayed };
    }
    return { matches: false, failure_category: 'CONTENT_MISMATCH', artifact_id: artifactId, errors: ['Content mismatch'] };
  } catch (err) {
    // derivePhaseTruth throwing is a validation rejection, not an internal error
    return { matches: false, failure_category: 'VALIDATION_REJECTION', artifact_id: artifactId, errors: [err.message] };
  }
}

async function verifyArtifactIntegrity(artifactId) {
  const result = await replayArtifact(artifactId);
  return result.matches;
}

async function reconstructMissionState(missionId) {
  if (!missionId) throw new Error('missionId required');
  const artifacts = await store.getMissionSynthesisTimeline(missionId);
  const results = await Promise.all(artifacts.map(a => replayArtifact(a.id)));
  const intact = results.filter(r => r.matches).length;
  return {
    mission_id: missionId,
    artifact_count: artifacts.length,
    overall_status: intact === artifacts.length ? 'intact' : 'degraded',
    summary: { total: artifacts.length, intact, degraded: artifacts.length - intact },
    artifacts: artifacts.map((a, i) => ({
      id: a.id,
      type: a.artifact_type,
      created_at: a.created_at,
      sections: a.sections?.length || 0,
      atoms: a.atom_ids_used?.length || 0,
      citations: a.synthesis_citations?.length || 0,
      integrity: results[i].matches ? 'intact' : 'degraded',
      failure_category: results[i].failure_category || null,
      errors: results[i].errors || []
    }))
  };
}

module.exports = {
  replayArtifact,
  verifyArtifactIntegrity,
  reconstructMissionState,
  __setStore,
  __setPhaseTruth
};
