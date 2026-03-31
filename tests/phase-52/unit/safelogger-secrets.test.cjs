const { test } = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
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

test('SafeLogger redacts aws and github credentials', () => {
  const input = 'AKIA1234567890ABCDEF ghp_abcdefghijklmnopqrstuvwxyz123456';
  const output = SafeLogger.sanitize(input);
  assert.equal(output, '[REDACTED] [REDACTED]');
});

test('SafeLogger redacts private keys', () => {
  const input = '-----BEGIN PRIVATE KEY-----\nabc123secret\n-----END PRIVATE KEY-----';
  const output = SafeLogger.sanitize(input);
  assert.equal(output, '[REDACTED]');
});

test('SafeLogger redacts assignment-style secrets', () => {
  const output = SafeLogger.sanitize('token="AbCdEf1234567890XYZ" password: "supersafesecret987"');
  assert.equal(output, '[REDACTED] [REDACTED]');
});

test('SafeLogger redacts multiple secrets in one payload', () => {
  const input = 'Bearer abcdEFGHijklMNOP1234567890 token="AbCdEf1234567890XYZ" sk-live1234567890ABCDEFG';
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

test('SafeLogger leaves normal strings unchanged', () => {
  const input = 'normal application message 42';
  assert.equal(SafeLogger.sanitize(input), input);
});

test('SafeLogger stringifies nullish and numeric inputs', () => {
  assert.equal(SafeLogger.sanitize(null), 'null');
  assert.equal(SafeLogger.sanitize(undefined), 'undefined');
  assert.equal(SafeLogger.sanitize(42), '42');
});

test('SafeLogger exposes all required pattern classes', () => {
  const names = new Set(SafeLogger.patterns().map(pattern => pattern.name));
  for (const required of ['openai', 'aws-access-key', 'github-token', 'bearer-token', 'jwt', 'private-key', 'database-url', 'generic-credential-assignment', 'high-entropy']) {
    assert.ok(names.has(required));
  }
});

test('SafeLogger write aliases sanitize before emitting', () => {
  const writes = [];
  SafeLogger.log(chunk => writes.push(chunk), 'sk-testsecret1234567890');
  SafeLogger.info(chunk => writes.push(chunk), 'postgres://user:secret@localhost/db');
  SafeLogger.warn(chunk => writes.push(chunk), 'ghp_abcdefghijklmnopqrstuvwxyz123456');
  SafeLogger.error(chunk => writes.push(chunk), 'Bearer abcdefghijklmnopqrstuvwxyz012345');
  assert.equal(writes.length, 4);
  assert.ok(writes.every(chunk => chunk.includes('[REDACTED]')));
});

test('SafeLogger sanitize average runtime stays below 1ms over 1000 calls', () => {
  const payload = 'sk-testsecret1234567890 postgres://user:secret@localhost/db token="AbCdEf1234567890XYZ"';
  const iterations = 1000;
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    SafeLogger.sanitize(payload);
  }
  const averageMs = (performance.now() - started) / iterations;
  assert.ok(averageMs < 1, `expected sanitize average <1ms, received ${averageMs.toFixed(4)}ms`);
});
