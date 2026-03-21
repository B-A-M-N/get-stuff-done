const { Pool } = require('pg');
const broker = require('./broker.cjs');

/**
 * Second Brain for relational memory storage using Postgres.
 */
class SecondBrain {
  constructor() {
    const config = {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE || 'gsd_local_brain',
      connectionTimeoutMillis: 5000, // 5s timeout
    };

    if (process.env.PGUSER) config.user = String(process.env.PGUSER);
    const pgPass = process.env.PGPASSWORD;
    if (pgPass && String(pgPass).length > 0) {
      config.password = String(pgPass);
    } else {
      delete config.password; // Explicitly remove to avoid 'must be a string' errors from pg
    }
    if (process.env.DATABASE_URL) config.connectionString = String(process.env.DATABASE_URL);

    this.pool = new Pool(config);

    this.offlineMode = false;

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      this.offlineMode = true;
    });
  }

  /**
   * Upsert an artifact and its analysis results.
   */
  async ingestArtifact(artifact) {
    if (this.offlineMode) {
      console.warn(`[SecondBrain] Skipping ingest for ${artifact.id} (Offline Mode)`);
      return;
    }

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
      
      const contentHash = artifact.content_hash;

      await client.query(upsertArtifactQuery, [
        artifact.id,
        artifact.source_uri,
        contentHash,
        artifact.type,
        artifact.content_markdown
      ]);

      if (artifact.analysis) {
        // Delete old symbols and dependencies for this artifact
        await client.query('DELETE FROM gsd_local_brain.symbols WHERE artifact_id = $1', [artifact.id]);
        await client.query('DELETE FROM gsd_local_brain.dependencies WHERE artifact_id = $1', [artifact.id]);

        // Insert new symbols
        if (artifact.analysis.symbols && Array.isArray(artifact.analysis.symbols)) {
          for (const symbol of artifact.analysis.symbols) {
            await client.query(
              'INSERT INTO gsd_local_brain.symbols (artifact_id, name, kind, line) VALUES ($1, $2, $3, $4)',
              [artifact.id, symbol.name, symbol.kind, symbol.line]
            );

            // Emit pulse event for each symbol
            await broker.publish('symbol.ingested', {
              artifactId: artifact.id,
              symbolName: symbol.name,
              symbolKind: symbol.kind,
              line: symbol.line
            });
          }
        }

        // Insert new dependencies
        if (artifact.analysis.dependencies && Array.isArray(artifact.analysis.dependencies)) {
          for (const dep of artifact.analysis.dependencies) {
            await client.query(
              'INSERT INTO gsd_local_brain.dependencies (artifact_id, dependency_uri) VALUES ($1, $2)',
              [artifact.id, dep]
            );
          }
        }
      }

      await client.query('COMMIT');
      console.log(`[SecondBrain] Ingested artifact: ${artifact.id}`);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error(`[SecondBrain] Failed to ingest artifact ${artifact.id}: ${err.message}`);
      // Don't throw, just log. Allow workflow to continue.
      this.offlineMode = true; // Mark as offline for subsequent calls
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Search for symbols by name.
   */
  async findSymbols(name) {
    if (this.offlineMode) return [];
    try {
      const res = await this.pool.query(
        `SELECT s.*, a.source_uri 
         FROM gsd_local_brain.symbols s
         JOIN gsd_local_brain.artifacts a ON s.artifact_id = a.id
         WHERE s.name = $1`,
        [name]
      );
      return res.rows;
    } catch (err) {
      console.error(`[SecondBrain] Failed to find symbols: ${err.message}`);
      return [];
    }
  }

  /**
   * Close connection pool gracefully.
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = new SecondBrain();
