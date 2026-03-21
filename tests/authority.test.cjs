const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authority = require('../get-stuff-done/bin/lib/authority.cjs');

async function runTests() {
  console.log('Running authority tests...');

  const tempFile = path.join(__dirname, 'temp-authority-test.txt');
  const content = 'Hello, GSD!\n';
  fs.writeFileSync(tempFile, content, 'utf-8');

  try {
    // Test 1: Generate signature
    const signature = authority.generateSignature(content, '28', '02', '2');
    assert.strictEqual(typeof signature, 'string');
    assert.strictEqual(signature.length, 64);
    console.log('✓ Test 1: Generate signature passed');

    // Test 2: Sign file
    const signed = authority.signFile(tempFile, '28', '02', '2');
    assert.strictEqual(signed, true);
    
    const signedContent = fs.readFileSync(tempFile, 'utf-8');
    assert.ok(signedContent.includes('GSD-AUTHORITY: 28-02-2:'));
    console.log('✓ Test 2: Sign file passed');

    // Test 3: Verify signature (valid)
    const verification = authority.verifySignature(signedContent);
    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.phase, '28');
    assert.strictEqual(verification.plan, '02');
    assert.strictEqual(verification.wave, '2');
    console.log('✓ Test 3: Verify signature (valid) passed');

    // Test 4: Verify signature (invalid - content modified)
    const invalidContent = 'Modified content\n\n// GSD-AUTHORITY: 28-02-2:' + verification.signature + '\n';
    const verificationInvalid = authority.verifySignature(invalidContent);
    assert.strictEqual(verificationInvalid.valid, false);
    console.log('✓ Test 4: Verify signature (invalid) passed');

    // Test 5: Verify signature (no envelope)
    const verificationNoEnvelope = authority.verifySignature('No envelope here');
    assert.strictEqual(verificationNoEnvelope.valid, false);
    assert.strictEqual(verificationNoEnvelope.reason, 'No authority envelope found');
    console.log('✓ Test 5: Verify signature (no envelope) passed');

  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }

  console.log('All authority tests passed!');
}

runTests().catch(err => {
  console.error('Tests failed:', err);
  process.exit(1);
});
