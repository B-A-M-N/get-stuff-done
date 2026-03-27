function createUnavailableResult(reason, detail) {
  return {
    available: false,
    reason,
    detail,
    dimensions: null,
    vector: null,
    provider: 'fastembed',
  };
}

function createEmbeddingProvider(options = {}) {
  const target = options.target || 'fastembed';
  const enabled = options.enabled !== false;
  const dimensions = options.dimensions || 384;
  let loadError = null;
  let implementation = null;

  if (enabled) {
    try {
      implementation = require(target);
    } catch (error) {
      loadError = error;
    }
  }

  return {
    target,
    async embedText(input) {
      if (!enabled) {
        return createUnavailableResult(
          'embedding_provider_disabled',
          'Open Brain embedding provider disabled; continuing without semantic recall.'
        );
      }

      if (!implementation) {
        return createUnavailableResult(
          'embedding_provider_unavailable',
          `Open Brain embedding provider target "${target}" is unavailable locally.`
        );
      }

      if (typeof implementation.embed !== 'function') {
        return createUnavailableResult(
          'embedding_provider_invalid',
          `Open Brain embedding provider target "${target}" does not expose a supported embed API.`
        );
      }

      const vector = await implementation.embed(input);
      return {
        available: true,
        reason: null,
        detail: null,
        dimensions: Array.isArray(vector) ? vector.length : dimensions,
        vector,
        provider: target,
      };
    },
    getStatus() {
      if (!enabled) {
        return {
          available: false,
          target,
          detail: 'Open Brain embedding provider disabled; continuing without semantic recall.',
        };
      }

      if (!implementation) {
        return {
          available: false,
          target,
          detail: loadError
            ? `Open Brain embedding provider target "${target}" is unavailable locally.`
            : `Open Brain embedding provider target "${target}" is unavailable.`,
        };
      }

      return {
        available: true,
        target,
        detail: null,
      };
    },
  };
}

function getDefaultEmbeddingProvider() {
  return createEmbeddingProvider({ target: 'fastembed' });
}

module.exports = {
  createEmbeddingProvider,
  getDefaultEmbeddingProvider,
};
