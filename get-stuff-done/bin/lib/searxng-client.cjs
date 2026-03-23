/**
 * SearXNG Client — Integrated search for the control plane.
 *
 * Provides structured access to a local SearXNG instance while enforcing
 * audit logging for StrongDM-style visibility.
 */

const https = require('https');
const secondBrain = require('./second-brain.cjs');
const policy = require('./policy.cjs');

class SearxngClient {
  constructor() {
    this.url = process.env.GSD_SEARXNG_URL || 'http://localhost:8080';
  }

  /**
   * Internal helper for HTTPS GET requests with timeout.
   */
  async _get(url, timeout = 5000) {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Invalid JSON: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });

      req.end();
    });
  }

  /**
   * Perform a search query and log audit.
   */
  async search(query) {
    const start = Date.now();
    let status = 'success';
    let result = null;

    try {
      // 1. Policy check (optional: search queries could be restricted)
      const isGranted = await policy.checkAccessGrant('search:searxng');
      if (!isGranted) {
        status = 'blocked';
        throw new Error('Access Denied: Search not authorized in policy.');
      }

      const searchUrl = `${this.url}/search?q=${encodeURIComponent(query)}&format=json`;
      result = await this._get(searchUrl, 10000);
    } catch (err) {
      status = err.message.includes('Access Denied') ? 'denied' : 'error';
      throw err;
    } finally {
      const latency = Date.now() - start;
      await secondBrain.recordFirecrawlAudit({
        action: 'searxng-search',
        url: `query:${query}`,
        status,
        latency_ms: latency
      });
    }

    return result;
  }

  /**
   * Health check.
   */
  async check() {
    try {
      await this._get(this.url + '/', 3000);
      return { available: true, url: this.url };
    } catch (err) {
      return { available: false, url: this.url };
    }
  }
}

module.exports = new SearxngClient();
