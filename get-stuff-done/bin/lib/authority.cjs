/**
 * Authority — Authority Envelope signing and verification
 *
 * Ensures all codebase changes are traceable to a GSD execution wave.
 * Detects "silent bypasses" where files are modified outside the GSD workflow.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate a SHA-256 signature for the given content and context.
 *
 * @param {string} content The file content to sign
 * @param {string} phase Phase identifier (e.g. "28")
 * @param {string} plan Plan identifier (e.g. "02")
 * @param {string} wave Wave identifier (e.g. "2")
 * @returns {string} The SHA-256 signature (hex)
 */
function generateSignature(content, phase, plan, wave) {
  // Normalize content for signing (trim trailing whitespace)
  const normalized = content.trimEnd();
  const context = `gsd:${phase}:${plan}:${wave}`;
  
  // Use context as HMAC key to bind the signature to the specific task
  return crypto.createHmac('sha256', context)
    .update(normalized)
    .digest('hex');
}

/**
 * Check if a file content has a valid authority envelope.
 *
 * @param {string} content The file content to verify
 * @returns {{ valid: boolean, phase?: string, plan?: string, wave?: string, reason?: string }}
 */
function verifySignature(content) {
  if (!content) return { valid: false, reason: 'Empty content' };

  const lines = content.trimEnd().split('\n');
  const lastLine = lines[lines.length - 1];
  
  // Formats:
  //   // GSD-AUTHORITY: <phase>-<plan>-<wave>:<signature>
  //   # GSD-AUTHORITY: <phase>-<plan>-<wave>:<signature>
  //   <!-- GSD-AUTHORITY: <phase>-<plan>-<wave>:<signature> -->
  const match = lastLine.match(/(?:\/\/|#|<!--)\s*GSD-AUTHORITY:\s*([^-]+)-([^-]+)-([^:]+):([a-f0-9]{64})\s*(?:-->)?/);
  
  if (!match) {
    return { valid: false, reason: 'No authority envelope found' };
  }

  const [, phase, plan, wave, signature] = match;
  
  // Content to verify is everything before the last line (including any blank lines)
  // We need to be careful to preserve the exact bytes used during signing.
  const actualContent = lines.slice(0, lines.length - 1).join('\n');
  
  const expectedSignature = generateSignature(actualContent, phase, plan, wave);
  
  if (signature === expectedSignature) {
    return { valid: true, phase, plan, wave, signature };
  } else {
    return { valid: false, reason: 'Signature mismatch' };
  }
}

function getEnvelopeStyle(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.md', '.html', '.xml'].includes(ext)) return 'html';
  if (['.yaml', '.yml'].includes(ext)) return 'hash';
  return 'line';
}

function formatEnvelope(filePath, phase, plan, wave, signature) {
  const style = getEnvelopeStyle(filePath);
  if (style === 'html') {
    return `<!-- GSD-AUTHORITY: ${phase}-${plan}-${wave}:${signature} -->`;
  }
  if (style === 'hash') {
    return `# GSD-AUTHORITY: ${phase}-${plan}-${wave}:${signature}`;
  }
  return `// GSD-AUTHORITY: ${phase}-${plan}-${wave}:${signature}`;
}

/**
 * Sign a file by appending an authority envelope.
 *
 * @param {string} filePath Path to the file
 * @param {string} phase Phase identifier
 * @param {string} plan Plan identifier
 * @param {string} wave Wave identifier
 * @returns {boolean} True if signed successfully
 */
function signFile(filePath, phase, plan, wave) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // If already has an envelope, remove it first
    const lines = content.trimEnd().split('\n');
    const lastLine = lines[lines.length - 1];
    let baseContent = content;
    if (lastLine.includes('GSD-AUTHORITY:')) {
      baseContent = lines.slice(0, lines.length - 1).join('\n');
    }

    const signature = generateSignature(baseContent, phase, plan, wave);
    
    const signatureLine = formatEnvelope(filePath, phase, plan, wave, signature);

    const signedContent = baseContent.trimEnd() + '\n\n' + signatureLine + '\n';
    fs.writeFileSync(filePath, signedContent, 'utf-8');
    return true;
  } catch (err) {
    process.stderr.write(`Failed to sign ${filePath}: ${err.message}\n`);
    return false;
  }
}

module.exports = {
  formatEnvelope,
  generateSignature,
  getEnvelopeStyle,
  verifySignature,
  signFile,
};
