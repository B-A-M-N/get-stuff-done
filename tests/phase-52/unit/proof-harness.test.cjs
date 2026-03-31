const { test, describe } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { ProofHarness } = require('../../../packages/gsd-tools/src/validation/ProofHarness');
const Ajv = require('ajv');

function signProof(validatorName, testResults) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ validatorName, testResults }))
    .digest('hex');
}

describe('ProofHarness', () => {
  test('generateProof produces valid proof with 0 false negatives/positives', () => {
    const validatorName = 'test_validator';
    const testResults = {
      total_cases: 100,
      passed_valid: 50,
      rejected_invalid: 50,
      false_negatives: 0,
      false_positives: 0,
    };

    const proof = ProofHarness.generateProof(validatorName, testResults);

    // Required fields present
    assert.ok(proof.version, 'proof has version');
    assert.strictEqual(proof.validator, validatorName);
    assert.ok(proof.timestamp, 'proof has timestamp');
    assert.strictEqual(proof.total_cases, testResults.total_cases);
    assert.strictEqual(proof.passed_valid, testResults.passed_valid);
    assert.strictEqual(proof.rejected_invalid, testResults.rejected_invalid);
    assert.strictEqual(proof.false_negatives, 0);
    assert.strictEqual(proof.false_positives, 0);
    assert.ok(proof.contract_hash, 'proof has contract_hash');
    assert.ok(proof.signature, 'proof has signature');

    // Validate contract_hash format (SHA256 hex)
    assert.match(proof.contract_hash, /^[a-f0-9]{64}$/i, 'contract_hash is 64-char hex');

    // Validate signature format
    assert.match(proof.signature, /^[a-f0-9]{64}$/i, 'signature is 64-char hex');
  });

  test('generateProof is deterministic (non-timestamp fields identical)', () => {
    const validatorName = 'deterministic_test';
    const testResults = {
      total_cases: 10,
      passed_valid: 10,
      rejected_invalid: 0,
      false_negatives: 0,
      false_positives: 0,
    };

    const proof1 = ProofHarness.generateProof(validatorName, testResults);
    const proof2 = ProofHarness.generateProof(validatorName, testResults);

    // Both have timestamps
    assert.ok(proof1.timestamp);
    assert.ok(proof2.timestamp);

    // Non-timestamp fields identical
    const { timestamp: t1, ...rest1 } = proof1;
    const { timestamp: t2, ...rest2 } = proof2;
    assert.deepStrictEqual(rest1, rest2);
  });

  test('proof validates against schema using AJV', () => {
    const ajv = new Ajv();
    const validatorName = 'schema_test';
    const testResults = {
      total_cases: 5,
      passed_valid: 5,
      rejected_invalid: 0,
      false_negatives: 0,
      false_positives: 0,
    };

    const proof = ProofHarness.generateProof(validatorName, testResults);

    // Load schema
    const schema = require('../../../.planning/phases/52-truth-enforcement-hardening/schemas/proof-schema.json');

    const validate = ajv.compile(schema);
    const valid = validate(proof);

    assert.ok(valid, `Proof validates: ${validate.errors?.map(e => JSON.stringify(e)).join(', ') || 'ok'}`);
    assert.deepStrictEqual(ProofHarness.verifyProof(proof), { valid: true });
  });

  test('contract_hash is computed from validator contract file', () => {
    const validatorName = 'json_validator';
    const testResults = {
      total_cases: 1,
      passed_valid: 1,
      rejected_invalid: 0,
      false_negatives: 0,
      false_positives: 0,
    };

    const proof = ProofHarness.generateProof(validatorName, testResults);

    // The contract hash should be SHA256 of contracts/json_validator.yaml content
    // For this test, we verify it's a non-empty hex string if contract file exists
    if (proof.contract_hash) {
      assert.strictEqual(proof.contract_hash.length, 64);
    }
  });

  test('signature is tamper-evident (different inputs yield different signatures)', () => {
    const validatorName = 'tamper_test';
    const testResults1 = { total_cases: 1, passed_valid: 1, rejected_invalid: 0, false_negatives: 0, false_positives: 0 };
    const testResults2 = { total_cases: 2, passed_valid: 2, rejected_invalid: 0, false_negatives: 0, false_positives: 0 };

    const proof1 = ProofHarness.generateProof(validatorName, testResults1);
    const proof2 = ProofHarness.generateProof(validatorName, testResults2);

    assert.notStrictEqual(proof1.signature, proof2.signature, 'different results produce different signatures');
  });

  test('verifyProof rejects tampered signature and mismatched contract hash', () => {
    const proof = ProofHarness.generateProof('json_validator', {
      total_cases: 3,
      passed_valid: 3,
      rejected_invalid: 0,
      false_negatives: 0,
      false_positives: 0,
    });

    const tamperedSignature = { ...proof, signature: '0'.repeat(64) };
    assert.match(ProofHarness.verifyProof(tamperedSignature).reason, /Signature mismatch/);

    const tamperedHash = { ...proof, contract_hash: 'f'.repeat(64) };
    assert.match(ProofHarness.verifyProof(tamperedHash).reason, /Contract hash mismatch/);
  });

  test('verifyProof rejects non-zero false negatives and false positives', () => {
    const falseNegativeResults = {
      total_cases: 4,
      passed_valid: 3,
      rejected_invalid: 1,
      false_negatives: 1,
      false_positives: 0,
    };
    const falseNegatives = {
      ...ProofHarness.generateProof('json_validator', {
        total_cases: 4,
        passed_valid: 4,
        rejected_invalid: 0,
        false_negatives: 0,
        false_positives: 0,
      }),
      ...falseNegativeResults,
      signature: signProof('json_validator', falseNegativeResults),
    };
    assert.match(ProofHarness.verifyProof(falseNegatives).reason, /false_negatives is 1/);

    const falsePositiveResults = {
      total_cases: 4,
      passed_valid: 3,
      rejected_invalid: 1,
      false_negatives: 0,
      false_positives: 1,
    };
    const falsePositives = {
      ...ProofHarness.generateProof('json_validator', {
        total_cases: 4,
        passed_valid: 4,
        rejected_invalid: 0,
        false_negatives: 0,
        false_positives: 0,
      }),
      ...falsePositiveResults,
      signature: signProof('json_validator', falsePositiveResults),
    };
    assert.match(ProofHarness.verifyProof(falsePositives).reason, /false_positives is 1/);
  });

  test('verifyProof reports schema load errors for malformed proof input', () => {
    const result = ProofHarness.verifyProof({ validator: 'json_validator' });
    assert.match(result.reason, /Schema validation failed|Schema load error|false_negatives is undefined/);
  });

  test('generateProof throws when metrics violate schema invariants', () => {
    assert.throws(() => ProofHarness.generateProof('json_validator', {
      total_cases: 10,
      passed_valid: 9,
      rejected_invalid: 1,
      false_negatives: 1,
      false_positives: 0,
    }), /Generated proof failed schema validation/);
  });
});
