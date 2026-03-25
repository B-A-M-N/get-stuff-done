/**
 * Plane Client — Centralized bridge for Plane API access.
 *
 * Provides state synchronization with Plane project management,
 * with rate limiting, retry logic, and audit logging.
 */

const https = require('https');
const secondBrain = require('./second-brain.cjs');
const { logDebug, logWarn, logError } = require('./core.cjs');

class PlaneClient {
  constructor() {
    this.apiUrl = process.env.PLANE_API_URL || 'http://localhost:3003';
    this.apiKey = process.env.PLANE_API_KEY || '';
    this.projectId = process.env.PLANE_PROJECT_ID || '';
    this.rateLimitBuckets = new Map();
    this.cache = new Map();
  }

  /**
   * Internal helper to make HTTPS requests with timeout and error handling.
   */
  async _makeRequest(url, method = 'POST', headers = {}, body = null, timeout = 30000) {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        ...headers,
        timeout,
      },
      timeout,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data);
              resolve({ statusCode: res.statusCode, data: parsed });
            } catch (e) {
              reject(new Error(`Invalid JSON response: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  /**
   * Internal helper to perform API requests with rate limiting, retry, and audit logging.
   */
  async _request(action, endpoint, body = null) {
    const start = Date.now();
    let lastError = null;
    let result = null;

    // Rate limiting (token bucket) - always rate limit for Plane API regardless of body content
    let hostname;
    try {
      hostname = new URL(this.apiUrl).hostname;
    } catch (e) {
      hostname = null;
    }
    if (hostname) {
      const now = Date.now();
      const rpm = process.env.PLANE_RATE_LIMIT_RPM ? parseInt(process.env.PLANE_RATE_LIMIT_RPM, 10) : 60;
      const capacity = rpm;
      const refillRate = rpm / 60; // tokens per second
      let bucket = this.rateLimitBuckets.get(hostname);
      let currentTokens; // Track tokens available for this request without premature mutation

      if (!bucket) {
        bucket = { tokens: capacity, lastRefill: now };
        currentTokens = capacity;
      } else {
        // Calculate refill to determine available tokens
        const elapsedSec = (now - bucket.lastRefill) / 1000;
        const added = elapsedSec * refillRate;
        currentTokens = Math.min(capacity, bucket.tokens + added);
        // Do NOT update bucket.tokens yet - only if we actually consume
      }

      // Check if we have enough tokens
      if (currentTokens < 1) {
        const deficit = 1 - currentTokens;
        const retryAfterSec = Math.ceil(deficit / refillRate);
        throw new Error(`Rate limit exceeded for host ${hostname}. Retry after ~${retryAfterSec} seconds.`);
      }

      // We have tokens - consume one, update timestamp, and persist
      bucket.tokens = currentTokens - 1;
      bucket.lastRefill = now;
      this.rateLimitBuckets.set(hostname, bucket);
    }

    try {
      // Retry loop with exponential backoff and jitter
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const url = `${this.apiUrl}/v1/${endpoint}`;
          const postData = body ? JSON.stringify(body) : null;
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          };
          if (postData) {
            headers['Content-Length'] = Buffer.byteLength(postData);
          }

          const response = await this._makeRequest(url, 'POST', headers, postData, 30000);
          result = response.data;
          break; // Success, exit retry loop
        } catch (err) {
          lastError = err;
          // Don't retry on HTTP 4xx errors (client errors)
          if (err.message.match(/^HTTP 4\d\d:/)) {
            throw err;
          }
          // For other errors, retry if attempts remain
          if (attempt < 3) {
            const baseDelay = 1000 * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 200;
            const delay = baseDelay + jitter;
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw err; // Max attempts reached
          }
        }
      }
    } finally {
      // Audit logging - always runs
      const latency = Date.now() - start;
      const status = lastError ? 'error' : 'success';
      try {
        await secondBrain.recordFirecrawlAudit({
          action: `plane-${action}`,
          url: body?.url || null,
          schema_json: null,
          status,
          latency_ms: latency
        });
      } catch (auditErr) {
        // Audit failures should not break the flow
        logWarn('Plane audit log failed:', { error: auditErr.message });
      }
    }

    // If no error thrown, return result
    return result;
  }

  /**
   * Update Plane project metadata.
   */
  async updateProjectMetadata(metadata) {
    return this._request('update-project', `projects/${this.projectId}`, metadata);
  }

  /**
   * Create a new milestone in Plane.
   */
  async createMilestone(milestoneData) {
    return this._request('create-milestone', `projects/${this.projectId}/milestones`, milestoneData);
  }

  /**
   * Create a new issue in Plane.
   */
  async createIssue(issueData) {
    return this._request('create-issue', `projects/${this.projectId}/issues`, issueData);
  }

  /**
   * Update an existing issue in Plane.
   */
  async updateIssue(issueId, updates) {
    return this._request('update-issue', `projects/${this.projectId}/issues/${issueId}`, updates);
  }

  /**
   * Link an issue to a parent issue (establish hierarchy).
   */
  async linkIssueParent(issueId, parentId) {
    return this._request('link-parent', `projects/${this.projectId}/issues/${issueId}/parent`, { parent_id: parentId });
  }
}

module.exports = new PlaneClient();
