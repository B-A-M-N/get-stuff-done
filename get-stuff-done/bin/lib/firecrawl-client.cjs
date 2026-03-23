/**
 * Firecrawl Client — Centralized bridge for Firecrawl API access.
 *
 * Provides structured access to Firecrawl's scrape, search, extract, and map
 * endpoints, while enforcing audit logging for StrongDM-style visibility.
 */

const { execSync } = require('child_process');
const secondBrain = require('./second-brain.cjs');
const policy = require('./policy.cjs');

class FirecrawlClient {
  constructor() {
    this.apiUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';
    this.apiKey = process.env.FIRECRAWL_API_KEY || 'local';
    this.rateLimitBuckets = new Map();
  }

  /**
   * Internal helper to perform API requests and log audits.
   */
  async _request(action, endpoint, body = null) {
    const start = Date.now();
    let status = 'success';
    let result = null;

    // Rate limiting (per-hostname token bucket)
    if (body && body.url) {
      let hostname;
      try {
        hostname = new URL(body.url).hostname;
      } catch (e) {
        hostname = null;
      }
      if (hostname) {
        const now = Date.now();
        const rpm = process.env.FIRECRAWL_RATE_LIMIT_RPM ? parseInt(process.env.FIRECRAWL_RATE_LIMIT_RPM, 10) : 60;
        const capacity = rpm;
        const refillRate = rpm / 60; // tokens per second
        let bucket = this.rateLimitBuckets.get(hostname);
        if (!bucket) {
          bucket = { tokens: capacity, lastRefill: now };
        } else {
          const elapsedSec = (now - bucket.lastRefill) / 1000;
          const added = elapsedSec * refillRate;
          bucket.tokens = Math.min(capacity, bucket.tokens + added);
          bucket.lastRefill = now;
        }
        if (bucket.tokens < 1) {
          const deficit = 1 - bucket.tokens;
          const retryAfterSec = Math.ceil(deficit / refillRate);
          throw new Error(`Rate limit exceeded for host ${hostname}. Retry after ~${retryAfterSec} seconds.`);
        }
        bucket.tokens -= 1;
        this.rateLimitBuckets.set(hostname, bucket);
      }
    }

    // 1. Policy Enforcement
    if (body && body.url) {
      const isGranted = await policy.checkAccessGrant(body.url);
      if (!isGranted) {
        status = 'blocked';
        await secondBrain.recordFirecrawlAudit({
          action,
          url: body.url,
          status: 'denied',
          latency_ms: 0
        });
        throw new Error(`Access Denied: No active grant for resource "${body.url}". Use 'gsd-tools firecrawl grant --url <pattern>' to authorize.`);
      }
    }

    try {
      const url = `${this.apiUrl}/v1/${endpoint}`;
      const curlCmd = `curl -sf -X POST "${url}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${this.apiKey}" \
        ${body ? `-d '${JSON.stringify(body)}'` : ''}`;

      const response = execSync(curlCmd, { timeout: 30000 });
      result = JSON.parse(response.toString());
    } catch (err) {
      status = 'error';
      errorMsg = err.message;
      throw err;
    } finally {
      const latency = Date.now() - start;
      await secondBrain.recordFirecrawlAudit({
        action,
        url: body ? body.url : null,
        schema_json: body && body.schema ? JSON.stringify(body.schema) : null,
        status,
        latency_ms: latency
      });
    }

    return result;
  }

  /**
   * Scrape a single URL.
   */
  async scrape(url) {
    return this._request('scrape', 'scrape', { url });
  }

  /**
   * Search the web for structured results.
   */
  async search(query) {
    return this._request('search', 'search', { query });
  }

  /**
   * Extract structured data from a URL using a schema.
   */
  async extract(url, schema) {
    return this._request('extract', 'extract', { url, schema });
  }

  /**
   * Discover all URLs under a domain.
   */
  async map(url) {
    return this._request('map', 'map', { url });
  }

  /**
   * Health check for the Firecrawl API and Planning Server.
   */
  async check() {
    const start = Date.now();
    const planningServerUrl = process.env.FIRECRAWL_PLANNING_URL || 'http://localhost:3011';
    let apiUp = false;
    let planningUp = false;

    try {
      execSync(`curl -sf ${this.apiUrl}/ >/dev/null 2>&1`, { timeout: 3000 });
      apiUp = true;
    } catch {}

    try {
      execSync(`curl -sf ${planningServerUrl}/health >/dev/null 2>&1`, { timeout: 3000 });
      planningUp = true;
    } catch {}

    const latency = Date.now() - start;
    await secondBrain.recordFirecrawlAudit({
      action: 'health-check',
      status: apiUp ? 'success' : 'error',
      latency_ms: latency
    });

    const lastAudit = await secondBrain.getFirecrawlAudit(1);

    return { 
      available: apiUp, 
      api_url: this.apiUrl,
      planning_server_available: planningUp,
      planning_server_url: planningServerUrl,
      last_audit: lastAudit.length > 0 ? lastAudit[0] : null
    };
  }
}

module.exports = new FirecrawlClient();
