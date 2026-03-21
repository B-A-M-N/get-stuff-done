const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const glob = require('glob');
const { normalizeMd } = require('./core.cjs');
const { generateArtifactId } = require('./context-artifact.cjs');
const { contextArtifactSchema } = require('./artifact-schema.cjs');

/**
 * Generates a SHA-256 hash of a string.
 * @param {string} content 
 * @returns {string} 64-char hex hash
 */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Normalizes internal planning files into ContextArtifacts.
 * @param {string} cwd Project root
 * @returns {Array<Object>} Array of ContextArtifact objects
 */
function normalizeInternal(cwd) {
  const pattern = path.join(cwd, '.planning/*.md').split(path.sep).join('/');
  const files = glob.sync(pattern);
  const artifacts = [];

  for (const filePath of files) {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const normalizedMarkdown = normalizeMd(rawContent);
    const contentHash = sha256(normalizedMarkdown);
    
    // source_uri should be relative to project root for internal files
    const sourceUri = path.relative(cwd, filePath).split(path.sep).join('/');
    
    const artifact = {
      id: generateArtifactId(sourceUri, contentHash),
      source_uri: sourceUri,
      type: 'internal',
      content_markdown: normalizedMarkdown,
      content_hash: contentHash,
      normalized_at: new Date().toISOString(),
      provenance: {
        producer: 'internal-normalizer',
        producer_version: '1.0.0',
        parameters_hash: null
      }
    };

    // Validate against schema
    contextArtifactSchema.parse(artifact);
    
    artifacts.push(artifact);
  }

  return artifacts;
}

module.exports = {
  normalizeInternal,
};
