const { test } = require('node:test');
const assert = require('node:assert');
const { SafeLogger } = require('../../../packages/gsd-tools/src/logging/SafeLogger');

test('SafeLogger redacts provider tokens and bearer tokens', () => {
  const output = SafeLogger.sanitize('sk-testsecret1234567890 Bearer abcdefghijklmnopqrstuvwxyz012345');
  assert.ok(output.includes('[REDACTED]'));
  assert.ok(!output.includes('sk-testsecret1234567890'));
  assert.ok(!output.includes('Bearer abcdefghijklmnopqrstuvwxyz012345'));
});

test('SafeLogger redacts jwt, db urls, and high-entropy strings', () => {
  const input = 'eyJhbGciOiJIUzI1NiJ9.payload.sig postgres://user:secret@localhost/db AbCdEfGhIjKlMnOpQrStUvWxYz123456';
  const output = SafeLogger.sanitize(input);
  assert.equal(output.match(/\[REDACTED\]/g)?.length, 3);
});

test('SafeLogger is deterministic for buffers and objects', () => {
  const secret = Buffer.from('ghp_abcdefghijklmnopqrstuvwxyz123456');
  const first = SafeLogger.sanitize(secret);
  const second = SafeLogger.sanitize({ secret: secret.toString('utf8') });
  assert.ok(first.includes('[REDACTED]'));
  assert.ok(second.includes('[REDACTED]'));
});
