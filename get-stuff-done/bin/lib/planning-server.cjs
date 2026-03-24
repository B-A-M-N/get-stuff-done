const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const broker = require('./broker.cjs');
const { normalizeMd } = require('./core.cjs');
const astParser = require('./ast-parser.cjs');
const secondBrain = require('./second-brain.cjs');
const audit = require('./audit.cjs');

const PORT = process.env.GSD_PLANNING_PORT || 3011;
const HOST = process.env.GSD_PLANNING_HOST || '127.0.0.1';
const CORS_ORIGINS = process.env.GSD_PLANNING_CORS_ORIGINS
  ? process.env.GSD_PLANNING_CORS_ORIGINS.split(',').map(s => s.trim())
  : [];

// Security: Authentication configuration
const PLANNING_SERVER_TOKEN = process.env.PLANNING_SERVER_TOKEN;
const PLANNING_SERVER_AUTH_MODE = process.env.PLANNING_SERVER_AUTH_MODE || 'mandatory';
const PLANNING_SERVER_INSECURE_LOCAL = process.env.PLANNING_SERVER_INSECURE_LOCAL === '1';
const isInsecureMode = PLANNING_SERVER_INSECURE_LOCAL || PLANNING_SERVER_AUTH_MODE === 'disabled';

// Fail fast if authentication is mandatory but token is not set
if (!isInsecureMode && !PLANNING_SERVER_TOKEN) {
  console.error('[PlanningServer] ERROR: PLANNING_SERVER_TOKEN environment variable is required when auth mode is mandatory');
  process.exit(1);
}

/**
 * Generates a SHA-256 hash of a string.
 */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Normalizes content based on file extension.
 */
function normalizeContent(filePath, rawContent) {
  const ext = path.extname(filePath).toLowerCase();
  let normalized = '';
  let analysis = null;

  if (ext === '.md') {
    normalized = normalizeMd(rawContent);
  } else if (ext === '.js' || ext === '.ts') {
    const lang = ext === '.js' ? 'javascript' : 'typescript';
    normalized = `\`\`\`${lang}\n${rawContent}\n\`\`\``;
    try {
      analysis = astParser.parseCode(rawContent, lang);
    } catch (e) {
      // Ignore parsing errors
    }
  } else {
    normalized = rawContent;
  }

  return { normalized, analysis };
}

/**
 * Sets security headers on all responses.
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
}

/**
 * Authentication middleware - validates bearer token
 * Returns true if authenticated, false and sends response if not
 */
function requireAuth(req, res) {
  // Insecure mode allows unrestricted access; identity is IP
  if (isInsecureMode) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    req.identity = clientIP;
    return true;
  }

  const authHeader = req.headers.authorization;
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Audit the failed attempt
    try {
      audit.recordAuditEntry(process.cwd(), {
        context: { phase: '42', plan: '02', task: '2-1', narrative_ref: 'none', justification: 'Authentication failure: missing or malformed Authorization header' },
        impact: { client_identity: clientIP, auth_result: 'missing_token' },
        policy: { rules_evaluated: ['requireAuth'], triggered_gates: [], approval_required: false, verdict: 'denied' },
        integrity: { narrative_drift_score: 1.0, coherence_check_passed: true }
      });
    } catch (e) { /* best-effort audit */ }

    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }

  const providedToken = authHeader.slice(7); // Remove 'Bearer ' prefix
  const expectedToken = PLANNING_SERVER_TOKEN;

  // Token length check: timingSafeEqual requires same byte length
  if (providedToken.length !== expectedToken.length) {
    // Audit failure due to length mismatch
    try {
      audit.recordAuditEntry(process.cwd(), {
        context: { phase: '42', plan: '02', task: '2-1', narrative_ref: 'none', justification: 'Authentication failure: token length mismatch' },
        impact: { client_identity: clientIP, auth_result: 'length_mismatch' },
        policy: { rules_evaluated: ['requireAuth'], triggered_gates: [], approval_required: false, verdict: 'denied' },
        integrity: { narrative_drift_score: 1.0, coherence_check_passed: true }
      });
    } catch (e) {}

    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  let isValid = false;
  try {
    isValid = crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(expectedToken));
  } catch (e) {
    isValid = false;
  }

  if (!isValid) {
    // Audit failed attempt
    try {
      audit.recordAuditEntry(process.cwd(), {
        context: { phase: '42', plan: '02', task: '2-1', narrative_ref: 'none', justification: 'Authentication failure: invalid token' },
        impact: { client_identity: clientIP, auth_result: 'invalid_token' },
        policy: { rules_evaluated: ['requireAuth'], triggered_gates: [], approval_required: false, verdict: 'denied' },
        integrity: { narrative_drift_score: 1.0, coherence_check_passed: true }
      });
    } catch (e) {}

    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }

  // Success: assign identity as token hash (never log raw token)
  req.identity = crypto.createHash('sha256').update(providedToken).digest('hex').substring(0, 16);
  try {
    audit.recordAuditEntry(process.cwd(), {
      context: { phase: '42', plan: '02', task: '2-1', narrative_ref: 'none', justification: 'Authentication success' },
      impact: { client_identity: req.identity, auth_result: 'success' },
      policy: { rules_evaluated: ['requireAuth'], triggered_gates: [], approval_required: false, verdict: 'allowed' },
      integrity: { narrative_drift_score: 1.0, coherence_check_passed: true }
    });
  } catch (e) {}

  return true;
}

