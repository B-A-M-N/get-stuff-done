const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const broker = require('./broker.cjs');
const { normalizeMd } = require('./core.cjs');
const astParser = require('./ast-parser.cjs');
const secondBrain = require('./second-brain.cjs');
const audit = require('./audit.cjs');
const planeWebhookSync = require('./plane-webhook-sync.cjs');

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
// Concurrency caps
const PLANNING_SERVER_MAX_CONCURRENT_REQUESTS = parseInt(process.env.PLANNING_SERVER_MAX_CONCURRENT_REQUESTS, 10) || 16;
const PLANNING_SERVER_MAX_CONCURRENT_EXTRACTS = parseInt(process.env.PLANNING_SERVER_MAX_CONCURRENT_EXTRACTS, 10) || 4;

// Request validation limits
const PLANNING_SERVER_MAX_PATH_BYTES = parseInt(process.env.PLANNING_SERVER_MAX_PATH_BYTES, 10) || 4096;
const PLANNING_SERVER_MAX_FILE_BYTES = parseInt(process.env.PLANNING_SERVER_MAX_FILE_BYTES, 10) || 5242880;
const PLANNING_SERVER_MAX_WEBHOOK_BYTES = parseInt(process.env.PLANNING_SERVER_MAX_WEBHOOK_BYTES, 10) || 262144;

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  // Degraded mode signaling: if AST parser is not initialized, mark response
  if (!astParser.isInitialized()) {
    res.setHeader('X-Planning-Server-Degraded', 'ast_unavailable');
  }
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
        integrity: null
      });
    } catch (e) { /* best-effort audit */ }
    // Increment auth failures metric
    metrics.authFailuresTotal++;

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
        integrity: null
      });
    } catch (e) {}
    metrics.authFailuresTotal++;

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
        integrity: null
      });
    } catch (e) {}
    metrics.authFailuresTotal++;

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
      integrity: null
    });
  } catch (e) {}

  return true;
}

// Rate Limiting Configuration
const RATE_LIMIT_DEFAULTS = {
  health: 300,
  read: 120,
  extract: 60,
  metrics: 120,
  webhook: 60,
};

function getRateLimit(endpoint) {
  const globalOverride = process.env.GSD_PLANNING_RATE_LIMIT;
  if (globalOverride === '0') return 0; // disabled
  const envVar = `GSD_PLANNING_RATE_LIMIT_${endpoint.toUpperCase()}`;
  const perEndpoint = process.env[envVar];
  if (perEndpoint !== undefined) return Number(perEndpoint);
  return RATE_LIMIT_DEFAULTS[endpoint] || 60;
}

// Rate limiter state: identity -> { tokens, lastRefill }
const rateLimitMap = new Map();

function maybePruneRateLimits() {
  if (Math.random() < 0.01) {
    const now = Date.now();
    const tenMin = 10 * 60 * 1000;
    for (const [key, state] of rateLimitMap.entries()) {
      if (now - state.lastRefill > tenMin) {
        rateLimitMap.delete(key);
      }
    }
  }
}

