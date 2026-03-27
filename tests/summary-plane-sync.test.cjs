const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SUMMARY_SYNC_PATH = '../get-stuff-done/bin/lib/summary-plane-sync.cjs';
const PLANE_CLIENT_PATH = '../get-stuff-done/bin/lib/plane-client.cjs';
const ROADMAP_SYNC_PATH = '../get-stuff-done/bin/lib/roadmap-plane-sync.cjs';
const CORE_PATH = '../get-stuff-done/bin/lib/core.cjs';
const SECOND_BRAIN_PATH = '../get-stuff-done/bin/lib/second-brain.cjs';

function clearCaches() {
  delete require.cache[require.resolve(SUMMARY_SYNC_PATH)];
  delete require.cache[require.resolve(PLANE_CLIENT_PATH)];
  delete require.cache[require.resolve(ROADMAP_SYNC_PATH)];
  delete require.cache[require.resolve(CORE_PATH)];
  delete require.cache[require.resolve(SECOND_BRAIN_PATH)];
}

describe('summary-plane-sync', () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-summary-sync-'));
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

  function makePhaseDir() {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '48-plane-checkpoint-sync');
    fs.mkdirSync(phaseDir, { recursive: true });
    return phaseDir;
  }

  test('posts comment for valid summary artifact', async () => {
    process.env.PLANE_API_KEY = 'key';
    process.env.PLANE_PROJECT_ID = 'proj';

    const phaseDir = makePhaseDir();
    fs.writeFileSync(path.join(phaseDir, '48-01-SUMMARY.md'), `---
phase: 48
plan: 01
subsystem: integration
provides:
  - checkpoint-comment-sync
requirements-completed:
  - PLANE-VISIBILITY-03
duration: 5m
completed: 2026-03-26T23:00:00Z
---

# Summary
`, 'utf-8');

    const roadmapSync = require(ROADMAP_SYNC_PATH);
    roadmapSync.findIssueByCustomField = async () => ({ id: 'plan-issue-1' });

    const core = require(CORE_PATH);
    core.findPhaseInternal = () => ({
      directory: '.planning/phases/48-plane-checkpoint-sync',
    });

    const planeClient = require(PLANE_CLIENT_PATH);
    let addCommentCall = null;
    planeClient.addComment = async (issueId, content) => {
      addCommentCall = { issueId, content };
      return { ok: true };
    };

    const sync = require(SUMMARY_SYNC_PATH);
    const result = await sync.notifySummaryWrite(tmpDir, '48', '01');

    assert.strictEqual(result.synced, true);
    assert.strictEqual(addCommentCall.issueId, 'plan-issue-1');
    assert.match(addCommentCall.content, /\*\*Phase summary\*\*/);
    assert.match(addCommentCall.content, /\*\*Subsystem:\*\* integration/);
    assert.match(addCommentCall.content, /\*\*Requirements:\*\* PLANE-VISIBILITY-03/);
  });

  test('returns skipped when matching plan issue is absent', async () => {
    process.env.PLANE_API_KEY = 'key';
    process.env.PLANE_PROJECT_ID = 'proj';

    const phaseDir = makePhaseDir();
    fs.writeFileSync(path.join(phaseDir, '48-01-SUMMARY.md'), `---
phase: 48
plan: 01
subsystem: integration
---
`, 'utf-8');

    const roadmapSync = require(ROADMAP_SYNC_PATH);
    roadmapSync.findIssueByCustomField = async () => null;

    const core = require(CORE_PATH);
    core.findPhaseInternal = () => ({
      directory: '.planning/phases/48-plane-checkpoint-sync',
    });

    const sync = require(SUMMARY_SYNC_PATH);
    const result = await sync.notifySummaryWrite(tmpDir, '48', '01');

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.skipped, 'plan_issue_not_found');
  });

  test('returns early when Plane is disabled', async () => {
    delete process.env.PLANE_API_KEY;
    delete process.env.PLANE_PROJECT_ID;

    const sync = require(SUMMARY_SYNC_PATH);
    const result = await sync.notifySummaryWrite(tmpDir, '48', '01');

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.skipped, 'plane_not_configured');
  });

  test('handles malformed or missing summary file as warning path', async () => {
    process.env.PLANE_API_KEY = 'key';
    process.env.PLANE_PROJECT_ID = 'proj';

    const core = require(CORE_PATH);
    core.findPhaseInternal = () => ({
      directory: '.planning/phases/48-plane-checkpoint-sync',
    });

    const sync = require(SUMMARY_SYNC_PATH);
    const result = await sync.notifySummaryWrite(tmpDir, '48', '01');

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.skipped, 'error');
    assert.match(result.error, /Summary file not found/);
  });

  test('cli route validates required plane-sync summary flags', () => {
    const result = spawnSync('node', ['get-stuff-done/bin/gsd-tools.cjs', 'plane-sync', 'summary', '--phase', '48'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
    });

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /plane-sync summary requires --plan/);
  });
});
