/**
 * Synthesis Storage — Minimal persistence substrate for mission-scoped synthesis artifacts.
 *
 * Ownership: Phase 11 truth-synthesis subsystem
 * Purpose: Store synthesized artifacts and sections with full provenance, isolated by mission_id.
 * Enhanced: Phase 12-01 — Query API with intent tier classification and boundary enforcement.
 */

const secondBrain = require('./second-brain.cjs');

function classifyIntentTier(filters) {
  const hasMissionId = !!filters.mission_id;
  const hasTimeRange = !!(filters.created_after || filters.created_before);
  const hasArtifactType = !!filters.artifact_type;
  const hasAtomFilter = !!filters.atom_ids_used_contains;
  const hasCitationFilter = !!filters.citation_type; // hypothetical future

  // Invalid: analytical filter without any primary filter
  if ((hasAtomFilter || hasCitationFilter) && !(hasMissionId || hasTimeRange || hasArtifactType)) {
    return null;
  }

  // Tier 3: analytical filter WITH primary filter
  if (hasAtomFilter || hasCitationFilter) {
    return 3;
  }

  // Tier 1: mission_id only (no other filters)
  if (hasMissionId && !hasTimeRange && !hasArtifactType) {
    return 1;
  }

  // Tier 2: any primary filter (mission_id, time range, or artifact_type)
  if (hasMissionId || hasTimeRange || hasArtifactType) {
    return 2;
  }

  return null; // no valid filter
}

function validateQueryBoundary(filters) {
  // Specific enforcement: atom-only queries are forbidden outright
  if (filters.atom_ids_used_contains && !filters.mission_id && !filters.created_after && !filters.created_before) {
    throw new Error(
      'atom_ids_used_contains requires mission_id or time range to prevent full scans'
    );
  }

  const tier = classifyIntentTier(filters);

  if (tier === null) {
    throw new Error(
      'Query must include at least one of: mission_id, created_after, created_before, artifact_type. ' +
      'Analytical filters (atom_ids_used_contains, citation patterns) require a primary filter.'
    );
  }

  return tier;
}

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

/**
 * Query synthesis artifacts with filters and pagination.
 * Enforces query boundaries to prevent unbounded scans.
 *
 * @param {object} filters - Query filters
 *   @param {string} [filters.mission_id] - Mission identifier
 *   @param {string} [filters.artifact_type] - Artifact type filter
 *   @param {string[]} [filters.atom_ids_used_contains] - Atoms that must be present (Tier 3)
 *   @param {Date} [filters.created_after] - Inclusive lower bound
 *   @param {Date} [filters.created_before] - Inclusive upper bound
 *   @param {number} [filters.limit] - Max results (default 100, max 1000)
 *   @param {number} [filters.offset] - Offset for pagination
 * @param {object} [options] - Query options
 * @returns {Promise<Array<object>>} Array of artifact objects with JSONB fields parsed
 */
async function findArtifacts(filters = {}, options = {}) {
  // Enforce query boundary and classify intent tier
  const tier = validateQueryBoundary(filters);

  // Build dynamic WHERE clause
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filters.mission_id) {
    conditions.push(`mission_id = $${paramIndex++}`);
    params.push(filters.mission_id);
  }
  if (filters.artifact_type) {
    conditions.push(`artifact_type = $${paramIndex++}`);
    params.push(filters.artifact_type);
  }
  if (filters.created_after) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.created_after);
  }
  if (filters.created_before) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.created_before);
  }
  if (filters.atom_ids_used_contains) {
    const atomList = Array.isArray(filters.atom_ids_used_contains)
      ? filters.atom_ids_used_contains
      : [filters.atom_ids_used_contains];
    conditions.push(`atom_ids_used @> $${paramIndex++}`);
    params.push(JSON.stringify(atomList));
  }

  // Validate limit cap to prevent runaway queries
  const limit = Math.min(filters.limit || 100, 1000);
  const offset = filters.offset || 0;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = 'ORDER BY created_at DESC';
  const pagination = `LIMIT ${limit} OFFSET ${offset}`;

  const sql = `SELECT * FROM authority.synthesis_artifacts ${whereClause} ${orderBy} ${pagination}`;

  const startTime = Date.now();
  try {
    const res = await secondBrain.pool.query(sql, params);
    const durationMs = Date.now() - startTime;

    // Observability logging (per validation suggestion)
    console.info('[SynthesisStore] findArtifacts', {
      tier,
      filters: {
        mission_id: filters.mission_id,
        artifact_type: filters.artifact_type,
        has_atom_filter: !!filters.atom_ids_used_contains,
        time_range: filters.created_after || filters.created_before ? { created_after: filters.created_after, created_before: filters.created_before } : null
      },
      result_count: res.rows.length,
      duration_ms: durationMs,
      sql_length: sql.length
    });

    return res.rows.map(row => ({
      ...row,
      atom_ids_used: row.atom_ids_used,
      synthesis_citations: row.synthesis_citations
    }));
  } catch (err) {
    console.error('[SynthesisStore] findArtifacts error', {
      tier,
      filters,
      error: err.message
    });
    throw err;
  }
}

