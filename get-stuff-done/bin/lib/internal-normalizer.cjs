const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const glob = require('glob');
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
 * Normalizes internal planning files into ContextArtifacts.
 * @param {string} cwd Project root
 * @returns {Array<Object>} Array of ContextArtifact objects
 */
function normalizeInternal(cwd) {
  const pattern = path.join(cwd, '.planning/*.{md,js,ts}').split(path.sep).join('/');
  const files = glob.sync(pattern);
  const artifacts = [];

  for (const filePath of files) {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    
    let normalizedContent;
    let analysis = null;

    if (ext === '.md') {
      normalizedContent = normalizeMd(rawContent);
    } else if (ext === '.js' || ext === '.ts') {
      const lang = ext === '.js' ? 'javascript' : 'typescript';
      // For code files, we wrap them in code blocks for consistency in markdown content
      normalizedContent = `\`\`\`${lang}\n${rawContent}\n\`\`\``;
      analysis = parseCode(rawContent, lang);
    } else {
      normalizedContent = rawContent;
    }

    const contentHash = sha256(normalizedContent);
    
    // source_uri should be relative to project root for internal files
    const sourceUri = path.relative(cwd, filePath).split(path.sep).join('/');
    
    const artifact = {
      id: generateArtifactId(sourceUri, contentHash),
      source_uri: sourceUri,
      type: 'internal',
      content_markdown: normalizedContent,
      content_hash: contentHash,
      normalized_at: new Date().toISOString(),
      provenance: {
        producer: 'internal-normalizer',
        producer_version: '1.1.0',
        parameters_hash: null
      }
    };

    if (analysis && (analysis.symbols.length > 0 || analysis.dependencies.length > 0)) {
      artifact.analysis = analysis;
    }

    // Validate against schema
    contextArtifactSchema.parse(artifact);
    
    artifacts.push(artifact);
  }

  return artifacts;
}

module.exports = {
  normalizeInternal,
};
