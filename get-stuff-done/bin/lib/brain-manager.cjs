const http = require('http');
const path = require('path');
const secondBrain = require('./second-brain.cjs');
const broker = require('./broker.cjs');

/**
 * Manages the lifecycle and health of the GSD Second Brain infrastructure.
 */
class BrainManager {
  constructor() {
    this.planningPort = process.env.GSD_PLANNING_PORT || 3011;
  }

  /**
   * Checks the health of all Second Brain components.
   * @returns {Promise<Object>} Health status of each component.
   */
  async checkHealth() {
    const status = {
      postgres: 'unknown',
      rabbitmq: 'unknown',
      planningServer: 'unknown',
      allOk: false
    };

    // 1. Check Postgres
    try {
      const client = await secondBrain.pool.connect();
      await client.query('SELECT 1');
      client.release();
      status.postgres = 'ok';
    } catch (err) {
      status.postgres = `error: ${err.message}`;
    }

    // 2. Check RabbitMQ
    try {
      // If already connected, great. If not, try connecting (broker handles retries internally)
      if (!broker.isConnected) {
        // We use a short timeout/retry for health check to avoid blocking too long
        await broker.connect(1); 
      }
      status.rabbitmq = broker.isConnected ? 'ok' : 'disconnected';
    } catch (err) {
      status.rabbitmq = `error: ${err.message}`;
    }

    // 3. Check Planning Server
    status.planningServer = await this._checkPlanningServer();

    status.allOk = status.postgres === 'ok' && 
                   status.rabbitmq === 'ok' && 
                   status.planningServer === 'ok';

    return status;
  }

  /**
   * Pings the planning server's health endpoint.
   * @private
   */
  _checkPlanningServer() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: this.planningPort,
        path: '/health',
        method: 'GET',
        timeout: 2000
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
