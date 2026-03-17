/**
 * ITL Audit — SQLite-backed persistence for narrative interpretation.
 */

const fs = require('fs');
const path = require('path');
const { parseAuditRecord } = require('./itl-schema.cjs');

let DatabaseSync;
/* c8 ignore start */
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}
/* c8 ignore stop */

function ensureSqliteSupport() {
  /* c8 ignore next 3 */
  if (!DatabaseSync) {
    throw new Error('SQLite audit trail requires Node.js with node:sqlite support.');
  }
}

function getAuditDir(cwd) {
  return path.join(cwd, '.planning', 'itl');
}

function getAuditDbPath(cwd) {
  return path.join(getAuditDir(cwd), 'audit.sqlite');
}

function openAuditDb(cwd) {
  ensureSqliteSupport();
  fs.mkdirSync(getAuditDir(cwd), { recursive: true });
  const db = new DatabaseSync(getAuditDbPath(cwd));
  db.exec(`
    CREATE TABLE IF NOT EXISTS interpretations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      narrative TEXT NOT NULL,
      route_hint TEXT NOT NULL,
      project_initialized INTEGER NOT NULL,
      interpretation_json TEXT NOT NULL,
      ambiguity_json TEXT NOT NULL,
      summary_markdown TEXT NOT NULL
    );
  `);
  return db;
}

function recordInterpretation(cwd, payload) {
  const db = openAuditDb(cwd);
  try {
    const createdAt = payload.created_at || new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO interpretations (
        created_at, narrative, route_hint, project_initialized,
        interpretation_json, ambiguity_json, summary_markdown
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      createdAt,
      payload.narrative,
      payload.interpretation.route_hint,
      payload.interpretation.project_initialized ? 1 : 0,
      JSON.stringify(payload.interpretation),
      JSON.stringify(payload.ambiguity),
      payload.summary
    );

    return {
      id: Number(result.lastInsertRowid),
      created_at: createdAt,
      db_path: path.relative(cwd, getAuditDbPath(cwd)).split(path.sep).join('/'),
    };
  } finally {
    db.close();
  }
}

function parseRow(cwd, row) {
  if (!row) return null;
  return parseAuditRecord({
    id: row.id,
    created_at: row.created_at,
    narrative: row.narrative,
    route_hint: row.route_hint,
    project_initialized: Boolean(row.project_initialized),
    interpretation: JSON.parse(row.interpretation_json),
    ambiguity: JSON.parse(row.ambiguity_json),
    summary: row.summary_markdown,
    db_path: path.relative(cwd, getAuditDbPath(cwd)).split(path.sep).join('/'),
  });
}

function getLatestInterpretation(cwd) {
  const db = openAuditDb(cwd);
  try {
    const row = db.prepare(`
      SELECT id, created_at, narrative, route_hint, project_initialized,
             interpretation_json, ambiguity_json, summary_markdown
      FROM interpretations
      ORDER BY id DESC
      LIMIT 1
    `).get();
    return parseRow(cwd, row);
  } finally {
    db.close();
  }
}

module.exports = {
  getAuditDbPath,
  recordInterpretation,
  getLatestInterpretation,
};
