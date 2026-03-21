const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const glob = require('glob');
const { normalizeMd } = require('./core.cjs');
const { generateArtifactId } = require('./context-artifact.cjs');
const { contextArtifactSchema } = require('./artifact-schema.cjs');
const { parseCode } = require('./ast-parser.cjs');
const secondBrain = require('./second-brain.cjs');

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
 * @returns {Promise<Array<Object>>} Array of ContextArtifact objects
 */
async function normalizeInternal(cwd) {
  const planningUrl = process.env.GSD_PLANNING_URL || 'http://localhost:3011';
  let useServer = false;

  // Try to ping the local planning server
  try {
    const { execSync } = require('child_process');
    execSync(`curl -sf ${planningUrl}/health >/dev/null 2>&1`, { timeout: 1000 });
    useServer = true;
  } catch (e) {
    // Fall back to local filesystem if server is down
  }

  const pattern = path.join(cwd, '.planning/*.{md,js,ts}').split(path.sep).join('/');
  const files = glob.sync(pattern);
  const artifacts = [];

  for (const filePath of files) {
    const sourceUri = path.relative(cwd, filePath).split(path.sep).join('/');
    let rawContent;
    
    if (useServer) {
      try {
        const { execSync } = require('child_process');
        // Fetch structured extraction from local planning server
        const response = execSync(`curl -sf "${planningUrl}/v1/extract?path=${encodeURIComponent(sourceUri)}"`, { timeout: 2000 });
        const parsed = JSON.parse(response.toString());
        rawContent = parsed.data.markdown;
      } catch (e) {
        rawContent = fs.readFileSync(filePath, 'utf-8');
      }
    } else {
      rawContent = fs.readFileSync(filePath, 'utf-8');
    }
    
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
    
    // Ingest into Second Brain
    await secondBrain.ingestArtifact(artifact);
    
    artifacts.push(artifact);
  }

  return artifacts;
}

module.exports = {
  normalizeInternal,
};
