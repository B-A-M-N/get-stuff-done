const crypto = require('crypto');

/**
 * Generates a deterministic artifact ID from source URI and content hash.
 * @param {string} sourceUri 
 * @param {string} contentHash 
 * @returns {string} 64-char hex SHA-256 hash
 */
function generateArtifactId(sourceUri, contentHash) {
  const canonical = `${sourceUri}|${contentHash}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

module.exports = {
  generateArtifactId,
};
