const crypto = require('crypto');
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
 * Normalizes Firecrawl results into ContextArtifacts.
 * @param {Object} firecrawlResult Result from Firecrawl scrape
 * @returns {Object} ContextArtifact object
 */
function normalizeFirecrawl(firecrawlResult) {
  if (!firecrawlResult || !firecrawlResult.success) {
    throw new Error('Invalid Firecrawl result');
  }

  const { data } = firecrawlResult;
  const sourceUri = data.metadata.sourceURL;
  const title = data.metadata.title || null;
  const normalizedMarkdown = normalizeMd(data.markdown || '');
  const contentHash = sha256(normalizedMarkdown);

  const artifact = {
    id: generateArtifactId(sourceUri, contentHash),
    source_uri: sourceUri,
    title,
    type: 'external',
    content_markdown: normalizedMarkdown,
    content_hash: contentHash,
    normalized_at: new Date().toISOString(),
    provenance: {
      producer: 'firecrawl-normalizer',
      producer_version: '1.0.0',
      parameters_hash: null // In a real system, this would be hash(parameters)
    }
  };

  // Validate against schema
  contextArtifactSchema.parse(artifact);

  return artifact;
}

module.exports = {
  normalizeFirecrawl,
};
