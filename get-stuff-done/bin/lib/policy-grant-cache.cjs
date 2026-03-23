/**
 * Policy Grant Cache — Shared in-memory cache for policy grant lookups
 *
 * Provides TTL-based caching to reduce database load from repeated
 * policy checks. Used by FirecrawlClient and invalidated by grant
 * operations in SecondBrain.
 */

const cache = new Map(); // url → { granted: boolean, ts: number }
const TTL = 60 * 1000; // 60 seconds

/**
 * Get cached grant result
 * @param {string} url - Resource URL
 * @returns {{granted: boolean}|null} Cached value or null if miss/expired
 */
function getGrant(url) {
  const entry = cache.get(url);
  if (!entry) return null;
  const now = Date.now();
  if (now - entry.ts >= TTL) {
    cache.delete(url);
    return null;
  }
  return entry;
}

/**
 * Set cached grant result
 * @param {string} url - Resource URL
 * @param {boolean} granted - Grant status
 */
function setGrant(url, granted) {
  cache.set(url, { granted, ts: Date.now() });
}

/**
 * Clear cached entry for a specific URL
 * @param {string} url - Resource URL
 */
function clearGrant(url) {
  cache.delete(url);
}

/**
 * Clear all cached grants (e.g., on bulk revoke)
 */
function clearAll() {
  cache.clear();
}

module.exports = {
  getGrant,
  setGrant,
  clearGrant,
  clearAll
};
