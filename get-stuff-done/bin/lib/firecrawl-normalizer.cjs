const crypto = require('crypto');
const { normalizeMd } = require('./core.cjs');
const { generateArtifactId } = require('./context-artifact.cjs');
const { contextArtifactSchema } = require('./artifact-schema.cjs');
const { parseCode } = require('./ast-parser.cjs');

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

  // Extract code blocks and parse symbols/dependencies
  const symbols = [];
  const dependencies = [];
  
  const blockRegex = /```(javascript|js|typescript|ts)\n([\s\S]*?)```/g;
  let match;
  while ((match = blockRegex.exec(normalizedMarkdown)) !== null) {
    const lang = match[1];
    const code = match[2];
    const result = parseCode(code, lang === 'js' ? 'javascript' : (lang === 'ts' ? 'typescript' : lang));
    
    symbols.push(...result.symbols);
    dependencies.push(...result.dependencies);
  }

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
      producer_version: '1.1.0',
      parameters_hash: null
    }
  };

  if (symbols.length > 0 || dependencies.length > 0) {
    artifact.analysis = {
      // De-duplicate symbols from multiple blocks
      symbols: Array.from(new Map(symbols.map(s => [`${s.name}-${s.kind}`, s])).values()),
      dependencies: Array.from(new Set(dependencies))
    };
  }

  // Validate against schema
  contextArtifactSchema.parse(artifact);

  return artifact;
}

module.exports = {
  normalizeFirecrawl,
};
