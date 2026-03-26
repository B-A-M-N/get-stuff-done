const { test } = require('node:test');
const assert = require('node:assert');
const { SafeLogger } = require('../../../packages/gsd-tools/src/logging/SafeLogger');

function captureWrites(message) {
  const writes = [];
  SafeLogger.log(chunk => writes.push(chunk), message);
  return writes;
}

function assertRedactedOutput(writes) {
  assert.equal(writes.length, 1);
  assert.ok(writes[0].includes('[REDACTED]'));
  assert.ok(!writes[0].includes('secret@localhost'));
  assert.ok(!writes[0].includes('AbCdEf1234567890XYZ'));
}

test('SafeLogger sanitizes strings before write-boundary output', () => {
  const writes = captureWrites('postgres://user:secret@localhost/db token="AbCdEf1234567890XYZ"');
  assertRedactedOutput(writes);
});

test('SafeLogger kill test fails when sanitization is disabled', () => {
  const originalSanitize = SafeLogger.sanitize;
  SafeLogger.sanitize = input => String(input);
  try {
    const writes = captureWrites('postgres://user:secret@localhost/db token="AbCdEf1234567890XYZ"');
    assert.throws(() => assertRedactedOutput(writes));
  } finally {
    SafeLogger.sanitize = originalSanitize;
  }
});
