const fs = require('fs');
const path = require('path');
const { parseContextArtifact } = require('./artifact-schema.cjs');

/**
 * Returns the directory where artifacts are stored.
 * @param {string} cwd Current working directory.
 * @returns {string} Path to the artifacts directory.
 */
function getStoreDir(cwd) {
  return path.join(cwd, '.planning', 'context', 'artifacts');
}

/**
 * Saves a context artifact to the store.
 * Validates the artifact against the schema before saving.
 * Ensures the storage directory exists.
 * @param {string} cwd Current working directory.
 * @param {object} artifact Artifact to save.
 * @returns {object} The validated artifact.
 */
function put(cwd, artifact) {
  const validated = parseContextArtifact(artifact);
  const dir = getStoreDir(cwd);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const filePath = path.join(dir, `${validated.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(validated, null, 2), 'utf8');
  
  return validated;
}

/**
 * Retrieves a context artifact by ID.
 * Validates the artifact against the schema after reading.
 * @param {string} cwd Current working directory.
 * @param {string} id Artifact ID.
 * @returns {object|null} The artifact, or null if not found or invalid.
 */
function get(cwd, id) {
  const dir = getStoreDir(cwd);
  const filePath = path.join(dir, `${id}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    return parseContextArtifact(data);
  } catch (err) {
    return null;
  }
}

/**
 * Lists all artifact IDs in the store.
 * @param {string} cwd Current working directory.
 * @returns {string[]} Array of artifact IDs.
 */
function list(cwd) {
  const dir = getStoreDir(cwd);
  
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.basename(file, '.json'));
}

/**
 * Finds all artifacts matching a specific source URI.
 * @param {string} cwd Current working directory.
 * @param {string} uri Source URI to filter by.
 * @returns {object[]} Array of matching artifacts.
 */
function findBySource(cwd, uri) {
  const ids = list(cwd);
  const matches = [];
  
  for (const id of ids) {
    const artifact = get(cwd, id);
    if (artifact && artifact.source_uri === uri) {
      matches.push(artifact);
    }
  }
  
  return matches;
}

module.exports = {
  getStoreDir,
  put,
  get,
  list,
  findBySource
};
