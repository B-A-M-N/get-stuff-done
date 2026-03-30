const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const WEBHOOK_SYNC_PATH = '../get-stuff-done/bin/lib/plane-webhook-sync.cjs';

function clearCaches() {
  delete require.cache[require.resolve(WEBHOOK_SYNC_PATH)];
}

describe('plane-webhook-sync', () => {
  let originalToken;

  beforeEach(() => {
    originalToken = process.env.PLANE_WEBHOOK_TOKEN;
    process.env.PLANE_WEBHOOK_TOKEN = 'plane-secret';
    clearCaches();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.PLANE_WEBHOOK_TOKEN; else process.env.PLANE_WEBHOOK_TOKEN = originalToken;
    clearCaches();
  });

  test('accepts valid webhook and publishes normalized broker events', async () => {
    const mod = require(WEBHOOK_SYNC_PATH);
    const published = [];
    const brokerClient = {
      publish: async (topic, message) => {
        published.push({ topic, message });
        return true;
      }
    };

    const rawBody = JSON.stringify({
      event: 'issue.updated',
      issue: {
        id: 'issue-123',
        name: 'Plan 48-02',
        custom_fields: {
          gsd_phase_number: '48',
          gsd_plan_id: '48-02',
        },
      },
    });

    const result = await mod.handlePlaneWebhook({
      headers: {
        authorization: 'Bearer plane-secret',
        'content-type': 'application/json',
      },
      rawBody,
      brokerClient,
    });

    assert.strictEqual(result.statusCode, 202);
    assert.strictEqual(result.body.accepted, true);
    assert.strictEqual(published.length, 2);
    assert.strictEqual(published[0].topic, 'plane.webhook.received');
    assert.strictEqual(published[1].topic, 'plane.issue.updated');
    assert.strictEqual(published[0].message.plane_issue_id, 'issue-123');
    assert.strictEqual(published[0].message.gsd_phase_number, '48');
    assert.strictEqual(published[0].message.gsd_plan_id, '48-02');
  });

  test('rejects unauthorized webhook requests', async () => {
    const mod = require(WEBHOOK_SYNC_PATH);
    const result = await mod.handlePlaneWebhook({
      headers: {
        authorization: 'Bearer wrong-token',
      },
      rawBody: JSON.stringify({ event: 'issue.updated' }),
      brokerClient: { publish: async () => true },
    });

    assert.strictEqual(result.statusCode, 401);
    assert.strictEqual(result.body.accepted, false);
    assert.strictEqual(result.body.error, 'invalid_token');
  });

  test('rejects malformed JSON payloads', async () => {
    const mod = require(WEBHOOK_SYNC_PATH);
    const result = await mod.handlePlaneWebhook({
      headers: {
        authorization: 'Bearer plane-secret',
      },
      rawBody: '{"event":',
      brokerClient: { publish: async () => true },
    });

    assert.strictEqual(result.statusCode, 400);
    assert.strictEqual(result.body.accepted, false);
    assert.match(result.body.error, /Invalid JSON payload/);
  });

  test('ignores unsupported event types without crashing', async () => {
    const mod = require(WEBHOOK_SYNC_PATH);
    let publishCalls = 0;
    const result = await mod.handlePlaneWebhook({
      headers: {
        authorization: 'Bearer plane-secret',
      },
      rawBody: JSON.stringify({ event: 'workspace.updated', issue: { id: 'ignored' } }),
      brokerClient: {
        publish: async () => {
          publishCalls += 1;
          return true;
        }
      },
    });

    assert.strictEqual(result.statusCode, 202);
    assert.strictEqual(result.body.ignored, true);
    assert.strictEqual(publishCalls, 0);
  });

  test('normalizePlaneWebhookEvent preserves identifiers from array custom fields', () => {
    const mod = require(WEBHOOK_SYNC_PATH);
    const normalized = mod.normalizePlaneWebhookEvent({
      type: 'comment.created',
      issue: {
        id: 'issue-456',
        custom_fields: [
          { key: 'gsd_phase_number', value: '49' },
          { key: 'gsd_plan_id', value: '49-01' },
        ],
      },
    });

    assert.strictEqual(normalized.supported, true);
    assert.strictEqual(normalized.plane_issue_id, 'issue-456');
    assert.strictEqual(normalized.gsd_phase_number, '49');
    assert.strictEqual(normalized.gsd_plan_id, '49-01');
  });
});
