const http = require('http');
const secondBrain = require('./second-brain.cjs');
const broker = require('./broker.cjs');

class BrainManager {
  constructor() {
    this.planningPort = process.env.GSD_PLANNING_PORT || 3011;
  }

  getStatus() {
    const backend = secondBrain.getBackendState();
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
      allOk: false,
    };

    if (options.requirePostgres) {
      try {
        secondBrain.requirePostgres('brain health');
      } catch (err) {
        health.memory_critical_blocked = true;
        health.postgres = {
          status: 'blocked',
          detail: err.message,
        };
      }
    }

    health.allOk =
      health.postgres.status === 'ok' &&
      health.rabbitmq.status === 'ok' &&
      health.planningServer.status === 'ok' &&
      health.memory_critical_blocked === false;

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
    if (backend.active_backend === 'postgres' && backend.degraded === false) {
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
      return { status: 'error', detail: err.message };
    }
  }

  async _checkRabbitMq() {
    try {
      if (!broker.isConnected) {
        await broker.connect(1);
      }
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
