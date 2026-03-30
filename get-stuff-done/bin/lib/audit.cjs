/**
 * Audit — OpenBoxDM Audit Ledger implementation
 *
 * Provides a non-repudiable, transparent record of all agent actions,
 * linked to narrative justification and identity.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { error, safeFs } = require('./core.cjs');

function auditDir(cwd) {
  return path.join(cwd, '.planning', 'audit');
}

function auditLogPath(cwd) {
  return path.join(auditDir(cwd), 'ledger.jsonl');
}

/**
 * Capture the current identity for the audit log.
 * In a real-world scenario, this might be a JWT or a signed session token.
 * For GSD, we use a local identity.yaml or fallback to system user.
 */
function getIdentity(cwd) {
  const idPath = path.join(process.env.HOME || process.env.USERPROFILE, '.gsd', 'identity.yaml');
  let name = process.env.USER || process.env.USERNAME || 'unknown';
  let role = 'executor';
  let session_id = process.env.GSD_SESSION_ID || 'local-' + crypto.randomBytes(4).toString('hex');

  if (safeFs.existsSync(idPath)) {
    try {
      const content = safeFs.readFileSync(idPath, 'utf-8');
      const m = content.match(/name:\s*(.*)/);
      if (m) name = m[1].trim();
      const rm = content.match(/role:\s*(.*)/);
      if (rm) role = rm[1].trim();
    } catch {}
  }

  return { id: name, role, session_id };
}

/**
 * Record an action to the audit ledger.
 */
function recordAuditEntry(cwd, entry) {
  const dir = auditDir(cwd);
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }

  // HardLine: Narrative Linkage Verification (NON-BYPASSABLE)
  if (entry.context && entry.context.narrative_ref && entry.context.narrative_ref !== 'none') {
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(cwd, '.planning', 'itl', 'audit.sqlite');
    
    if (!safeFs.existsSync(dbPath)) {
      throw new Error(`Critical Integrity Failure: ITL audit database missing at ${dbPath}. Audit trail broken.`);
    }

    let db;
    try {
      db = new DatabaseSync(dbPath);
      const row = db.prepare('SELECT id FROM interpretations WHERE id = ?').get(Number(entry.context.narrative_ref));
      if (!row) {
        throw new Error(`Narrative Linkage Failure: Narrative ID ${entry.context.narrative_ref} not found in ITL audit trail. Cannot commit without valid justification.`);
      }
    } catch (err) {
      throw err; // Hard stop on SQLite errors or missing rows
    } finally {
      if (db) db.close();
    }
  }

  const identity = getIdentity(cwd);
  const projectId = crypto.createHash('sha256').update(cwd).digest('hex').substring(0, 12);
  const fullEntry = {
    audit_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: identity,
    project_id: projectId,
    ...entry
  };

  // Ensure entry is valid before appending
  if (!fullEntry.context || !fullEntry.impact) {
    throw new Error('Audit entry missing required fields (context/impact)');
  }

  safeFs.appendFileSync(auditLogPath(cwd), JSON.stringify(fullEntry) + '\n', 'utf-8');
  return fullEntry;
}

/**
 * CLI command to log an entry manually (rarely used by agents, usually internal)
 */
function cmdAuditLog(cwd, options, raw) {
  try {
    const entry = {
      context: {
        phase: options.phase || 'unknown',
        plan: options.plan || 'unknown',
        task: options.task ? Number(options.task) : 0,
        narrative_ref: options.narrative_ref || 'none',
        justification: options.justification || 'No justification provided'
      },
      impact: {
        files_touched: options.files ? options.files.split(',') : [],
        sensitive_files_flagged: [],
        git_commit_hash: options.commit_hash || null,
        authority_envelope_hash: options.authority_hash || null
      },
      policy: {
        rules_evaluated: [],
        triggered_gates: [],
        approval_required: false,
        verdict: 'allowed'
      },
      integrity: null
    };

    const recorded = recordAuditEntry(cwd, entry);
    if (raw) {
      process.stdout.write(JSON.stringify(recorded, null, 2) + '\n');
    } else {
      process.stdout.write(`✅ AUDIT RECORDED: ${recorded.audit_id}\n`);
    }
  } catch (err) {
    error(`Failed to record audit entry: ${err.message}`);
  }
}

/**
 * CLI command to read the ledger
 */
function cmdAuditRead(cwd, limit = 10, raw) {
  const log = auditLogPath(cwd);
  if (!safeFs.existsSync(log)) {
    if (raw) process.stdout.write('[]\n');
    else process.stdout.write('No audit ledger found.\n');
    return;
  }

  const lines = safeFs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean);
  const entries = lines.slice(-limit).map(l => JSON.parse(l));

  if (raw) {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
  } else {
    process.stdout.write(`--- AUDIT LEDGER (last ${entries.length} entries) ---\n`);
    for (const e of entries) {
      process.stdout.write(`[${e.timestamp}] ${e.audit_id.slice(0, 8)} | ${e.actor.id} (${e.actor.role}) | ${e.context.phase}-${e.context.plan} task ${e.context.task}\n`);
      process.stdout.write(`  Justification: ${e.context.justification.slice(0, 80)}...\n`);
      process.stdout.write(`  Impact: ${e.impact.files_touched.join(', ')}\n\n`);
    }
  }
}

