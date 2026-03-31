const crypto = require('crypto');
const broker = require('./broker.cjs');
const secondBrain = require('./second-brain.cjs');
const { logWarn } = require('./core.cjs');

const SUPPORTED_EVENTS = new Set([
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'comment.created',
  'comment.updated',
  'comment.deleted',
]);

function getConfiguredWebhookToken() {
  return process.env.PLANE_WEBHOOK_TOKEN || process.env.PLANNING_SERVER_TOKEN || '';
}

function verifyPlaneWebhookAuth(headers = {}) {
  const expectedToken = getConfiguredWebhookToken();
  if (!expectedToken) {
    return { ok: false, reason: 'webhook_token_not_configured' };
  }

  const authHeader = headers.authorization || headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing_bearer_token' };
  }

  const providedToken = authHeader.slice(7);
  if (providedToken.length !== expectedToken.length) {
    return { ok: false, reason: 'invalid_token' };
  }

  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(expectedToken));
  } catch {
    valid = false;
  }

  return valid ? { ok: true } : { ok: false, reason: 'invalid_token' };
}

function parsePlaneWebhookBody(rawBody) {
  try {
    return { ok: true, payload: JSON.parse(rawBody) };
  } catch (err) {
    return { ok: false, error: `Invalid JSON payload: ${err.message}` };
  }
}

function extractCustomField(issue, key) {
  if (!issue || typeof issue !== 'object') return null;
  if (issue[key] !== undefined && issue[key] !== null && issue[key] !== '') {
    return String(issue[key]);
  }

  const customFields = issue.custom_fields || issue.customFields || issue.fields;
  if (!customFields) return null;

  if (Array.isArray(customFields)) {
    const match = customFields.find((field) => {
      if (!field || typeof field !== 'object') return false;
      return field.key === key || field.name === key || field.id === key;
    });
    if (!match) return null;
    const value = match.value ?? match.text ?? match.number ?? match.display_value ?? null;
    return value === null || value === undefined || value === '' ? null : String(value);
  }

  if (typeof customFields === 'object') {
    const value = customFields[key];
    return value === null || value === undefined || value === '' ? null : String(value);
  }

  return null;
}

function normalizePlaneWebhookEvent(payload, headers = {}) {
  const eventType = headers['x-plane-event']
    || headers['X-Plane-Event']
    || payload.event
    || payload.type
    || null;

  if (!eventType || !SUPPORTED_EVENTS.has(eventType)) {
    return {
      supported: false,
      reason: 'unsupported_event',
      raw_type: eventType || 'unknown',
    };
  }

  const issue = payload.issue || payload.data?.issue || payload.data || {};
  const planeIssueId = issue.id || payload.issue_id || payload.data?.issue_id || null;

  return {
    supported: true,
    source: 'plane',
    event: eventType,
    raw_type: eventType,
    received_at: new Date().toISOString(),
    plane_issue_id: planeIssueId ? String(planeIssueId) : null,
    gsd_phase_number: extractCustomField(issue, 'gsd_phase_number'),
    gsd_plan_id: extractCustomField(issue, 'gsd_plan_id'),
    payload: {
      issue_id: planeIssueId ? String(planeIssueId) : null,
      issue_name: issue.name || issue.title || null,
    },
  };
}

async function handlePlaneWebhook({ headers = {}, rawBody, brokerClient = broker } = {}) {
  const auth = verifyPlaneWebhookAuth(headers);
  if (!auth.ok) {
    return {
      statusCode: auth.reason === 'webhook_token_not_configured' ? 503 : 401,
      body: { accepted: false, error: auth.reason },
    };
  }

  const parsed = parsePlaneWebhookBody(rawBody || '');
  if (!parsed.ok) {
    return {
      statusCode: 400,
      body: { accepted: false, error: parsed.error },
    };
  }

  const normalized = normalizePlaneWebhookEvent(parsed.payload, headers);
  if (!normalized.supported) {
    return {
      statusCode: 202,
      body: { accepted: false, ignored: true, reason: normalized.reason, raw_type: normalized.raw_type },
    };
  }

  try {
    await brokerClient.publish('plane.webhook.received', normalized);
    await brokerClient.publish(`plane.${normalized.event}`, normalized);
    await secondBrain.recordFirecrawlAudit({
      action: 'plane-webhook-received',
      url: normalized.event ? `plane://webhook/${normalized.event}` : 'plane://webhook/unknown',
      schema_json: null,
      status: 'success',
      latency_ms: 0,
    });
  } catch (err) {
    logWarn('Plane webhook publish failed', { event: normalized.event, error: err.message });
    try {
      await secondBrain.recordFirecrawlAudit({
        action: 'plane-webhook-received',
        url: normalized.event ? `plane://webhook/${normalized.event}` : 'plane://webhook/unknown',
        schema_json: null,
        status: 'error',
        latency_ms: 0,
      });
    } catch {}
    return {
      statusCode: 502,
      body: { accepted: false, error: 'broker_publish_failed' },
    };
  }

  return {
    statusCode: 202,
    body: { accepted: true, published: true, event: normalized.event, plane_issue_id: normalized.plane_issue_id },
  };
}

module.exports = {
  SUPPORTED_EVENTS,
  verifyPlaneWebhookAuth,
  parsePlaneWebhookBody,
  normalizePlaneWebhookEvent,
  handlePlaneWebhook,
};
