const { Pool } = require('pg');
const broker = require('./broker.cjs');
const fs = require('fs');
const path = require('path');
const { safeFs } = require('./core.cjs');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

/**
 * Second Brain for relational memory storage using Postgres with SQLite fallback.
 */
class SecondBrain {
  constructor() {
    // Sanitize environment: if these are empty strings, pg's internal fallback will fail SASL checks.
    if (process.env.PGPASSWORD === '') delete process.env.PGPASSWORD;
    if (process.env.PGUSER === '') delete process.env.PGUSER;

    const config = {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE || 'gsd_local_brain',
      connectionTimeoutMillis: 2000, // Shorter timeout for faster fallback
    };

    const envUser = process.env.PGUSER;
    if (typeof envUser === 'string' && envUser.length > 0) {
      config.user = envUser;
    }

    const envPass = process.env.PGPASSWORD;
    if (typeof envPass === 'string' && envPass.length > 0) {
      config.password = envPass;
    } else {
      config.password = undefined;
    }

    const envUrl = process.env.DATABASE_URL;
    if (typeof envUrl === 'string' && envUrl.length > 0) {
      config.connectionString = envUrl;
    }

    this.pool = new Pool(config);
    this.offlineMode = false;
    this.useSqlite = false;
    this.sqliteDb = null;

    // Ensure Postgres indexes exist for firecrawl_audit
    if (!process.env.GSD_MEMORY_MODE || process.env.GSD_MEMORY_MODE !== 'sqlite') {
      this._ensureAuditIndexes().catch(() => {});
    }

    if (process.env.GSD_MEMORY_MODE === 'sqlite') {
      this.fallbackToSqlite();
    }

    // Suppress unhandled pool errors
    this.pool.on('error', (err) => {
      if (!this.useSqlite) {
        console.warn('[SecondBrain] Postgres idle error, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    });
  }

  fallbackToSqlite() {
    if (this.useSqlite) return;
    if (!DatabaseSync) {
      console.error('[SecondBrain] SQLite fallback requested but node:sqlite not available.');
      this.offlineMode = true;
      return;
    }

    try {
      const dbPath = path.join(process.cwd(), '.gemini_security', 'second_brain.db');
      safeFs.mkdirSync(path.dirname(dbPath), { recursive: true });
      this.sqliteDb = new DatabaseSync(dbPath);
      
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          source_uri TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          type TEXT NOT NULL,
          content_markdown TEXT NOT NULL,
          normalized_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS symbols (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artifact_id TEXT NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          line INTEGER NOT NULL,
          FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS dependencies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artifact_id TEXT NOT NULL,
          dependency_uri TEXT NOT NULL,
          FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS firecrawl_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          action TEXT NOT NULL,
          url TEXT,
          schema_json TEXT,
          status TEXT,
          latency_ms INTEGER
        );
        CREATE TABLE IF NOT EXISTS grants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          resource_pattern TEXT NOT NULL UNIQUE,
          grant_type TEXT NOT NULL, -- 'internal' or 'external'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          status TEXT DEFAULT 'active'
        );
        CREATE TABLE IF NOT EXISTS context_schema_registry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          domain_pattern TEXT NOT NULL UNIQUE,
          schema_json TEXT NOT NULL,
          version TEXT NOT NULL DEFAULT '1.0.0',
          approved_by TEXT,
          approved_at DATETIME,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          last_successful_extraction DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
        CREATE INDEX IF NOT EXISTS idx_symbols_artifact ON symbols(artifact_id);
        CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_ts ON firecrawl_audit(timestamp);
        CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_url ON firecrawl_audit(url);
        CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_status ON firecrawl_audit(status);
        CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_action ON firecrawl_audit(action);
        CREATE INDEX IF NOT EXISTS idx_schema_registry_domain ON context_schema_registry(domain_pattern);
      `);
      
      this.useSqlite = true;
      console.log('[SecondBrain] Using SQLite fallback at', dbPath);
    } catch (err) {
      console.error('[SecondBrain] Failed to initialize SQLite fallback:', err.message);
      this.offlineMode = true;
    }
  }

  async recordFirecrawlAudit(audit) {
    if (this.offlineMode) return;

    if (!this.useSqlite) {
      try {
        await this.pool.query(
          'INSERT INTO gsd_local_brain.firecrawl_audit (action, url, schema_json, status, latency_ms) VALUES ($1, $2, $3, $4, $5)',
          [audit.action, audit.url || null, audit.schema_json || null, audit.status, audit.latency_ms || null]
        );
        return;
      } catch (err) {
        console.warn('[SecondBrain] Postgres audit log failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
        // Do NOT return here; fall through to SQLite path to record this specific event.
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(`
          INSERT INTO firecrawl_audit (action, url, schema_json, status, latency_ms)
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(audit.action, audit.url || null, audit.schema_json || null, audit.status, audit.latency_ms || null);
      } catch (err) {
        console.error('[SecondBrain] Failed to record Firecrawl audit in SQLite:', err.message);
      }
    }
  }

  /**
   * Create a new access grant.
   */
  async createGrant(pattern, type, ttlSeconds = null) {
    if (this.offlineMode) return;

    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;

    if (!this.useSqlite) {
      try {
        await this.pool.query(
          `INSERT INTO gsd_local_brain.grants (resource_pattern, grant_type, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT(resource_pattern) DO UPDATE SET
             grant_type = EXCLUDED.grant_type,
             expires_at = EXCLUDED.expires_at,
             status = 'active'`,
          [pattern, type, expiresAt]
        );
        // Invalidate cache for this pattern after successful grant
        try {
          const grantCache = require('./policy-grant-cache.cjs');
          grantCache.clearGrant(pattern);
        } catch (e) {}
        return;
      } catch (err) {
        console.warn('[SecondBrain] Postgres grant create failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(`
          INSERT INTO grants (resource_pattern, grant_type, expires_at)
          VALUES (?, ?, ?)
          ON CONFLICT(resource_pattern) DO UPDATE SET
            grant_type = excluded.grant_type,
            expires_at = excluded.expires_at,
            status = 'active'
        `);
        stmt.run(pattern, type, expiresAt);
        // Invalidate cache for this pattern after successful grant
        try {
          const grantCache = require('./policy-grant-cache.cjs');
          grantCache.clearGrant(pattern);
        } catch (e) {}
      } catch (err) {
        console.error('[SecondBrain] Failed to create grant in SQLite:', err.message);
      }
    }
  }

  /**
   * Revoke an access grant.
   */
  async revokeGrant(pattern) {
    if (this.offlineMode) return;

    if (!this.useSqlite) {
      try {
        await this.pool.query("UPDATE gsd_local_brain.grants SET status = 'revoked' WHERE resource_pattern = $1", [pattern]);
        // Invalidate cache for this pattern after successful revoke
        try {
          const grantCache = require('./policy-grant-cache.cjs');
          grantCache.clearGrant(pattern);
        } catch (e) {}
        return;
      } catch (err) {
        console.warn('[SecondBrain] Postgres grant revoke failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        this.sqliteDb.prepare("UPDATE grants SET status = 'revoked' WHERE resource_pattern = ?").run(pattern);
        // Invalidate cache for this pattern after successful revoke
        try {
          const grantCache = require('./policy-grant-cache.cjs');
          grantCache.clearGrant(pattern);
        } catch (e) {}
      } catch (err) {
        console.error('[SecondBrain] Failed to revoke grant in SQLite:', err.message);
      }
    }
  }

  /**
   * List all active grants.
   */
  async listGrants() {
    if (this.offlineMode) return [];

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          "SELECT * FROM gsd_local_brain.grants WHERE status = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)"
        );
        return res.rows;
      } catch (err) {
        console.warn('[SecondBrain] Postgres grants fetch failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        return this.sqliteDb.prepare(`
          SELECT * FROM grants WHERE status = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        `).all();
      } catch (err) {
        console.error('[SecondBrain] Failed to list grants from SQLite:', err.message);
        return [];
      }
    }

    return [];
  }

  /**
   * Check if a resource access is granted.
   */
  async checkGrant(resource) {
    // Fail-Closed: Access is denied if governance database is unavailable
    if (this.offlineMode || !this.useSqlite || !this.sqliteDb) {
      // Emergency Bypass: allow access to planning server only to allow self-initialization
      if (resource.startsWith('http://localhost:3011')) return true;
      return false;
    }
    
    try {
      const activeGrants = await this.listGrants();
      if (process.env.GSD_DEBUG === 'true') {
        console.log(`[checkGrant] Checking "${resource}" against ${activeGrants.length} grants`);
      }

      return activeGrants.some(g => {
        let match = false;
        // 1. Try URL-aware matching if both are standard URLs
        if (resource.includes('://') && g.resource_pattern.includes('://')) {
          try {
            const reqUrl = new URL(resource);
            const grantUrl = new URL(g.resource_pattern);
            
            if (reqUrl.host === grantUrl.host && reqUrl.protocol === grantUrl.protocol) {
              const reqPath = reqUrl.pathname.replace(/\/$/, '') + '/';
              const grantPath = grantUrl.pathname.replace(/\/$/, '') + '/';
              match = reqPath.startsWith(grantPath);
            }
          } catch (e) {}
        }

        if (!match) {
          // 2. Fallback to anchored string matching for custom schemes or non-URLs
          match = resource === g.resource_pattern || resource.startsWith(g.resource_pattern + '/');
        }

        if (process.env.GSD_DEBUG === 'true' && match) {
          console.log(`[checkGrant] Match found: "${g.resource_pattern}"`);
        }
        return match;
      });
    } catch (err) {
      return false; // Fail-closed on error
    }
  }

  /**
   * Retrieve Firecrawl audit logs with optional filters.
   * @param {number} limit - Maximum number of records to return
   * @param {Object} filters - Optional filters: { from, to, domain, status, action }
   */
  async getFirecrawlAudit(limit = 20, filters = {}) {
    if (this.offlineMode) return [];

    const { from, to, domain, status, action } = filters;
    const conditions = [];
    const params = [];

    if (from) {
      conditions.push('timestamp >= $' + (params.length + 1));
      params.push(from);
    }
    if (to) {
      conditions.push('timestamp <= $' + (params.length + 1));
      params.push(to);
    }
    if (domain) {
      conditions.push('url ILIKE $' + (params.length + 1));
      params.push(`%${domain}%`);
    }
    if (status) {
      conditions.push('status = $' + (params.length + 1));
      params.push(status);
    }
    if (action) {
      conditions.push('action = $' + (params.length + 1));
      params.push(action);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limit);

    if (!this.useSqlite) {
      try {
        const query = `SELECT * FROM gsd_local_brain.firecrawl_audit ${whereClause} ORDER BY timestamp DESC LIMIT $${params.length}`;
        const res = await this.pool.query(query, params);
        return res.rows;
      } catch (err) {
        console.warn('[SecondBrain] Postgres audit fetch failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        // Build SQLite query with ? placeholders
        const sqliteConditions = [];
        const sqliteParams = [];

        if (from) {
          sqliteConditions.push('timestamp >= ?');
          sqliteParams.push(from);
        }
        if (to) {
          sqliteConditions.push('timestamp <= ?');
          sqliteParams.push(to);
        }
        if (domain) {
          sqliteConditions.push('url LIKE ?');
          sqliteParams.push(`%${domain}%`);
        }
        if (status) {
          sqliteConditions.push('status = ?');
          sqliteParams.push(status);
        }
        if (action) {
          sqliteConditions.push('action = ?');
          sqliteParams.push(action);
        }

        const whereClauseSqlite = sqliteConditions.length > 0 ? 'WHERE ' + sqliteConditions.join(' AND ') : '';
        const query = `SELECT * FROM firecrawl_audit ${whereClauseSqlite} ORDER BY timestamp DESC LIMIT ?`;
        sqliteParams.push(limit);
        return this.sqliteDb.prepare(query).all(...sqliteParams);
      } catch (err) {
        console.error('[SecondBrain] Failed to retrieve Firecrawl audit from SQLite:', err.message);
        return [];
      }
    }

    return [];
  }

  /**
   * Clean up old audit records based on retention policy.
   * @param {number} retentionDays - Number of days to retain (default 90)
   * @returns {number} Number of rows deleted
   */
  async cleanupOldAudits(retentionDays = 90) {
    if (this.offlineMode) return 0;

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    let deletedCount = 0;

    if (!this.useSqlite) {
      try {
        const result = await this.pool.query(
          'DELETE FROM gsd_local_brain.firecrawl_audit WHERE timestamp < $1',
          [cutoffDate]
        );
        deletedCount = result.rowCount || 0;
        return deletedCount;
      } catch (err) {
        console.warn('[SecondBrain] Postgres audit cleanup failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(
          'DELETE FROM firecrawl_audit WHERE timestamp < ?'
        );
        const info = stmt.run(cutoffDate);
        deletedCount = info.changes || 0;
        return deletedCount;
      } catch (err) {
        console.error('[SecondBrain] Failed to cleanup old audits in SQLite:', err.message);
        return 0;
      }
    }

    return 0;
  }

  /**
   * Generate health summary for Firecrawl operations.
   * @returns {Object} Health metrics including top slow domains, high error rate domains, latency by action
   */
  async getFirecrawlHealthSummary() {
    if (this.offlineMode) return {
      generated_at: new Date().toISOString(),
      period_hours: 24,
      topSlowDomains: [],
      highErrorRateDomains: [],
      latencyByAction: []
    };

    const periodHours = 24;
    const cutoffDate = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();
    let rows = [];

    // Fetch recent audit data
    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          'SELECT url, action, status, latency_ms FROM gsd_local_brain.firecrawl_audit WHERE timestamp >= $1',
          [cutoffDate]
        );
        rows = res.rows;
      } catch (err) {
        console.warn('[SecondBrain] Postgres health fetch failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        rows = this.sqliteDb.prepare(`
          SELECT url, action, status, latency_ms FROM firecrawl_audit WHERE timestamp >= ?
        `).all(cutoffDate);
      } catch (err) {
        console.error('[SecondBrain] Failed to fetch health data from SQLite:', err.message);
        rows = [];
      }
    }

    // Process in JS
    const domainStats = new Map(); // domain -> { total_latency, count, errors }
    const actionStats = new Map(); // action -> { total_latency, count }
    const statusCounts = new Map(); // domain -> { total: N, errors: M }

    const extractDomain = (url) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname;
      } catch {
        return null;
      }
    };

    const isErrorStatus = (status) => {
      return ['error', 'denied', 'blocked', 'failed'].includes(status?.toLowerCase());
    };

    for (const row of rows) {
      const domain = extractDomain(row.url);
      if (!domain) continue;

      // Aggregate by domain
      if (!domainStats.has(domain)) {
        domainStats.set(domain, { total_latency: 0, count: 0 });
        statusCounts.set(domain, { total: 0, errors: 0 });
      }
      const dStat = domainStats.get(domain);
      if (row.latency_ms) {
        dStat.total_latency += row.latency_ms;
        dStat.count++;
      }
      const dErr = statusCounts.get(domain);
      dErr.total++;
      if (isErrorStatus(row.status)) {
        dErr.errors++;
      }

      // Aggregate by action
      if (!actionStats.has(row.action)) {
        actionStats.set(row.action, { total_latency: 0, count: 0 });
      }
      const aStat = actionStats.get(row.action);
      if (row.latency_ms) {
        aStat.total_latency += row.latency_ms;
        aStat.count++;
      }
    }

    // Compute top slow domains (avg latency)
    const topSlowDomains = Array.from(domainStats.entries())
      .filter(([_, stat]) => stat.count > 0)
      .map(([domain, stat]) => ({
        domain,
        avg_latency: Math.round(stat.total_latency / stat.count)
      }))
      .sort((a, b) => b.avg_latency - a.avg_latency)
      .slice(0, 10);

    // Compute high error rate domains (>20%)
    const highErrorRateDomains = Array.from(statusCounts.entries())
      .filter(([_, sc]) => sc.total >= 5) // minimum 5 requests
      .map(([domain, sc]) => ({
        domain,
        error_rate: sc.errors / sc.total,
        total: sc.total
      }))
      .filter(item => item.error_rate > 0.2)
      .sort((a, b) => b.error_rate - a.error_rate)
      .slice(0, 10);

    // Compute latency by action
    const latencyByAction = Array.from(actionStats.entries())
      .filter(([_, stat]) => stat.count > 0)
      .map(([action, stat]) => ({
        action,
        avg_latency: Math.round(stat.total_latency / stat.count)
      }))
      .sort((a, b) => b.avg_latency - a.avg_latency);

    return {
      generated_at: new Date().toISOString(),
      period_hours: periodHours,
      topSlowDomains,
      highErrorRateDomains,
      latencyByAction
    };
  }

  /**
   * Upsert an artifact and its analysis results.
   */
  async ingestArtifact(artifact) {
    if (this.offlineMode) return;

    if (!this.useSqlite) {
      let client;
      try {
        client = await this.pool.connect();
        await client.query('BEGIN');

        const upsertArtifactQuery = `
          INSERT INTO gsd_local_brain.artifacts (id, source_uri, content_hash, type, content_markdown)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            source_uri = EXCLUDED.source_uri,
            content_hash = EXCLUDED.content_hash,
            type = EXCLUDED.type,
            content_markdown = EXCLUDED.content_markdown,
            normalized_at = CURRENT_TIMESTAMP;
        `;
        
        await client.query(upsertArtifactQuery, [
          artifact.id,
          artifact.source_uri,
          artifact.content_hash,
          artifact.type,
          artifact.content_markdown
        ]);

        if (artifact.analysis) {
          await client.query('DELETE FROM gsd_local_brain.symbols WHERE artifact_id = $1', [artifact.id]);
          await client.query('DELETE FROM gsd_local_brain.dependencies WHERE artifact_id = $1', [artifact.id]);

          if (artifact.analysis.symbols) {
            for (const s of artifact.analysis.symbols) {
              await client.query(
                'INSERT INTO gsd_local_brain.symbols (artifact_id, name, kind, line) VALUES ($1, $2, $3, $4)',
                [artifact.id, s.name, s.kind, s.line]
              );
              await broker.publish('symbol.ingested', { artifactId: artifact.id, symbolName: s.name, symbolKind: s.kind, line: s.line });
            }
          }

          if (artifact.analysis.dependencies) {
            for (const d of artifact.analysis.dependencies) {
              await client.query('INSERT INTO gsd_local_brain.dependencies (artifact_id, dependency_uri) VALUES ($1, $2)', [artifact.id, d]);
            }
          }
        }

        await client.query('COMMIT');
        return;
      } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.warn('[SecondBrain] Postgres ingest failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      } finally {
        if (client) client.release();
      }
    }

    // SQLite Path
    if (this.useSqlite && this.sqliteDb) {
      try {
        const upsertStmt = this.sqliteDb.prepare(`
          INSERT INTO artifacts (id, source_uri, content_hash, type, content_markdown, normalized_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            source_uri=excluded.source_uri,
            content_hash=excluded.content_hash,
            type=excluded.type,
            content_markdown=excluded.content_markdown,
            normalized_at=CURRENT_TIMESTAMP
        `);
        upsertStmt.run(artifact.id, artifact.source_uri, artifact.content_hash, artifact.type, artifact.content_markdown);

        if (artifact.analysis) {
          this.sqliteDb.prepare('DELETE FROM symbols WHERE artifact_id = ?').run(artifact.id);
          this.sqliteDb.prepare('DELETE FROM dependencies WHERE artifact_id = ?').run(artifact.id);

          if (artifact.analysis.symbols) {
            const symStmt = this.sqliteDb.prepare('INSERT INTO symbols (artifact_id, name, kind, line) VALUES (?, ?, ?, ?)');
            for (const s of artifact.analysis.symbols) {
              symStmt.run(artifact.id, s.name, s.kind, s.line);
              await broker.publish('symbol.ingested', { artifactId: artifact.id, symbolName: s.name, symbolKind: s.kind, line: s.line });
            }
          }

          if (artifact.analysis.dependencies) {
            const depStmt = this.sqliteDb.prepare('INSERT INTO dependencies (artifact_id, dependency_uri) VALUES (?, ?)');
            for (const d of artifact.analysis.dependencies) {
              depStmt.run(artifact.id, d);
            }
          }
        }
      } catch (err) {
        console.error('[SecondBrain] SQLite ingest failed:', err.message);
      }
    }
  }

  /**
   * Retrieve a list of all context artifacts.
   */
  async listContext(limit = 100) {
    if (this.offlineMode) return [];

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          'SELECT id, source_uri, type, normalized_at FROM gsd_local_brain.artifacts ORDER BY normalized_at DESC LIMIT $1',
          [limit]
        );
        return res.rows;
      } catch (err) {
        console.warn('[SecondBrain] Postgres list failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        return this.sqliteDb.prepare(`
          SELECT id, source_uri, type, normalized_at FROM artifacts ORDER BY normalized_at DESC LIMIT ?
        `).all(limit);
      } catch (err) {
        console.error('[SecondBrain] SQLite list failed:', err.message);
        return [];
      }
    }

    return [];
  }

  /**
   * Search for symbols by name.
   */
  async findSymbols(name) {
    if (this.offlineMode) return [];

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          'SELECT s.*, a.source_uri FROM gsd_local_brain.symbols s JOIN gsd_local_brain.artifacts a ON s.artifact_id = a.id WHERE s.name = $1',
          [name]
        );
        return res.rows;
      } catch (err) {
        console.warn('[SecondBrain] Postgres search failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        const rows = this.sqliteDb.prepare(`
          SELECT s.*, a.source_uri 
          FROM symbols s
          JOIN artifacts a ON s.artifact_id = a.id
          WHERE s.name = ?
        `).all(name);
        return rows;
      } catch (err) {
        console.error('[SecondBrain] SQLite search failed:', err.message);
        return [];
      }
    }

    return [];
  }

  // ─── Schema Registry Methods ─────────────────────────────────────

  /**
   * Helper: check if a URL's host matches a domain pattern.
   * Pattern can be a host (e.g., "example.com", "*.example.com") or a full URL.
   * Matching: exact host match OR subdomain (urlHost === patternHost || urlHost.endsWith('.' + patternHost))
   */
  _matchDomain(url, pattern) {
    try {
      const urlObj = new URL(url);
      const urlHost = urlObj.hostname.toLowerCase();

      let patternHost = pattern;
      if (pattern.includes('://')) {
        try {
          const patternObj = new URL(pattern);
          patternHost = patternObj.hostname.toLowerCase();
        } catch {
          // invalid pattern, treat as host literal
          patternHost = pattern.toLowerCase();
        }
      } else {
        patternHost = pattern.toLowerCase();
      }

      // Strip leading "*." wildcard for prefix matching
      if (patternHost.startsWith('*.')) {
        patternHost = patternHost.slice(2);
      }

      if (urlHost === patternHost) return true;
      if (urlHost.endsWith('.' + patternHost)) return true;
    } catch (e) {
      // URL parsing failed; no match
    }
    return false;
  }

  async _ensureSchemaTableExists() {
    if (this.offlineMode) return;
    if (!this.useSqlite) {
      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS context_schema_registry (
            id SERIAL PRIMARY KEY,
            domain_pattern TEXT NOT NULL UNIQUE,
            schema_json JSONB NOT NULL,
            version TEXT NOT NULL DEFAULT '1.0.0',
            approved_by TEXT,
            approved_at TIMESTAMP,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            last_successful_extraction TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn('[SecondBrain] Failed to create context_schema_registry table:', err.message);
        }
      }
    }
    // For SQLite, table is created in fallbackToSqlite
  }

  async _ensureAuditIndexes() {
    if (this.offlineMode) return;
    if (!this.useSqlite) {
      try {
        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_timestamp ON gsd_local_brain.firecrawl_audit(timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_url ON gsd_local_brain.firecrawl_audit(url);
          CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_status ON gsd_local_brain.firecrawl_audit(status);
          CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_action ON gsd_local_brain.firecrawl_audit(action);
        `);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn('[SecondBrain] Failed to create audit indexes:', err.message);
        }
      }
    }
    // For SQLite, indexes are created in fallbackToSqlite
  }

  async registerSchema(domainPattern, schema, version = '1.0.0', approvedBy = null) {
    await this._ensureSchemaTableExists();
    if (this.offlineMode) return;

    const schemaJson = typeof schema === 'string' ? schema : JSON.stringify(schema);
    const now = new Date().toISOString();

    if (!this.useSqlite) {
      try {
        await this.pool.query(
          `INSERT INTO gsd_local_brain.context_schema_registry (domain_pattern, schema_json, version, approved_by, approved_at, active, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT(domain_pattern) DO UPDATE SET
             schema_json = EXCLUDED.schema_json,
             version = EXCLUDED.version,
             approved_by = EXCLUDED.approved_by,
             approved_at = EXCLUDED.approved_at,
             active = EXCLUDED.active,
             created_at = EXCLUDED.created_at`,
          [domainPattern, schemaJson, version, approvedBy, now, true, now]
        );
        return;
      } catch (err) {
        console.warn('[SecondBrain] Postgres schema register failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(`
          INSERT INTO context_schema_registry (domain_pattern, schema_json, version, approved_by, approved_at, active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(domain_pattern) DO UPDATE SET
            schema_json = excluded.schema_json,
            version = excluded.version,
            approved_by = excluded.approved_by,
            approved_at = excluded.approved_at,
            active = excluded.active,
            created_at = excluded.created_at
        `);
        stmt.run(domainPattern, schemaJson, version, approvedBy, now, true, now);
      } catch (err) {
        console.error('[SecondBrain] SQLite schema register failed:', err.message);
      }
    }
  }

  async getSchemaForDomain(url) {
    if (this.offlineMode) return null;

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM gsd_local_brain.context_schema_registry WHERE active = true ORDER BY created_at DESC`
        );
        for (const row of res.rows) {
          if (this._matchDomain(url, row.domain_pattern)) {
            return {
              schema: row.schema_json, // For Postgres JSONB, row.schema_json is already an object if parsed by pg
              version: row.version,
              domainPattern: row.domain_pattern
            };
          }
        }
        return null;
      } catch (err) {
        console.warn('[SecondBrain] Postgres schema lookup failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        const rows = this.sqliteDb.prepare(`
          SELECT * FROM context_schema_registry WHERE active = 1
        `).all();
        for (const row of rows) {
          if (this._matchDomain(url, row.domain_pattern)) {
            return {
              schema: JSON.parse(row.schema_json),
              version: row.version,
              domainPattern: row.domain_pattern
            };
          }
        }
        return null;
      } catch (err) {
        console.error('[SecondBrain] SQLite schema lookup failed:', err.message);
        return null;
      }
    }

    return null;
  }

  async listSchemas(domainPattern = null) {
    if (this.offlineMode) return [];

    if (!this.useSqlite) {
      try {
        let query = 'SELECT * FROM gsd_local_brain.context_schema_registry WHERE active = true';
        const params = [];
        if (domainPattern) {
          query += ' AND domain_pattern ILIKE $1';
          params.push(`%${domainPattern}%`);
        }
        query += ' ORDER BY created_at DESC';
        const res = await this.pool.query(query, params);
        return res.rows;
      } catch (err) {
        console.warn('[SecondBrain] Postgres schema list failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        if (domainPattern) {
          return this.sqliteDb.prepare(`
            SELECT * FROM context_schema_registry WHERE active = 1 AND domain_pattern LIKE ? ORDER BY created_at DESC
          `).all(`%${domainPattern}%`);
        } else {
          return this.sqliteDb.prepare(`
            SELECT * FROM context_schema_registry WHERE active = 1 ORDER BY created_at DESC
          `).all();
        }
      } catch (err) {
        console.error('[SecondBrain] SQLite schema list failed:', err.message);
        return [];
      }
    }

    return [];
  }

  async markSchemaUsed(domainPattern) {
    await this._ensureSchemaTableExists();
    if (this.offlineMode) return;

    const now = new Date().toISOString();

    if (!this.useSqlite) {
      try {
        await this.pool.query(
          `UPDATE gsd_local_brain.context_schema_registry SET last_successful_extraction = $1 WHERE domain_pattern = $2`,
          [now, domainPattern]
        );
        return;
      } catch (err) {
        console.warn('[SecondBrain] Postgres schema markUsed failed:', err.message);
        // Don't fallback; marking is optional
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        this.sqliteDb.prepare(`
          UPDATE context_schema_registry SET last_successful_extraction = ? WHERE domain_pattern = ?
        `).run(now, domainPattern);
      } catch (err) {
        console.error('[SecondBrain] SQLite schema markUsed failed:', err.message);
      }
    }
  }

  async getStaleSchemas(days = 30) {
    if (this.offlineMode) return [];

    const thresholdDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM gsd_local_brain.context_schema_registry WHERE active = true AND (last_successful_extraction IS NULL OR last_successful_extraction < $1) ORDER BY created_at DESC`,
          [thresholdDate]
        );
        return res.rows;
      } catch (err) {
        console.warn('[SecondBrain] Postgres stale schemas fetch failed, falling back to SQLite:', err.message);
        this.fallbackToSqlite();
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        return this.sqliteDb.prepare(`
          SELECT * FROM context_schema_registry WHERE active = 1 AND (last_successful_extraction IS NULL OR last_successful_extraction < ?) ORDER BY created_at DESC
        `).all(thresholdDate);
      } catch (err) {
        console.error('[SecondBrain] SQLite stale schemas fetch failed:', err.message);
        return [];
      }
    }

    return [];
  }

  async close() {
    await this.pool.end();
    if (this.sqliteDb) this.sqliteDb.close();
  }
}

module.exports = new SecondBrain();
