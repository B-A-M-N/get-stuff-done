const { Pool } = require('pg');
const broker = require('./broker.cjs');
const fs = require('fs');
const path = require('path');
const { safeFs } = require('./core.cjs');
const crypto = require('crypto');

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
    this._projectRoot = path.resolve(process.cwd());
    this._config = this._buildConfig();
    this._poolClosed = false;
    this._sqliteOpen = false;
    this._lastDegradedDetails = null;
    this._warningReasons = new Set();
    this._initializeState();

    // Sanitize environment: if these are empty strings, pg's internal fallback will fail SASL checks.
    if (process.env.PGPASSWORD === '') delete process.env.PGPASSWORD;
    if (process.env.PGUSER === '') delete process.env.PGUSER;

    // Compute project identifier and database name for isolation
    const projectHash = crypto.createHash('sha256').update(this._projectRoot).digest('hex').substring(0, 12);
    this.projectRoot = this._projectRoot;
    this.projectId = projectHash;
    this.databaseName = process.env.GSD_DB_NAME || `gsd_local_brain_${projectHash}`;
    this._refreshConfig();
    this._createPool();
    this._initPromise = null;

    if (process.env.GSD_MEMORY_MODE === 'sqlite') {
      this.fallbackToSqlite();
    }
  }

  _buildConfig() {
    return {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      connectionTimeoutMillis: 2000,
      allowExitOnIdle: true,
    };
  }

  _refreshConfig() {
    const config = this._buildConfig();
    config.database = process.env.PGDATABASE || this.databaseName;

    const envUser = process.env.PGUSER;
    if (typeof envUser === 'string' && envUser.length > 0) {
      config.user = envUser;
    }

    const envPass = process.env.PGPASSWORD;
    config.password = typeof envPass === 'string' && envPass.length > 0 ? envPass : undefined;

    const envUrl = process.env.DATABASE_URL;
    if (typeof envUrl === 'string' && envUrl.length > 0) {
      config.connectionString = envUrl;
    }

    this._config = config;
  }

  _initializeState() {
    const configuredBackend = process.env.GSD_MEMORY_MODE === 'sqlite' ? 'sqlite' : 'postgres';
    this.backendState = {
      configured_backend: configuredBackend,
      active_backend: configuredBackend,
      degraded: false,
      degraded_reason: null,
      warning_emitted: false,
      memory_critical_blocked: false,
    };
    this.offlineMode = false;
    this.useSqlite = configuredBackend === 'sqlite';
    this.sqliteDb = null;
  }

  _createPool() {
    this.pool = new Pool(this._config);
    this._poolClosed = false;
    this.pool.on('error', (err) => {
      if (!this.useSqlite) {
        this.transitionToDegraded(this.classifyPostgresFailure(err), {
          message: err.message,
          source: 'pool_error',
        });
      }
    });
  }

  _getSqlitePath() {
    const explicitPath = process.env.GSD_SECOND_BRAIN_SQLITE_PATH;
    if (typeof explicitPath === 'string' && explicitPath.length > 0) {
      return explicitPath;
    }

    const fileName = process.env.NODE_TEST_CONTEXT
      ? `second_brain.test.${process.pid}.db`
      : 'second_brain.db';
    return path.join(process.cwd(), '.gemini_security', fileName);
  }

  getBackendState() {
    return {
      ...this.backendState,
      degraded_details: this._lastDegradedDetails,
    };
  }

  classifyPostgresFailure(err) {
    const message = String(err?.message || '').toLowerCase();
    const code = String(err?.code || '').toLowerCase();

    if (
      message.includes('scram-server-first-message') ||
      message.includes('password authentication failed') ||
      code === '28p01'
    ) {
      return 'postgres_auth_failed';
    }
    if (
      message.includes('too many clients') ||
      message.includes('pool') && message.includes('exhaust') ||
      code === '53300'
    ) {
      return 'postgres_pool_exhausted';
    }
    if (
      message.includes('econnrefused') ||
      message.includes('connect') ||
      message.includes('connection terminated') ||
      message.includes('socket') ||
      code === '57p01'
    ) {
      return 'postgres_connect_failed';
    }
    return 'postgres_unavailable';
  }

  emitDegradedWarning(reason) {
    if (this._warningReasons.has(reason)) {
      return;
    }
    console.warn('Brain degraded: Postgres unavailable, using SQLite fallback.');
    this._warningReasons.add(reason);
    this.backendState.warning_emitted = true;
  }

  transitionToDegraded(reason, details = {}) {
    const nextReason = reason || 'postgres_unavailable';
    const changedReason = this.backendState.degraded_reason !== nextReason;

    this.backendState.active_backend = 'sqlite';
    this.backendState.degraded = true;
    this.backendState.degraded_reason = nextReason;
    this.backendState.memory_critical_blocked = false;
    this._lastDegradedDetails = {
      ...details,
      message: details?.message || null,
      at: new Date().toISOString(),
    };

    this.fallbackToSqlite(nextReason, this._lastDegradedDetails);
    if (changedReason || !this._warningReasons.has(nextReason)) {
      this.emitDegradedWarning(nextReason);
    }
  }

  requirePostgres(operationName = 'operation') {
    if (this.backendState.active_backend === 'postgres' && !this.offlineMode && !this._poolClosed) {
      this.backendState.memory_critical_blocked = false;
      return true;
    }

    this.backendState.memory_critical_blocked = true;
    const error = new Error(`Postgres is required for ${operationName}`);
    error.code = 'SECOND_BRAIN_POSTGRES_REQUIRED';
    error.backend_state = this.getBackendState();
    throw error;
  }

  _handlePostgresFailure(err, source) {
    this.transitionToDegraded(this.classifyPostgresFailure(err), {
      message: err?.message || null,
      source,
    });
  }

  async _ensureInitialized() {
    if (this.useSqlite || this.offlineMode || this._poolClosed) {
      return;
    }
    if (!this._initPromise) {
      this._initPromise = (async () => {
        try {
          await this._ensureAuditIndexes();
          await this._initializeProjectIsolation();
          await this._ensureWorkflowMemoryTable();
        } catch (err) {
          console.warn('[SecondBrain] Failed to initialize project isolation:', err.message);
          this.projectIsolationInitialized = false;
        }
      })();
    }
    await this._initPromise;
  }

  async _initializeProjectIsolation() {
    if (this.offlineMode) return;

    // Ensure gsd_local_brain schema exists in Postgres
    if (!this.useSqlite) {
      try {
        await this.pool.query('CREATE SCHEMA IF NOT EXISTS gsd_local_brain');
      } catch (err) {
        // Ignore schema existence errors
      }
    }

    // Ensure project_identity table exists and register this project
    await this._ensureProjectIdentityTable();
    await this._registerProjectIdentity();
  }

  async _ensureProjectIdentityTable() {
    if (this.offlineMode) return;
    if (!this.useSqlite) {
      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS gsd_local_brain.project_identity (
            project_id TEXT PRIMARY KEY,
            project_root TEXT NOT NULL,
            initialized_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn('[SecondBrain] Failed to create project_identity table:', err.message);
        }
      }
    }
    // For SQLite, table created in fallbackToSqlite
  }

  async _registerProjectIdentity() {
    if (this.offlineMode) return;
    const now = new Date().toISOString();
    if (!this.useSqlite) {
      try {
        await this.pool.query(
          `INSERT INTO gsd_local_brain.project_identity (project_id, project_root, initialized_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (project_id) DO UPDATE SET project_root = $2, initialized_at = $3`,
          [this.projectId, this.projectRoot, now]
        );
      } catch (err) {
        console.warn('[SecondBrain] Failed to register project identity:', err.message);
      }
    }
    // For SQLite, handled separately
  }

  fallbackToSqlite(reason = null, details = null) {
    if (this.useSqlite && this.sqliteDb) {
      this.backendState.active_backend = 'sqlite';
      this.backendState.degraded = this.backendState.configured_backend === 'postgres';
      if (reason) {
        this.backendState.degraded_reason = reason;
      }
      if (details) {
        this._lastDegradedDetails = details;
      }
      return;
    }
    if (!DatabaseSync) {
      console.error('[SecondBrain] SQLite fallback requested but node:sqlite not available.');
      this.offlineMode = true;
      return;
    }

    try {
      const dbPath = this._getSqlitePath();
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
          latency_ms INTEGER,
          project_id TEXT
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
        CREATE TABLE IF NOT EXISTS project_identity (
          project_id TEXT PRIMARY KEY,
          project_root TEXT NOT NULL,
          initialized_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS workflow_memory (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          phase TEXT,
          plan TEXT,
          memory_kind TEXT NOT NULL,
          title TEXT NOT NULL,
          body_markdown TEXT NOT NULL,
          source_ref TEXT,
          created_by TEXT NOT NULL,
          importance INTEGER DEFAULT 3,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
        CREATE INDEX IF NOT EXISTS idx_symbols_artifact ON symbols(artifact_id);
        CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_ts ON firecrawl_audit(timestamp);
        CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_url ON firecrawl_audit(url);
        CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_status ON firecrawl_audit(status);
        CREATE INDEX IF NOT EXISTS idx_firecrawl_audit_action ON firecrawl_audit(action);
        CREATE INDEX IF NOT EXISTS idx_schema_registry_domain ON context_schema_registry(domain_pattern);
        CREATE INDEX IF NOT EXISTS idx_workflow_memory_project ON workflow_memory(project_id, phase, plan, memory_kind, created_at);
      `);
      
      this.useSqlite = true;
      this.backendState.active_backend = 'sqlite';
      this.backendState.degraded = this.backendState.configured_backend === 'postgres';
      if (reason) {
        this.backendState.degraded_reason = reason;
      }
      if (details) {
        this._lastDegradedDetails = details;
      }
      this._sqliteOpen = true;
      // Insert project identity for SQLite
      try {
        this.sqliteDb.prepare(`
          INSERT OR REPLACE INTO project_identity (project_id, project_root, initialized_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
        `).run(this.projectId, this.projectRoot);
      } catch (err) {
        console.error('[SecondBrain] Failed to register project identity in SQLite:', err.message);
      }
    } catch (err) {
      console.error('[SecondBrain] Failed to initialize SQLite fallback:', err.message);
      this.offlineMode = true;
    }
  }

  async recordFirecrawlAudit(audit) {
    if (this.offlineMode) return;
    await this._ensureInitialized();

    if (!this.useSqlite) {
      try {
        await this.pool.query(
          'INSERT INTO gsd_local_brain.firecrawl_audit (action, url, schema_json, status, latency_ms, project_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [audit.action, audit.url || null, audit.schema_json || null, audit.status, audit.latency_ms || null, this.projectId]
        );
        return;
      } catch (err) {
        this._handlePostgresFailure(err, 'recordFirecrawlAudit');
        // Do NOT return here; fall through to SQLite path to record this specific event.
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(`
          INSERT INTO firecrawl_audit (action, url, schema_json, status, latency_ms, project_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(audit.action, audit.url || null, audit.schema_json || null, audit.status, audit.latency_ms || null, this.projectId);
      } catch (err) {
        console.error('[SecondBrain] Failed to record Firecrawl audit in SQLite:', err.message);
      }
    }
  }

  async _ensureWorkflowMemoryTable() {
    if (this.offlineMode || this.useSqlite) {
      return;
    }

    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS gsd_local_brain.workflow_memory (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          phase TEXT,
          plan TEXT,
          memory_kind TEXT NOT NULL,
          title TEXT NOT NULL,
          body_markdown TEXT NOT NULL,
          source_ref TEXT,
          created_by TEXT NOT NULL,
          importance INTEGER DEFAULT 3,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_workflow_memory_project
        ON gsd_local_brain.workflow_memory (project_id, phase, plan, memory_kind, created_at DESC)
      `);
    } catch (err) {
      this._handlePostgresFailure(err, '_ensureWorkflowMemoryTable');
    }
  }

  _normalizeWorkflowMemoryEntry(entry = {}) {
    const now = new Date().toISOString();
    return {
      id: entry.id || crypto.randomUUID(),
      project_id: entry.project_id || this.projectId,
      phase: entry.phase || null,
      plan: entry.plan || null,
      memory_kind: entry.memory_kind,
      title: entry.title,
      body_markdown: entry.body_markdown,
      source_ref: entry.source_ref || null,
      created_by: entry.created_by || 'unknown',
      importance: Number.isFinite(Number(entry.importance)) ? Number(entry.importance) : 3,
      created_at: entry.created_at || now,
    };
  }

  async upsertWorkflowMemory(entry) {
    if (this.offlineMode) {
      throw new Error('Second Brain is offline');
    }
    await this._ensureInitialized();

    const normalized = this._normalizeWorkflowMemoryEntry(entry);

    if (!normalized.memory_kind || !normalized.title || !normalized.body_markdown) {
      throw new Error('workflow memory entry requires memory_kind, title, and body_markdown');
    }

    if (!this.useSqlite) {
      try {
        await this._ensureWorkflowMemoryTable();
        await this.pool.query(
          `INSERT INTO gsd_local_brain.workflow_memory
             (id, project_id, phase, plan, memory_kind, title, body_markdown, source_ref, created_by, importance, created_at)
           VALUES
             ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             phase = EXCLUDED.phase,
             plan = EXCLUDED.plan,
             memory_kind = EXCLUDED.memory_kind,
             title = EXCLUDED.title,
             body_markdown = EXCLUDED.body_markdown,
             source_ref = EXCLUDED.source_ref,
             created_by = EXCLUDED.created_by,
             importance = EXCLUDED.importance,
             created_at = EXCLUDED.created_at`,
          [
            normalized.id,
            normalized.project_id,
            normalized.phase,
            normalized.plan,
            normalized.memory_kind,
            normalized.title,
            normalized.body_markdown,
            normalized.source_ref,
            normalized.created_by,
            normalized.importance,
            normalized.created_at,
          ]
        );
        return normalized;
      } catch (err) {
        this._handlePostgresFailure(err, 'upsertWorkflowMemory');
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      this.sqliteDb.prepare(`
        INSERT INTO workflow_memory
          (id, project_id, phase, plan, memory_kind, title, body_markdown, source_ref, created_by, importance, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          phase = excluded.phase,
          plan = excluded.plan,
          memory_kind = excluded.memory_kind,
          title = excluded.title,
          body_markdown = excluded.body_markdown,
          source_ref = excluded.source_ref,
          created_by = excluded.created_by,
          importance = excluded.importance,
          created_at = excluded.created_at
      `).run(
        normalized.id,
        normalized.project_id,
        normalized.phase,
        normalized.plan,
        normalized.memory_kind,
        normalized.title,
        normalized.body_markdown,
        normalized.source_ref,
        normalized.created_by,
        normalized.importance,
        normalized.created_at
      );
      return normalized;
    }

    throw new Error('workflow memory storage is unavailable');
  }

  async listWorkflowMemory(filters = {}) {
    if (this.offlineMode) {
      return [];
    }
    await this._ensureInitialized();

    const normalizedFilters = {
      project_id: filters.project_id || this.projectId,
      phase: filters.phase || null,
      plan: filters.plan || null,
      memory_kind: filters.memory_kind || null,
      limit: Number.isFinite(Number(filters.limit)) ? Number(filters.limit) : 20,
    };

    const selectColumns = 'id, project_id, phase, plan, memory_kind, title, body_markdown, source_ref, created_by, importance, created_at';

    if (!this.useSqlite) {
      const conditions = ['project_id = $1'];
      const params = [normalizedFilters.project_id];

      if (normalizedFilters.phase) {
        params.push(normalizedFilters.phase);
        conditions.push(`phase = $${params.length}`);
      }
      if (normalizedFilters.plan) {
        params.push(normalizedFilters.plan);
        conditions.push(`plan = $${params.length}`);
      }
      if (normalizedFilters.memory_kind) {
        params.push(normalizedFilters.memory_kind);
        conditions.push(`memory_kind = $${params.length}`);
      }
      params.push(normalizedFilters.limit);

      try {
        await this._ensureWorkflowMemoryTable();
        const result = await this.pool.query(
          `SELECT ${selectColumns}
           FROM gsd_local_brain.workflow_memory
           WHERE ${conditions.join(' AND ')}
           ORDER BY created_at DESC
           LIMIT $${params.length}`,
          params
        );
        return result.rows;
      } catch (err) {
        this._handlePostgresFailure(err, 'listWorkflowMemory');
      }
    }

    if (this.useSqlite && this.sqliteDb) {
      const conditions = ['project_id = ?'];
      const params = [normalizedFilters.project_id];

      if (normalizedFilters.phase) {
        conditions.push('phase = ?');
        params.push(normalizedFilters.phase);
      }
      if (normalizedFilters.plan) {
        conditions.push('plan = ?');
        params.push(normalizedFilters.plan);
      }
      if (normalizedFilters.memory_kind) {
        conditions.push('memory_kind = ?');
        params.push(normalizedFilters.memory_kind);
      }
      params.push(normalizedFilters.limit);

      return this.sqliteDb.prepare(
        `SELECT ${selectColumns}
         FROM workflow_memory
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(...params);
    }

    return [];
  }

  _blockedModelFacingMemoryResult(operationName, err) {
    return {
      available: false,
      blocked: true,
      reason: 'postgres_required',
      operation: operationName,
      message: err.message,
      backend_state: err.backend_state || this.getBackendState(),
    };
  }

  async readModelFacingMemory(filters = {}) {
    try {
      this.requirePostgres('model-facing memory read');
      const items = await this.listWorkflowMemory(filters);
      return {
        available: true,
        blocked: false,
        items,
        backend_state: this.getBackendState(),
      };
    } catch (err) {
      if (err.code === 'SECOND_BRAIN_POSTGRES_REQUIRED') {
        return this._blockedModelFacingMemoryResult('read', err);
      }
      throw err;
    }
  }

  async writeModelFacingMemoryCheckpoint(entry = {}) {
    const allowedKinds = new Set(['checkpoint', 'summary', 'decision', 'pitfall', 'resolution']);

    try {
      this.requirePostgres('model-facing memory write');
      if (!allowedKinds.has(entry.memory_kind)) {
        throw new Error(`model-facing memory writes only allow ${Array.from(allowedKinds).join(', ')}`);
      }

      const saved = await this.upsertWorkflowMemory(entry);
      return {
        available: true,
        blocked: false,
        item: saved,
        backend_state: this.getBackendState(),
      };
    } catch (err) {
      if (err.code === 'SECOND_BRAIN_POSTGRES_REQUIRED') {
        return this._blockedModelFacingMemoryResult('write', err);
      }
      throw err;
    }
  }

  async writeModelFacingMemorySummary(entry = {}) {
    return this.writeModelFacingMemoryCheckpoint({
      ...entry,
      memory_kind: 'summary',
    });
  }

  /**
   * Create a new access grant.
   */
  async createGrant(pattern, type, ttlSeconds = null) {
    if (this.offlineMode) return;
    await this._ensureInitialized();

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
        this._handlePostgresFailure(err, 'createGrant');
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
    await this._ensureInitialized();

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
        this._handlePostgresFailure(err, 'revokeGrant');
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
    await this._ensureInitialized();

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          "SELECT * FROM gsd_local_brain.grants WHERE status = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)"
        );
        return res.rows;
      } catch (err) {
        this._handlePostgresFailure(err, 'listGrants');
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
    if (this.offlineMode || (this.useSqlite && !this.sqliteDb)) {
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
    await this._ensureInitialized();

    const { from, to, domain, status, action, actionPrefix } = filters;
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
    if (actionPrefix) {
      conditions.push('action LIKE $' + (params.length + 1));
      params.push(`${actionPrefix}%`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limit);

    if (!this.useSqlite) {
      try {
        const query = `SELECT * FROM gsd_local_brain.firecrawl_audit ${whereClause} ORDER BY timestamp DESC LIMIT $${params.length}`;
        const res = await this.pool.query(query, params);
        return res.rows;
      } catch (err) {
        this._handlePostgresFailure(err, 'getFirecrawlAudit');
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
        if (actionPrefix) {
          sqliteConditions.push('action LIKE ?');
          sqliteParams.push(`${actionPrefix}%`);
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
   * Get recent audit entries from both firecrawl_audit and integrity_log.jsonl.
   * @param {string} cwd - Project root path
   * @param {number} limit - Max entries to return (default 50)
   * @param {number} sinceMinutes - Only entries newer than this many minutes (default 60)
   * @returns {Array} Sorted by timestamp descending
   */
  async getRecentAudits(cwd, limit = 50, sinceMinutes = 60) {
    const cutoff = sinceMinutes ? new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString() : null;

    // Get firecrawl_audit entries
    const filters = {};
    if (cutoff) filters.from = cutoff;
    const firecrawlRows = await this.getFirecrawlAudit(limit, filters);

    const firecrawlEntries = firecrawlRows.map(row => ({
      source: 'firecrawl',
      timestamp: row.timestamp,
      action: row.action,
      details: `url=${row.url || ''} status=${row.status || ''}`,
      level: this._mapStatusToLevel(row.status),
      raw: row
    }));

    // Get integrity_log entries
    const integrityLogPath = path.join(cwd, '.planning', 'integrity_log.jsonl');
    let integrityEntries = [];
    try {
      if (safeFs.existsSync(integrityLogPath)) {
        const content = safeFs.readFileSync(integrityLogPath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (cutoff && entry.timestamp && new Date(entry.timestamp) < new Date(cutoff)) continue;
            integrityEntries.push({
              source: 'integrity',
              timestamp: entry.timestamp,
              action: entry.action || 'log',
              details: `files=${(entry.files || []).join(',')}`,
              level: 'info',
              raw: entry
            });
          } catch (e) {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      // ignore read errors
    }

    // Merge and sort
    const merged = [...firecrawlEntries, ...integrityEntries].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    return merged.slice(0, limit);
  }

  _mapStatusToLevel(status) {
    if (!status) return 'info';
    const s = status.toLowerCase();
    if (s === 'error' || s === 'denied' || s === 'blocked') return 'error';
    if (s === 'note') return 'warn';
    return 'info';
  }

  /**
   * Clean up old audit records based on retention policy.
   * @param {number} retentionDays - Number of days to retain (default 90)
   * @returns {number} Number of rows deleted
   */
  async cleanupOldAudits(retentionDays = 90) {
    if (this.offlineMode) return 0;
    await this._ensureInitialized();

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
        this._handlePostgresFailure(err, 'cleanupOldAudits');
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
    await this._ensureInitialized();

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
        this._handlePostgresFailure(err, 'getFirecrawlHealthSummary');
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

  async getPlaneAudit(limit = 20, filters = {}) {
    return this.getFirecrawlAudit(limit, { ...filters, actionPrefix: 'plane-' });
  }

  async getPlaneHealthSummary(periodMinutes = 60) {
    if (this.offlineMode) {
      return {
        generated_at: new Date().toISOString(),
        period_minutes: periodMinutes,
        recent_outbound_total: 0,
        recent_outbound_errors: 0,
        recent_error_rate: 0,
        last_webhook_received_at: null,
        top_failing_actions: [],
        latency_by_action: [],
        breaker_basis: {
          consecutive_errors: 0,
          last_error_at: null,
          last_success_at: null,
        },
      };
    }

    const cutoffDate = new Date(Date.now() - periodMinutes * 60 * 1000).toISOString();
    const rows = await this.getPlaneAudit(500, { from: cutoffDate });
    const outboundRows = rows.filter((row) => !String(row.action || '').startsWith('plane-webhook'));
    const webhookRows = rows.filter((row) => String(row.action || '').startsWith('plane-webhook'));
    const errorStatuses = new Set(['error', 'blocked', 'denied', 'failed']);

    let consecutiveErrors = 0;
    let lastErrorAt = null;
    let lastSuccessAt = null;
    const sortedOutbound = [...outboundRows].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    for (const row of sortedOutbound) {
      const status = String(row.status || '').toLowerCase();
      if (lastErrorAt === null && errorStatuses.has(status)) {
        lastErrorAt = row.timestamp || null;
      }
      if (lastSuccessAt === null && status === 'success') {
        lastSuccessAt = row.timestamp || null;
      }
      if (errorStatuses.has(status)) {
        consecutiveErrors += 1;
      } else if (status === 'success') {
        break;
      }
    }

    const actionCounts = new Map();
    const actionLatencies = new Map();
    for (const row of outboundRows) {
      const actionName = row.action || 'plane-unknown';
      if (!actionCounts.has(actionName)) {
        actionCounts.set(actionName, { action: actionName, total: 0, errors: 0 });
      }
      const countEntry = actionCounts.get(actionName);
      countEntry.total += 1;
      if (errorStatuses.has(String(row.status || '').toLowerCase())) {
        countEntry.errors += 1;
      }

      if (row.latency_ms !== null && row.latency_ms !== undefined) {
        if (!actionLatencies.has(actionName)) {
          actionLatencies.set(actionName, { total_latency: 0, count: 0 });
        }
        const latencyEntry = actionLatencies.get(actionName);
        latencyEntry.total_latency += Number(row.latency_ms) || 0;
        latencyEntry.count += 1;
      }
    }

    const topFailingActions = Array.from(actionCounts.values())
      .filter((entry) => entry.errors > 0)
      .sort((a, b) => b.errors - a.errors || b.total - a.total)
      .slice(0, 5);

    const latencyByAction = Array.from(actionLatencies.entries())
      .map(([actionName, value]) => ({
        action: actionName,
        avg_latency: value.count > 0 ? Math.round(value.total_latency / value.count) : 0,
      }))
      .sort((a, b) => b.avg_latency - a.avg_latency);

    const lastWebhookReceivedAt = webhookRows
      .map((row) => row.timestamp || null)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;

    const recentOutboundErrors = outboundRows.filter((row) => errorStatuses.has(String(row.status || '').toLowerCase())).length;
    const recentOutboundTotal = outboundRows.length;

    return {
      generated_at: new Date().toISOString(),
      period_minutes: periodMinutes,
      recent_outbound_total: recentOutboundTotal,
      recent_outbound_errors: recentOutboundErrors,
      recent_error_rate: recentOutboundTotal > 0 ? recentOutboundErrors / recentOutboundTotal : 0,
      last_webhook_received_at: lastWebhookReceivedAt,
      top_failing_actions: topFailingActions,
      latency_by_action: latencyByAction,
      breaker_basis: {
        consecutive_errors: consecutiveErrors,
        last_error_at: lastErrorAt,
        last_success_at: lastSuccessAt,
      },
    };
  }

  /**
   * Upsert an artifact and its analysis results.
   */
  async ingestArtifact(artifact) {
    if (this.offlineMode) return;
    await this._ensureInitialized();

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
        this._handlePostgresFailure(err, 'ingestArtifact');
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
    await this._ensureInitialized();

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          'SELECT id, source_uri, type, normalized_at FROM gsd_local_brain.artifacts ORDER BY normalized_at DESC LIMIT $1',
          [limit]
        );
        return res.rows;
      } catch (err) {
        this._handlePostgresFailure(err, 'listArtifacts');
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
    await this._ensureInitialized();

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          'SELECT s.*, a.source_uri FROM gsd_local_brain.symbols s JOIN gsd_local_brain.artifacts a ON s.artifact_id = a.id WHERE s.name = $1',
          [name]
        );
        return res.rows;
      } catch (err) {
        this._handlePostgresFailure(err, 'searchArtifacts');
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
        // Ensure gsd_local_brain schema exists
        await this.pool.query('CREATE SCHEMA IF NOT EXISTS gsd_local_brain');

        // Add project_id column to firecrawl_audit if not exists
        await this.pool.query('ALTER TABLE gsd_local_brain.firecrawl_audit ADD COLUMN IF NOT EXISTS project_id TEXT');

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
    await this._ensureInitialized();
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
        this._handlePostgresFailure(err, 'registerContextSchema');
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
    await this._ensureInitialized();

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
        this._handlePostgresFailure(err, 'lookupContextSchema');
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
    await this._ensureInitialized();

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
        this._handlePostgresFailure(err, 'listContextSchemas');
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
    await this._ensureInitialized();
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
    await this._ensureInitialized();

    const thresholdDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    if (!this.useSqlite) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM gsd_local_brain.context_schema_registry WHERE active = true AND (last_successful_extraction IS NULL OR last_successful_extraction < $1) ORDER BY created_at DESC`,
          [thresholdDate]
        );
        return res.rows;
      } catch (err) {
        this._handlePostgresFailure(err, 'getStaleSchemas');
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

  _mapFirecrawlStatusToLevel(status) {
    if (status === 'error' || status === 'denied') return 'error';
    if (status === 'blocked' || status === 'note') return 'warn';
    if (status === 'success') return 'info';
    return 'debug';
  }

  async getRecentAudits(limit = 50, sinceMinutes = 60) {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

    // Get firecrawl audit entries
    const firecrawlRaw = await this.getFirecrawlAudit(limit * 2, { from: since });

    // Transform to unified format
    const firecrawl = firecrawlRaw.map(entry => ({
      timestamp: entry.timestamp,
      level: this._mapFirecrawlStatusToLevel(entry.status),
      message: `${entry.action}${entry.url ? ' ' + entry.url : ''}`.trim(),
      source: 'firecrawl',
      details: { action: entry.action, url: entry.url, status: entry.status, latency_ms: entry.latency_ms }
    }));

    // Get integrity log entries
    let integrity = [];
    try {
      const logPath = path.join(process.cwd(), '.planning', 'integrity_log.jsonl');
      if (safeFs.existsSync(logPath)) {
        const content = safeFs.readFileSync(logPath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        integrity = lines.map(l => JSON.parse(l))
          .filter(e => e.timestamp >= since)
          .map(e => {
            let level = 'info';
            if (e.type) {
              const t = e.type.toLowerCase();
              if (t.includes('error')) level = 'error';
              else if (t.includes('warn')) level = 'warn';
              else if (t.includes('info')) level = 'info';
              else level = 'debug';
            }
            return {
              timestamp: e.timestamp,
              level,
              message: e.message,
              source: 'integrity',
              details: e.details || null
            };
          });
      }
    } catch (err) {
      // ignore
    }

    const merged = [...firecrawl, ...integrity];
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return merged.slice(0, limit);
  }

  async close() {
    this._initPromise = null;
    if (this.pool && !this._poolClosed) {
      const poolToClose = this.pool;
      this._poolClosed = true;
      try {
        if (typeof poolToClose.end === 'function') {
          await poolToClose.end();
        }
      } catch (err) {
        if (!String(err?.message || '').includes('calling end')) {
          throw err;
        }
      }
    }

    if (this.sqliteDb && (this._sqliteOpen || typeof this.sqliteDb.close === 'function')) {
      const sqliteToClose = this.sqliteDb;
      this.sqliteDb = null;
      this._sqliteOpen = false;
      sqliteToClose.close();
    }
  }

  async resetForTests() {
    await this.close();
    this._warningReasons.clear();
    this._lastDegradedDetails = null;
    this._initPromise = null;
    this._initializeState();
    this._refreshConfig();
    this._createPool();
  }
}

module.exports = new SecondBrain();