/**
 * Get artifact with its sections in a single query.
 * @param {string} artifactId
 * @returns {Promise<object|null>} Artifact object with sections array, or null if not found
 */
async function getArtifactWithSections(artifactId) {
  if (!artifactId) {
    throw new Error('artifactId is required');
  }

  // Fetch artifact
  const artifactRes = await secondBrain.pool.query(
    `SELECT * FROM authority.synthesis_artifacts WHERE id = $1`,
    [artifactId]
  );

  if (artifactRes.rows.length === 0) {
    return null;
  }

  const artifact = artifactRes.rows[0];

  // Fetch sections
  const sectionsRes = await secondBrain.pool.query(
    `SELECT * FROM authority.synthesis_sections WHERE artifact_id = $1 ORDER BY created_at ASC`,
    [artifactId]
  );

  const sections = sectionsRes.rows.map(row => ({
    ...row,
    atom_ids_used: row.atom_ids_used,
    synthesis_citations: row.synthesis_citations
  }));

  return {
    ...artifact,
    atom_ids_used: artifact.atom_ids_used,
    synthesis_citations: artifact.synthesis_citations,
    sections
  };
}

/**
 * Find all artifacts and sections that cite a specific atom (file/path).
 * @param {string} atomId - The atom path to search for
 * @returns {Promise<object>} { artifacts: Array<{id, type, mission_id, created_at}>, sections: Array<{id, artifact_id, section_key}> }
 */
async function findCitationsByAtom(atomId) {
  if (!atomId) {
    throw new Error('atomId is required');
  }

  // Search artifacts: atom_ids_used @> [atomId]
  const artifactsRes = await secondBrain.pool.query(
    `SELECT id, artifact_type, mission_id, created_at FROM authority.synthesis_artifacts WHERE atom_ids_used @> $1`,
    [JSON.stringify([atomId])]
  );

  // Search sections: atom_ids_used @> [atomId]
  const sectionsRes = await secondBrain.pool.query(
    `SELECT id, artifact_id, section_key FROM authority.synthesis_sections WHERE atom_ids_used @> $1`,
    [JSON.stringify([atomId])]
  );

  return {
    artifacts: artifactsRes.rows,
    sections: sectionsRes.rows
  };
}

/**
 * Get synthesis timeline for a mission, ordered by created_at DESC.
 * Equivalent to getSynthesisArtifacts but ensures DESC ordering.
 * @param {string} missionId
 * @returns {Promise<Array<object>>}
 */
async function getMissionSynthesisTimeline(missionId) {
  if (!missionId) {
    throw new Error('missionId is required');
  }

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

module.exports = {
  storeSynthesis,
  getSynthesisArtifacts,
  getSynthesisSections,
  checkConnection,
  generateArtifactId,
  // Phase 12-01 additions
  findArtifacts,
  getArtifactWithSections,
  findCitationsByAtom,
  getMissionSynthesisTimeline,
  validateQueryBoundary,
  classifyIntentTier
};
