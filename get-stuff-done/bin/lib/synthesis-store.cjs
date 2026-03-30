/**
 * Synthesis Storage — Minimal persistence substrate for mission-scoped synthesis artifacts.
 *
 * Ownership: Phase 11 truth-synthesis subsystem
 * Purpose: Store synthesized artifacts and sections with full provenance, isolated by mission_id.
 */

const secondBrain = require('./second-brain.cjs');

/**
 * Generate a deterministic artifact ID from mission and type.
 * Ensures idempotent writes for the same synthesis output.
 */
function generateArtifactId(missionId, artifactType) {
  const crypto = require('crypto');
  const content = `${missionId}:${artifactType}`;
  return `syn_${crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)}`;
}

/**
 * Store a synthesized artifact and its optional sections.
 * All rows are tagged with the mission_id for isolation.
 *
 * @param {string} missionId - Mission identifier (usually phase-plan combination)
 * @param {object} artifact - Must contain:
 *   - artifact_type: string
 *   - content: string (full artifact markdown/JSON)
 *   - atom_ids_used: array of atom IDs
 *   - synthesis_citations: array of citation objects
 *   - sections?: array of { section_key, section_content, atom_ids_used?, synthesis_citations? }
 * @returns {Promise<string>} artifact ID
 */
async function storeSynthesis(missionId, artifact) {
  if (!missionId || typeof missionId !== 'string') {
    throw new Error('missionId is required');
  }
  if (!artifact || typeof artifact !== 'object') {
    throw new Error('artifact is required');
  }
  const required = ['artifact_type', 'content', 'atom_ids_used', 'synthesis_citations'];
  for (const field of required) {
    if (!(field in artifact)) {
      throw new Error(`artifact missing required field: ${field}`);
    }
  }

  // Use provided ID or generate from mission+type
  const artifactId = artifact.id || generateArtifactId(missionId, artifact.artifact_type);

  const client = await secondBrain.pool.connect();
  try {
    await client.query('BEGIN');

    // Insert artifact
    await client.query(
      `INSERT INTO authority.synthesis_artifacts
         (id, mission_id, artifact_type, content, atom_ids_used, synthesis_citations)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        artifactId,
        missionId,
        artifact.artifact_type,
        artifact.content,
        JSON.stringify(Array.isArray(artifact.atom_ids_used) ? artifact.atom_ids_used : []),
        JSON.stringify(Array.isArray(artifact.synthesis_citations) ? artifact.synthesis_citations : [])
      ]
    );

    // Insert sections if present
    if (Array.isArray(artifact.sections)) {
      for (const section of artifact.sections) {
        if (!section.section_key || !section.section_content) {
          throw new Error('section requires section_key and section_content');
        }
        const sectionId = section.id || `sec_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        await client.query(
          `INSERT INTO authority.synthesis_sections
             (id, mission_id, artifact_id, section_key, section_content, atom_ids_used, synthesis_citations)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            sectionId,
            missionId,
            artifactId,
            section.section_key,
            section.section_content,
            JSON.stringify(Array.isArray(section.atom_ids_used) ? section.atom_ids_used : []),
            JSON.stringify(Array.isArray(section.synthesis_citations) ? section.synthesis_citations : [])
          ]
        );
      }
    }

    await client.query('COMMIT');
    return artifactId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieve all synthesis artifacts for a mission.
 * @param {string} missionId
 * @returns {Promise<Array<object>>}
 */
async function getSynthesisArtifacts(missionId) {
  const res = await secondBrain.pool.query(
    `SELECT * FROM authority.synthesis_artifacts WHERE mission_id = $1 ORDER BY created_at DESC`,
    [missionId]
  );
  return res.rows.map(row => ({
    ...row,
    atom_ids_used: row.atom_ids_used,
    synthesis_citations: row.synthesis_citations
  }));
}

/**
 * Retrieve sections for a given artifact ID.
 * @param {string} artifactId
 * @returns {Promise<Array<object>>}
 */
async function getSynthesisSections(artifactId) {
  const res = await secondBrain.pool.query(
    `SELECT * FROM authority.synthesis_sections WHERE artifact_id = $1 ORDER BY created_at ASC`,
    [artifactId]
  );
  return res.rows.map(row => ({
    ...row,
    atom_ids_used: row.atom_ids_used,
    synthesis_citations: row.synthesis_citations
  }));
}

/**
 * Check if the synthesis storage is reachable and schema exists.
 * @returns {Promise<boolean>}
 */
async function checkConnection() {
  try {
    await secondBrain.pool.query('SELECT 1 FROM authority.synthesis_artifacts LIMIT 1');
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  storeSynthesis,
  getSynthesisArtifacts,
  getSynthesisSections,
  checkConnection,
  generateArtifactId
};
