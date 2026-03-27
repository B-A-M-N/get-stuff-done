const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

test('Postgres integration path is gated behind GSD_TEST_POSTGRES=1', () => {
  if (process.env.GSD_TEST_POSTGRES !== '1') {
    return;
  }

  const result = spawnSync(
    process.execPath,
    ['get-stuff-done/bin/gsd-tools.cjs', 'brain', 'health', '--require-postgres', '--raw'],
    {
      cwd: ROOT,
      encoding: 'utf-8',
      env: { ...process.env },
    }
  );

  assert.notStrictEqual(result.stdout.trim(), '', 'expected JSON output from brain health');
  const output = JSON.parse(result.stdout);
  const activePostgres = output.active_backend === 'postgres' && output.postgres?.status === 'ok';
  const explicitlyBlocked = output.memory_critical_blocked === true && output.postgres?.status === 'blocked';
  assert.ok(activePostgres || explicitlyBlocked, `unexpected Postgres-required result: ${result.stdout}`);

  if (explicitlyBlocked) {
    assert.notStrictEqual(result.status, 0, 'blocked Postgres-required run must exit non-zero');
  }
});