function checkRateLimit(identity, endpoint) {
  const limit = getRateLimit(endpoint);
  if (limit === 0) return true;

  maybePruneRateLimits();

  const now = Date.now();
  let state = rateLimitMap.get(identity);

  if (!state) {
    state = { tokens: limit, lastRefill: now };
    rateLimitMap.set(identity, state);
  }

  // Refill tokens based on elapsed time
  const timeDiff = now - state.lastRefill;
  const tokensToAdd = Math.floor(timeDiff * (limit / 60000));
  if (tokensToAdd > 0) {
    state.tokens = Math.min(limit, state.tokens + tokensToAdd);
    state.lastRefill = now;
  }

  if (state.tokens <= 0) {
    return false;
  }

  state.tokens--;
  return true;
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        settled = true;
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

// Metrics counters
const metrics = {
  // Counters: { value, labels: {method, path, status} } or { value, labels: {identity_type} } or { value, labels: {reason} } or { value, labels: {type} }
  requestsTotal: new Map(), // key = `${method}|${path}|${status}`
  requestDuration: new Map(), // key = `${path}`, value = array of durations (we'll bucket on export)
  rateLimitedTotal: 0,
  rateLimitedLabels: new Map(), // key = identity_type
  authFailuresTotal: 0,
  pathDenialTotal: 0,
  pathDenialLabels: new Map(), // key = reason
  astDegraded: 0, // gauge: 1 if degraded, 0 if active (set at request time based on state)
  extractionFallbackTotal: 0,
  errorsTotal: 0,
  errorsLabels: new Map(), // key = type
  // Gauges
  inFlightRequests: 0,
  inFlightExtracts: 0
};

const server = http.createServer(async (req, res) => {
  // Record request start time for duration metrics
  const startTime = Date.now();
  const method = req.method;
  let pathLabel = 'UNKNOWN';

  // Concurrency cap check for total requests
  if (metrics.inFlightRequests >= PLANNING_SERVER_MAX_CONCURRENT_REQUESTS) {
    setSecurityHeaders(res);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server capacity exceeded, try again later' }));
    // Record metric: error response
    const key = `${method}|/capacity|503`;
    metrics.requestsTotal.set(key, (metrics.requestsTotal.get(key) || 0) + 1);
    // Count as internal error
    metrics.errorsTotal++;
    metrics.errorsLabels.set('internal', (metrics.errorsLabels.get('internal') || 0) + 1);
    return;
  }
  metrics.inFlightRequests++;
  res.on('finish', () => {
    metrics.inFlightRequests--;
    // Record request duration
    const duration = (Date.now() - startTime) / 1000; // seconds
    const durations = metrics.requestDuration.get(pathLabel) || [];
    durations.push(duration);
    if (durations.length > 1000) durations.shift();
    metrics.requestDuration.set(pathLabel, durations);
    // Record total requests with method, path, status
    const status = res.statusCode;
    const key = `${method}|${pathLabel}|${status}`;
    metrics.requestsTotal.set(key, (metrics.requestsTotal.get(key) || 0) + 1);
    // Record errors_total for error status codes (4xx, 5xx)
    if (status >= 400) {
      let errorType;
      if (status === 400 || status === 413) errorType = 'validation';
      else if (status === 404) errorType = 'file_not_found';
      else if (status === 401 || status === 403) errorType = 'auth';
      else if (status === 429) errorType = 'rate_limit';
      else errorType = 'internal';
      metrics.errorsTotal++;
      metrics.errorsLabels.set(errorType, (metrics.errorsLabels.get(errorType) || 0) + 1);
    }
  });

  // Simple URL parsing for compatibility
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  pathLabel = url.pathname;

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
    // Rate limiting check
    maybePruneRateLimits();
    if (!checkRateLimit(req.identity, 'health')) {
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '02', task: '2-2', narrative_ref: 'none', justification: 'Rate limit exceeded' },
          impact: { client_identity: req.identity, rate_limited_endpoint: '/health' },
          policy: { rules_evaluated: ['rateLimit'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      metrics.rateLimitedTotal++;
      const identityType = isInsecureMode ? 'ip' : 'token';
      metrics.rateLimitedLabels.set(identityType, (metrics.rateLimitedLabels.get(identityType) || 0) + 1);
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    const health = {
      status: 'ok',
      ast_parser: astParser.isInitialized() ? 'active' : 'degraded-fallback',
      timestamp: new Date().toISOString(),
      version: '1.0'
    };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(health));
    return;
  }

  if (url.pathname === '/metrics' && req.method === 'GET') {
    // Rate limiting for metrics
    maybePruneRateLimits();
    if (!checkRateLimit(req.identity, 'metrics')) {
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '02', task: '2-2', narrative_ref: 'none', justification: 'Rate limit exceeded' },
          impact: { client_identity: req.identity, rate_limited_endpoint: '/metrics' },
          policy: { rules_evaluated: ['rateLimit'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      metrics.rateLimitedTotal++;
      const identityType = isInsecureMode ? 'ip' : 'token';
      metrics.rateLimitedLabels.set(identityType, (metrics.rateLimitedLabels.get(identityType) || 0) + 1);
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    // Generate Prometheus text format
    const lines = [];
    // HELP and TYPE comments
    lines.push('# HELP planning_server_requests_total Total number of requests processed');
    lines.push('# TYPE planning_server_requests_total counter');
    for (const [key, value] of metrics.requestsTotal.entries()) {
      const [method, path, status] = key.split('|');
      lines.push(`planning_server_requests_total{method="${method}",path="${path}",status="${status}"} ${value}`);
    }

    lines.push('# HELP planning_server_request_duration_seconds Request duration histogram');
    lines.push('# TYPE planning_server_request_duration_seconds histogram');
    const buckets = [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 30];
    for (const [path, durations] of metrics.requestDuration.entries()) {
      let cumulative = 0;
      for (const bucket of buckets) {
        const count = durations.filter(d => d <= bucket).length;
        cumulative += count;
        lines.push(`planning_server_request_duration_seconds_bucket{path="${path}",le="${bucket}"} ${cumulative}`);
      }
      lines.push(`planning_server_request_duration_seconds_bucket{path="${path}",le="+Inf"} ${durations.length}`);
      lines.push(`planning_server_request_duration_seconds_sum{path="${path}"} ${durations.reduce((a,b)=>a+b,0)}`);
      lines.push(`planning_server_request_duration_seconds_count{path="${path}"} ${durations.length}`);
    }

    lines.push('# HELP planning_server_rate_limited_total Number of requests rate limited');
    lines.push('# TYPE planning_server_rate_limited_total counter');
    // Output per identity_type (ip or token)
    for (const [identityType, count] of metrics.rateLimitedLabels.entries()) {
      lines.push(`planning_server_rate_limited_total{identity_type="${identityType}"} ${count}`);
    }

    lines.push('# HELP planning_server_auth_failures_total Number of authentication failures');
    lines.push('# TYPE planning_server_auth_failures_total counter');
    lines.push(`planning_server_auth_failures_total ${metrics.authFailuresTotal}`);

    lines.push('# HELP planning_server_path_denial_total Number of path access denials');
    lines.push('# TYPE planning_server_path_denial_total counter');
    lines.push(`planning_server_path_denial_total{reason="traversal"} ${metrics.pathDenialLabels.get('traversal') || 0}`);
    lines.push(`planning_server_path_denial_total{reason="symlink"} ${metrics.pathDenialLabels.get('symlink') || 0}`);
    lines.push(`planning_server_path_denial_total{reason="planning_dir_block"} ${metrics.pathDenialLabels.get('planning_dir_block') || 0}`);

    lines.push('# HELP planning_server_ast_degraded Indicates if AST parser is degraded (1) or active (0)');
    lines.push('# TYPE planning_server_ast_degraded gauge');
    lines.push(`planning_server_ast_degraded ${astParser.isInitialized() ? 0 : 1}`);

    lines.push('# HELP planning_server_extraction_fallback_total Number of times regex fallback was used for extraction');
    lines.push('# TYPE planning_server_extraction_fallback_total counter');
    lines.push(`planning_server_extraction_fallback_total ${metrics.extractionFallbackTotal}`);

    lines.push('# HELP planning_server_in_flight_requests Current number of in-flight requests');
    lines.push('# TYPE planning_server_in_flight_requests gauge');
    lines.push(`planning_server_in_flight_requests ${metrics.inFlightRequests}`);

    lines.push('# HELP planning_server_in_flight_extracts Current number of in-flight extract operations');
    lines.push('# TYPE planning_server_in_flight_extracts gauge');
    lines.push(`planning_server_in_flight_extracts ${metrics.inFlightExtracts}`);

    lines.push('# HELP planning_server_errors_total Total number of errors encountered');
    lines.push('# TYPE planning_server_errors_total counter');
    lines.push(`planning_server_errors_total{type="file_not_found"} ${metrics.errorsLabels.get('file_not_found') || 0}`);
    lines.push(`planning_server_errors_total{type="auth"} ${metrics.errorsLabels.get('auth') || 0}`);
    lines.push(`planning_server_errors_total{type="rate_limit"} ${metrics.errorsLabels.get('rate_limit') || 0}`);
    lines.push(`planning_server_errors_total{type="validation"} ${metrics.errorsLabels.get('validation') || 0}`);
    lines.push(`planning_server_errors_total{type="internal"} ${metrics.errorsLabels.get('internal') || 0}`);

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.end(lines.join('\n') + '\n');
    return;
  }

  if (url.pathname === '/v1/plane/webhook' && req.method === 'POST') {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    req.identity = clientIP;

    maybePruneRateLimits();
    if (!checkRateLimit(req.identity, 'webhook')) {
      metrics.rateLimitedTotal++;
      metrics.rateLimitedLabels.set('ip', (metrics.rateLimitedLabels.get('ip') || 0) + 1);
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      res.statusCode = 415;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
      return;
    }

    let rawBody;
    try {
      rawBody = await readRequestBody(req, PLANNING_SERVER_MAX_WEBHOOK_BYTES);
    } catch (err) {
      res.statusCode = err.message === 'Request body too large' ? 413 : 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message === 'Request body too large' ? 'Invalid request' : err.message }));
      return;
    }

    const result = await planeWebhookSync.handlePlaneWebhook({
      headers: req.headers,
      rawBody,
    });

    try {
      audit.recordAuditEntry(process.cwd(), {
        context: { action: 'plane-webhook', path: '/v1/plane/webhook' },
        impact: { client_identity: req.identity, accepted: result.body.accepted === true, event: result.body.event || null },
        policy: { rules_evaluated: ['planeWebhookAuth'], triggered_gates: [], approval_required: false, verdict: result.statusCode < 400 ? 'allowed' : 'denied' },
        integrity: null
      });
    } catch (e) {}

    res.statusCode = result.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result.body));
    return;
  }

  if (url.pathname === '/v1/extract' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    // Rate limiting check
    maybePruneRateLimits();
    if (!checkRateLimit(req.identity, 'extract')) {
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '02', task: '2-2', narrative_ref: 'none', justification: 'Rate limit exceeded' },
          impact: { client_identity: req.identity, rate_limited_endpoint: '/v1/extract' },
          policy: { rules_evaluated: ['rateLimit'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      metrics.rateLimitedTotal++;
      const identityType = isInsecureMode ? 'ip' : 'token';
      metrics.rateLimitedLabels.set(identityType, (metrics.rateLimitedLabels.get(identityType) || 0) + 1);
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    // Check for requireAst flag: if set and AST not initialized, hard fail
    const requireAst = url.searchParams.get('requireAst') === 'true';
    if (requireAst && !astParser.isInitialized()) {
      // Audit degraded mode hard failure
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Extract request with requireAst=true in degraded mode' },
          impact: { client_identity: req.identity, attempted_path: relativePath, require_ast: true },
          policy: { rules_evaluated: ['astAvailability'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'AST parser unavailable; server in degraded mode' }));
      return;
    }
    // Concurrency cap for extracts
    if (metrics.inFlightExtracts >= PLANNING_SERVER_MAX_CONCURRENT_EXTRACTS) {
      // Audit concurrency rejection
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Concurrency limit exceeded for extraction' },
          impact: { client_identity: req.identity, attempted_path: relativePath, active_extracts: metrics.inFlightExtracts },
          policy: { rules_evaluated: ['concurrencyLimit'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Extraction capacity exceeded, try again later' }));
      return;
    }
    metrics.inFlightExtracts++;
    res.on('finish', () => {
      metrics.inFlightExtracts--;
    });
    const relativePath = url.searchParams.get('path');

    if (!relativePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing path parameter' }));
      return;
    }

    // Request validation: null byte and path length
    if (relativePath.includes('\0')) {
      // Audit validation failure
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Request validation failure: null byte in path' },
          impact: { client_identity: req.identity, attempted_path: relativePath },
          policy: { rules_evaluated: ['requestValidation'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid request' }));
      return;
    }
    if (Buffer.byteLength(relativePath, 'utf8') > PLANNING_SERVER_MAX_PATH_BYTES) {
      // Audit validation failure
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Request validation failure: path too long' },
          impact: { client_identity: req.identity, attempted_path: relativePath, path_bytes: Buffer.byteLength(relativePath, 'utf8') },
          policy: { rules_evaluated: ['requestValidation'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid request' }));
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
      // Audit path traversal denial
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Path traversal attempt blocked' },
          impact: { client_identity: req.identity, attempted_path: relativePath, resolution: realTarget || targetPath },
          policy: { rules_evaluated: ['pathTraversal'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      // Metrics: path denial
      metrics.pathDenialTotal++;
      metrics.pathDenialLabels.set('traversal', (metrics.pathDenialLabels.get('traversal') || 0) + 1);
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Access denied: Path outside .planning directory' }));
      return;
    }

    let fileStats;
    try {
      fileStats = fs.statSync(targetPath);
    } catch (e) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    if (!fileStats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    if (fileStats.size > PLANNING_SERVER_MAX_FILE_BYTES) {
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '02', task: '2-4', narrative_ref: 'none', justification: 'File size limit exceeded' },
          impact: { client_identity: req.identity, file_path: targetPath, file_size: fileStats.size },
          policy: { rules_evaluated: ['sizeLimit'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid request' }));
      return;
    }

    try {
      const rawContent = fs.readFileSync(targetPath, 'utf-8');
      const { normalized, analysis } = normalizeContent(targetPath, rawContent);
      // Track extraction fallback usage for code files when AST degraded
      const ext = path.extname(targetPath).toLowerCase();
      if (ext === '.js' || ext === '.ts' || ext === '.tsx') {
        if (!astParser.isInitialized()) {
          metrics.extractionFallbackTotal++;
        }
      }
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
    // Rate limiting check
    maybePruneRateLimits();
    if (!checkRateLimit(req.identity, 'read')) {
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '02', task: '2-2', narrative_ref: 'none', justification: 'Rate limit exceeded' },
          impact: { client_identity: req.identity, rate_limited_endpoint: '/v1/read' },
          policy: { rules_evaluated: ['rateLimit'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      metrics.rateLimitedTotal++;
      const identityType = isInsecureMode ? 'ip' : 'token';
      metrics.rateLimitedLabels.set(identityType, (metrics.rateLimitedLabels.get(identityType) || 0) + 1);
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    const filePath = url.searchParams.get('path');

    if (!filePath) {
      // Audit validation failure
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Request validation failure: missing path parameter' },
          impact: { client_identity: req.identity },
          policy: { rules_evaluated: ['requestValidation'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing path parameter' }));
      return;
    }

    // Request validation: null byte and path length
    if (filePath.includes('\0')) {
      // Audit validation failure
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Request validation failure: null byte in path' },
          impact: { client_identity: req.identity, attempted_path: filePath },
          policy: { rules_evaluated: ['requestValidation'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid request' }));
      return;
    }
    if (Buffer.byteLength(filePath, 'utf8') > PLANNING_SERVER_MAX_PATH_BYTES) {
      // Audit validation failure
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Request validation failure: path too long' },
          impact: { client_identity: req.identity, attempted_path: filePath, path_bytes: Buffer.byteLength(filePath, 'utf8') },
          policy: { rules_evaluated: ['requestValidation'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid request' }));
      return;
    }

    // Must be absolute path
    if (!path.isAbsolute(filePath)) {
      // Audit validation failure
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Request validation failure: path not absolute' },
          impact: { client_identity: req.identity, attempted_path: filePath },
          policy: { rules_evaluated: ['requestValidation'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
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
      // Audit path traversal denial
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Path traversal attempt blocked' },
          impact: { client_identity: req.identity, attempted_path: filePath, resolution: realTarget || absolutePath },
          policy: { rules_evaluated: ['pathTraversal'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      // Metrics: path denial
      metrics.pathDenialTotal++;
      metrics.pathDenialLabels.set('traversal', (metrics.pathDenialLabels.get('traversal') || 0) + 1);
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Access denied: Path outside project root' }));
      return;
    }

    // BLOCK .planning/ ACCESS
    try {
      const realPlanningDir = fs.realpathSync(path.resolve(projectRoot, '.planning'));
      if (realTarget && (realTarget === realPlanningDir || realTarget.startsWith(realPlanningDir + path.sep))) {
        // Audit .planning/ blocking
        try {
          audit.recordAuditEntry(process.cwd(), {
            context: { phase: '42', plan: '03', task: '3-3', narrative_ref: 'none', justification: 'Access to .planning/ via /v1/read blocked' },
            impact: { client_identity: req.identity, attempted_path: filePath, resolution: realTarget },
            policy: { rules_evaluated: ['planningDirBlock'], triggered_gates: [], approval_required: false, verdict: 'denied' },
            integrity: null
          });
        } catch (e) {}
        // Metrics: path denial (planning_dir_block)
        metrics.pathDenialTotal++;
        metrics.pathDenialLabels.set('planning_dir_block', (metrics.pathDenialLabels.get('planning_dir_block') || 0) + 1);
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Access to .planning/ files via /v1/read is restricted; use /v1/extract' }));
        return;
      }
    } catch (e) {
      // .planning directory may not exist; skip this check
    }

    let fileStats;
    try {
      fileStats = fs.statSync(absolutePath);
    } catch (e) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    if (!fileStats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    if (fileStats.size > PLANNING_SERVER_MAX_FILE_BYTES) {
      try {
        audit.recordAuditEntry(process.cwd(), {
          context: { phase: '42', plan: '02', task: '2-4', narrative_ref: 'none', justification: 'File size limit exceeded' },
          impact: { client_identity: req.identity, file_path: absolutePath, file_size: fileStats.size },
          policy: { rules_evaluated: ['sizeLimit'], triggered_gates: [], approval_required: false, verdict: 'denied' },
          integrity: null
        });
      } catch (e) {}
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid request' }));
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
          integrity: null
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
  // Fail fast if authentication is mandatory but token is not set
  if (!isInsecureMode && !PLANNING_SERVER_TOKEN) {
    console.error('[PlanningServer] ERROR: PLANNING_SERVER_TOKEN environment variable is required when auth mode is mandatory');
    process.exit(1);
  }
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
