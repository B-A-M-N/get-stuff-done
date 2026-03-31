const http = require('http');
const secondBrain = require('./second-brain.cjs');
const broker = require('./broker.cjs');
const driftEngine = require('./drift-engine.cjs');
const degradedMode = require('./degraded-mode.cjs');

class BrainManager {
  constructor() {
    this.planningPort = process.env.GSD_PLANNING_PORT || 3011;
  }

  async getStatus() {
    const backend = await this._resolveBackendState('brain_status_probe');
    return {
      ...this._pickBackendState(backend),
      model_facing_memory: this._getModelFacingMemoryStatus(backend),
    };
  }

  async checkHealth(options = {}) {
    const backend = secondBrain.getBackendState();
    const health = {
      ...this._pickBackendState(backend),
      model_facing_memory: this._getModelFacingMemoryStatus(backend),
      postgres: await this._checkPostgres(backend, options),
      rabbitmq: await this._checkRabbitMq(),
      planningServer: await this._checkPlanningServerDetailed(),
      runbook: backend.degraded
        ? 'Postgres is unavailable; SQLite fallback is active. Run `node get-stuff-done/bin/gsd-tools.cjs brain health --raw` for detailed diagnostics.'
        : null,
      drift: driftEngine.getHealthSnapshot(options.cwd || process.cwd(), options),
      allOk: false,
    };

    const refreshedBackend = secondBrain.getBackendState();
    Object.assign(health, this._pickBackendState(refreshedBackend));
    health.model_facing_memory = this._getModelFacingMemoryStatus(refreshedBackend);
    health.runbook = refreshedBackend.degraded
      ? 'Postgres is unavailable; SQLite fallback is active. Run `node get-stuff-done/bin/gsd-tools.cjs brain health --raw` for detailed diagnostics.'
      : null;

    if (options.requirePostgres) {
      if (health.postgres.status !== 'ok') {
        const blockedDetail = health.postgres.detail || 'Postgres is required for brain health';
        health.memory_critical_blocked = true;
        health.postgres = {
          status: 'blocked',
          detail: blockedDetail.includes('Postgres is required')
            ? blockedDetail
            : `Postgres is required for brain health: ${blockedDetail}`,
        };
      }
    }

    const degradedSnapshot = await degradedMode.buildDegradedState(options.cwd || process.cwd(), {
      now: options.now,
      staleAfterMs: options.staleAfterMs,
      diagnosticOnly: true,
      backendState: refreshedBackend,
      liveHealth: {
        planningServer: health.planningServer,
      },
      driftState: health.drift && health.drift.status ? health.drift : undefined,
    });
    degradedMode.writeLatestDegradedState(options.cwd || process.cwd(), degradedSnapshot);
    health.degraded_mode = degradedSnapshot;

    health.allOk =
      health.postgres.status === 'ok' &&
      health.rabbitmq.status === 'ok' &&
      health.planningServer.status === 'ok' &&
      health.memory_critical_blocked === false &&
      degradedSnapshot.aggregate_state !== 'UNSAFE';

    return health;
  }

  _pickBackendState(backend) {
    return {
      configured_backend: backend.configured_backend,
      active_backend: backend.active_backend,
      degraded: backend.degraded,
      degraded_reason: backend.degraded_reason,
      warning_emitted: backend.warning_emitted,
      memory_critical_blocked: backend.memory_critical_blocked,
    };
  }

  _getModelFacingMemoryStatus(backend) {
    if (backend.active_backend === 'postgres' && !backend.degraded) {
      return {
        available: true,
        status: 'ok',
        detail: null,
      };
    }

    return {
      available: false,
      status: 'blocked',
      detail: 'Model-facing memory is unavailable while degraded. Postgres-backed memory required.',
    };
  }

  async _resolveBackendState(source = 'brain_status_probe') {
    const backend = secondBrain.getBackendState();
    if (backend.active_backend !== 'postgres' || backend.degraded) {
      return backend;
    }

    try {
      const client = await secondBrain.pool.connect();
      client.release();
    } catch (err) {
      secondBrain.transitionToDegraded(secondBrain.classifyPostgresFailure(err), {
        message: err.message,
        source,
      });
    }

    return secondBrain.getBackendState();
  }

  async _checkPostgres(backend, options = {}) {
    if (options.requirePostgres) {
      try {
        secondBrain.requirePostgres('brain health');
      } catch (err) {
        return { status: 'blocked', detail: err.message };
      }
    }

    if (backend.active_backend !== 'postgres') {
      return {
        status: 'degraded',
        detail: backend.degraded_details?.message || backend.degraded_reason || 'sqlite fallback active',
      };
    }

    try {
      const client = await secondBrain.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return { status: 'ok', detail: null };
    } catch (err) {
      secondBrain.transitionToDegraded(secondBrain.classifyPostgresFailure(err), {
        message: err.message,
        source: 'brain_health_probe',
      });
      return { status: 'error', detail: err.message };
    }
  }

  async _checkRabbitMq() {
    try {
      return {
        status: broker.isConnected ? 'ok' : 'disconnected',
        detail: broker.isConnected ? null : 'broker disconnected',
      };
    } catch (err) {
      return { status: 'error', detail: err.message };
    }
  }

  async _checkPlanningServerDetailed() {
    const status = await this._checkPlanningServer();
    return status === 'ok'
      ? { status: 'ok', detail: null }
      : { status: 'error', detail: status };
  }

  _checkPlanningServer() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: this.planningPort,
        path: '/health',
        method: 'GET',
        timeout: 2000,
      };

      const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve('ok');
        } else {
          resolve(`error: status ${res.statusCode}`);
        }
      });

      req.on('error', (err) => {
        resolve(`error: ${err.message}`);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve('error: timeout');
      });

      req.end();
    });
  }
}

module.exports = new BrainManager();

// GSD-AUTHORITY: 80.1-01-1:0fc4c1c7aa1a246b3af245238e627b66c32af2eeca8233e902a6456d94bf6e6d
