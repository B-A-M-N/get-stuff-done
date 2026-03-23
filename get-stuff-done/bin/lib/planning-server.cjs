const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const broker = require('./broker.cjs');
const { normalizeMd } = require('./core.cjs');
const { parseCode } = require('./ast-parser.cjs');

const PORT = process.env.GSD_PLANNING_PORT || 3011;

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
      analysis = parseCode(rawContent, lang);
    } catch (e) {
      // Ignore parsing errors
    }
  } else {
    normalized = rawContent;
  }

  return { normalized, analysis };
}

const server = http.createServer(async (req, res) => {
  // Simple URL parsing for compatibility
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('ok');
    return;
  }

  if (url.pathname === '/v1/extract' && req.method === 'GET') {
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
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

async function startServer() {
  await broker.connect();
  
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`GSD Planning Server listening on port ${PORT}`);
      
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