/**
 * CLI command to stream debug logs from multiple sources
 */
function cmdDebugLog(cwd, options, raw) {
  const limit = options.limit ? parseInt(options.limit, 10) : 50;
  const since = options.since ? parseInt(options.since, 10) : 60;
  const follow = options.follow === true;
  const levelFilter = options.level; // optional: debug/info/warn/error

  const secondBrain = require('./second-brain.cjs');

  async function fetchAndDisplay() {
    try {
      const entries = await secondBrain.getRecentAudits(cwd, limit, since);
      // Apply level filter if provided
      const filtered = levelFilter ? entries.filter(e => e.level === levelFilter) : entries;
      // Output each entry with color
      for (const e of filtered) {
        const time = new Date(e.timestamp).toISOString();
        const type = e.source === 'firecrawl' ? 'FIRECRAWL' : 'INTEGRITY';
        // Color based on level
        let colorCode = '\x1b[32m'; // info = green
        if (e.level === 'error') colorCode = '\x1b[31m';
        else if (e.level === 'warn') colorCode = '\x1b[33m';
        else if (e.level === 'debug') colorCode = '\x1b[36m';
        const reset = '\x1b[0m';
        const line = `[${type}] ${time} ${e.action} ${e.details}`;
        process.stdout.write(colorCode + line + reset + '\n');
      }
    } catch (err) {
      process.stderr.write(`[DebugLog] Error: ${err.message}\n`);
    }
  }

  if (follow) {
    fetchAndDisplay();
    const interval = setInterval(fetchAndDisplay, 2000);
    process.on('SIGINT', () => {
      clearInterval(interval);
      process.exit(0);
    });
    // No exit; keep process alive
  } else {
    fetchAndDisplay().then(() => {
      // Give event loop a tick then exit
      setImmediate(() => process.exit(0));
    }).catch(err => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    });
  }
}

// ─── Error Context Capture ─────────────────────────────────────────────────────

/**
 * Capture structured error context for debugging and post-mortem analysis.
 * @param {Error} err - The error object
 * @param {Object} context - Additional context (e.g., type, command, etc.)
 * @returns {Object} Structured error context
 */
function captureErrorContext(err, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    command: process.argv.slice(1).join(' '),
    cwd: process.cwd(),
    env: {
      GSD_LOG_LEVEL: process.env.GSD_LOG_LEVEL,
      GSD_INTERNAL_BYPASS: process.env.GSD_INTERNAL_BYPASS
    },
    message: err.message,
    stack: err.stack,
    ...context
  };
}

/**
 * Write error context to the .planning/errors directory.
 * Creates directory if it doesn't exist.
 * @param {Object} ctx - Error context object from captureErrorContext
 */
function writeErrorContext(ctx) {
  const errorsDir = path.join(process.cwd(), '.planning', 'errors');
  if (!safeFs.existsSync(errorsDir)) {
    safeFs.mkdirSync(errorsDir, { recursive: true });
  }
  const errorFile = path.join(errorsDir, 'latest.json');
  safeFs.writeFileSync(errorFile, JSON.stringify(ctx, null, 2), 'utf-8');
}

/**
 * CLI command to show recent error context
 */
function cmdErrorsRecent(cwd, raw) {
  const errorFile = path.join(cwd, '.planning', 'errors', 'latest.json');
  if (!safeFs.existsSync(errorFile)) {
    if (raw) {
      process.stdout.write('{}\n');
    } else {
      process.stdout.write('No error context found.\n');
    }
    return;
  }

  try {
    const content = safeFs.readFileSync(errorFile, 'utf-8');
    if (raw) {
      process.stdout.write(content + '\n');
    } else {
      const ctx = JSON.parse(content);
      process.stdout.write(`Error captured at ${ctx.timestamp}\n`);
      process.stdout.write(`Command: ${ctx.command}\n`);
      process.stdout.write(`Message: ${ctx.message}\n`);
      if (ctx.stack) {
        process.stdout.write(`Stack trace:\n${ctx.stack}\n`);
      }
      // Print any additional context keys
      const extraKeys = Object.keys(ctx).filter(k => !['timestamp','command','cwd','env','message','stack'].includes(k));
      if (extraKeys.length > 0) {
        process.stdout.write(`Additional context: ${extraKeys.map(k => `${k}=${JSON.stringify(ctx[k])}`).join(', ')}\n`);
      }
    }
  } catch (err) {
    // If parsing fails, output raw content if raw mode, else error message
    if (raw) {
      // We already have content variable? Let's read again to be safe
      try {
        const rawContent = safeFs.readFileSync(errorFile, 'utf-8');
        process.stdout.write(rawContent + '\n');
      } catch {}
    } else {
      process.stdout.write(`Error reading context file: ${err.message}\n`);
    }
  }
}

module.exports = {
  recordAuditEntry,
  cmdAuditLog,
  cmdAuditRead,
  getIdentity,
  cmdDebugLog,
  captureErrorContext,
  writeErrorContext,
  cmdErrorsRecent
};