const server = http.createServer(async (req, res) => {
  // Simple URL parsing for compatibility
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Set security headers on all responses (must be before any early returns)
  setSecurityHeaders(res);

  // CORS handling (if configured)
  if (CORS_ORIGINS.length > 0) {
    const origin = req.headers.origin;
    if (origin && CORS_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.statusCode = 204;
        res.end();
        return;
      }
    }
  }

  if (url.pathname === '/health') {
    if (!requireAuth(req, res)) return;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('ok');
    return;
  }

  if (url.pathname === '/v1/extract' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const relativePath = url.searchParams.get('path');

    if (!relativePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing path parameter' }));
      return;
    }

    const projectRoot = process.cwd();
    const planningDir = path.resolve(projectRoot, '.planning');
    const targetPath = path.resolve(planningDir, relativePath);

    // Security: Prevent path traversal outside .planning directory, including symlink attacks
    let realTarget;
    try {
      realTarget = fs.realpathSync(targetPath);
    } catch (e) {
      realTarget = null; // File may not exist; fall back to simple check
    }

    let realPlanningDir;
    try {
      realPlanningDir = fs.realpathSync(planningDir);
    } catch (e) {
      realPlanningDir = planningDir; // Should be resolvable, but fallback
    }

    const isOutside = realTarget
      ? !realTarget.startsWith(realPlanningDir)
      : !targetPath.startsWith(planningDir);

    if (isOutside) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Access denied: Path outside .planning directory' }));
      return;
    }

    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }

    try {
      const rawContent = fs.readFileSync(targetPath, 'utf-8');
      const { normalized, analysis } = normalizeContent(targetPath, rawContent);
      const hash = sha256(normalized);

      const response = {
        success: true,
        data: {
          path: relativePath,
          markdown: normalized,
          hash,
        }
      };

      if (analysis) {
        response.data.analysis = analysis;
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(response));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (url.pathname === '/v1/read' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const filePath = url.searchParams.get('path');

    if (!filePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing path parameter' }));
      return;
    }

    // Must be absolute path
    if (!path.isAbsolute(filePath)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Path must be absolute' }));
      return;
    }

    const projectRoot = process.cwd();
    const absolutePath = path.resolve(filePath);

    // Security: Prevent access outside project root, including symlink attacks
    let realTarget;
    try {
      realTarget = fs.realpathSync(absolutePath);
    } catch (e) {
      realTarget = null; // File may not exist; fall back to simple check
    }

    let realProjectRoot;
    try {
      realProjectRoot = fs.realpathSync(projectRoot);
    } catch (e) {
      realProjectRoot = projectRoot;
    }

    const isOutside = realTarget
      ? !realTarget.startsWith(realProjectRoot + path.sep)
      : !absolutePath.startsWith(projectRoot + path.sep);

    if (isOutside) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Access denied: Path outside project root' }));
      return;
    }

    // BLOCK .planning/ ACCESS
    try {
      const realPlanningDir = fs.realpathSync(path.resolve(projectRoot, '.planning'));
      if (realTarget && (realTarget === realPlanningDir || realTarget.startsWith(realPlanningDir + path.sep))) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Access to .planning/ files via /v1/read is restricted; use /v1/extract' }));
        return;
      }
    } catch (e) {
      // .planning directory may not exist; skip this check
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      // Traceability: Log planning-server-read event
      try {
        const contentHash = sha256(content);
        audit.recordAuditEntry(process.cwd(), {
          context: { action: 'planning-server-read', path: absolutePath },
          impact: { file_read: absolutePath, size: content.length, contentHash: contentHash },
          policy: { rules_evaluated: [], triggered_gates: [], approval_required: false, verdict: 'allowed' },
          integrity: { narrative_drift_score: 1.0, coherence_check_passed: true }
        });
      } catch (e) {}

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ content }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Server timeout and keep-alive settings
server.timeout = 30000;
server.on('timeout', () => {
  // Node auto-closes connections; logging is optional
  console.log('Planning Server: connection timeout');
});

async function startServer() {
  await broker.connect();

  // Initialize AST parser (Tree-Sitter)
  try {
    await astParser.init();
    console.log('[PlanningServer] AST parser initialized: Tree-Sitter active');
  } catch (err) {
    console.warn('[PlanningServer] AST parser initialization failed; code analysis will use regex fallback:', err.message);
  }

  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`GSD Planning Server listening on http://${HOST}:${PORT}`);
      
      broker.publish('server.started', {
        port: PORT,
        pid: process.pid,
        projectRoot: process.cwd(),
        timestamp: new Date().toISOString()
      }).catch(err => {
        console.error('Failed to publish server.started event:', err.message);
      });
      
      resolve(server);
    });
  });
}

// Allow running directly
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start planning server:', err);
    process.exit(1);
  });
}

module.exports = { startServer, server };
