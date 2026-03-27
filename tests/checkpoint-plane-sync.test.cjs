const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHECKPOINT_SYNC_PATH = '../get-stuff-done/bin/lib/checkpoint-plane-sync.cjs';
const PLANE_CLIENT_PATH = '../get-stuff-done/bin/lib/plane-client.cjs';
const ROADMAP_SYNC_PATH = '../get-stuff-done/bin/lib/roadmap-plane-sync.cjs';
const SECOND_BRAIN_PATH = '../get-stuff-done/bin/lib/second-brain.cjs';

function clearCaches() {
  delete require.cache[require.resolve(CHECKPOINT_SYNC_PATH)];
  delete require.cache[require.resolve(PLANE_CLIENT_PATH)];
  delete require.cache[require.resolve(ROADMAP_SYNC_PATH)];
  delete require.cache[require.resolve(SECOND_BRAIN_PATH)];
}

describe('checkpoint-plane-sync', () => {
  let originalEnv;
  let tmpDir;

  beforeEach(() => {
    originalEnv = {
      PLANE_API_KEY: process.env.PLANE_API_KEY,
      PLANE_PROJECT_ID: process.env.PLANE_PROJECT_ID,
      PGHOST: process.env.PGHOST,
      PGPORT: process.env.PGPORT,
      PGDATABASE: process.env.PGDATABASE,
      PGUSER: process.env.PGUSER,
      PGPASSWORD: process.env.PGPASSWORD,
      DATABASE_URL: process.env.DATABASE_URL,
      GSD_MEMORY_MODE: process.env.GSD_MEMORY_MODE,
    };
    delete process.env.PGHOST;
    delete process.env.PGPORT;
    delete process.env.PGDATABASE;
    delete process.env.PGUSER;
    delete process.env.PGPASSWORD;
    delete process.env.DATABASE_URL;
    delete process.env.GSD_MEMORY_MODE;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-checkpoint-sync-'));
    clearCaches();
  });

  afterEach(async () => {
    try {
      const secondBrain = require(SECOND_BRAIN_PATH);
      await secondBrain.resetForTests();
    } catch {}
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearCaches();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeCheckpoint(name, content) {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  test('posts comment for valid checkpoint artifact', async () => {
    process.env.PLANE_API_KEY = 'key';
    process.env.PLANE_PROJECT_ID = 'proj';

    const roadmapSync = require(ROADMAP_SYNC_PATH);
    roadmapSync.findIssueByCustomField = async () => ({ id: 'issue-123' });

    const planeClient = require(PLANE_CLIENT_PATH);
    let addCommentCall = null;
    planeClient.addComment = async (issueId, content) => {
      addCommentCall = { issueId, content };
      return { ok: true };
    };

    const checkpointPath = writeCheckpoint('CHECKPOINT.md', `---
status: pending
type: decision
why_blocked: "Need direction"
what_is_uncertain: "Whether to sync immediately"
choices: "sync-now | defer"
allow_freeform: true
resume_condition: "User picks an option"
resolved_at: ~
---

## Checkpoint Details

**Type:** decision
**Blocked at:** Task 3 — Sync hook

**Why blocked:** Need direction

**What is uncertain:** Whether to sync immediately
`);

    const sync = require(CHECKPOINT_SYNC_PATH);
    const result = await sync.notifyCheckpointWrite('48', checkpointPath);

    assert.strictEqual(result.synced, true);
    assert.deepStrictEqual(addCommentCall.issueId, 'issue-123');
    assert.match(addCommentCall.content, /\*\*Checkpoint artifact\*\*/);
    assert.match(addCommentCall.content, /\*\*Blocked at:\*\* Task 3/);
    assert.match(addCommentCall.content, /\*\*Choices:\*\* sync-now \| defer/);
    assert.match(addCommentCall.content, /Artifact:/);
  });

  test('returns skipped when matching phase issue is absent', async () => {
    process.env.PLANE_API_KEY = 'key';
    process.env.PLANE_PROJECT_ID = 'proj';

    const roadmapSync = require(ROADMAP_SYNC_PATH);
    roadmapSync.findIssueByCustomField = async () => null;

    const planeClient = require(PLANE_CLIENT_PATH);
    let called = false;
    planeClient.addComment = async () => {
      called = true;
    };

    const checkpointPath = writeCheckpoint('CHECKPOINT.md', `---
type: human-verify
why_blocked: "Need check"
what_is_uncertain: "Unknown"
choices: ""
resume_condition: "User confirms"
---
`);

    const sync = require(CHECKPOINT_SYNC_PATH);
    const result = await sync.notifyCheckpointWrite('48', checkpointPath);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.skipped, 'phase_issue_not_found');
    assert.strictEqual(called, false);
  });

  test('returns early when Plane is disabled', async () => {
    delete process.env.PLANE_API_KEY;
    delete process.env.PLANE_PROJECT_ID;

    const sync = require(CHECKPOINT_SYNC_PATH);
    const result = await sync.notifyCheckpointWrite('48', path.join(tmpDir, 'missing.md'));

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.skipped, 'plane_not_configured');
  });

  test('handles malformed checkpoint file as warning path', async () => {
    process.env.PLANE_API_KEY = 'key';
    process.env.PLANE_PROJECT_ID = 'proj';

    const checkpointPath = writeCheckpoint('CHECKPOINT.md', '# not frontmatter\n');
    const sync = require(CHECKPOINT_SYNC_PATH);
    const result = await sync.notifyCheckpointWrite('48', checkpointPath);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.skipped, 'error');
    assert.match(result.error, /Invalid checkpoint format/);
  });
});
