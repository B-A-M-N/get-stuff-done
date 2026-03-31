const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ProofHarness } = require('../../../packages/gsd-tools/src/validation/ProofHarness');

const PHASE_DIR = path.join(process.cwd(), '.planning', 'phases', '52-truth-enforcement-hardening');
const PROOFS_DIR = path.join(PHASE_DIR, 'proofs');

describe('Adversarial Scenarios', () => {
  test('proof inventory matches contract inventory and excludes backup artifacts', () => {
    const contractValidators = fs.readdirSync(path.join(process.cwd(), 'contracts'))
      .filter((name) => name.endsWith('.yaml'))
      .map((name) => path.basename(name, '.yaml'))
      .sort();

    const proofValidators = fs.readdirSync(PROOFS_DIR)
      .filter((name) => name.endsWith('.proof.json'))
      .map((name) => name.replace(/\.proof\.json$/, ''))
      .sort();

    assert.deepStrictEqual(proofValidators, contractValidators);
    assert.ok(!proofValidators.some((name) => name.includes('missing_bak')));
  });

  describe('Tampered contract hash detection', () => {
    test('proof fails verification when contract_hash is altered', () => {
      const proofPath = path.join(PROOFS_DIR, 'json_validator.proof.json');
      const original = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));

      // Tamper: change contract_hash
      const tampered = { ...original, contract_hash: 'a'.repeat(64) };
      const result = ProofHarness.verifyProof(tampered);

      assert.strictEqual(result.valid, false, 'Tampered proof should be invalid');
      assert.ok(result.reason.includes('Contract hash mismatch'), `Reason should mention contract mismatch: ${result.reason}`);
    });
  });

  describe('False negative detection', () => {
    test('proof fails verification when false_negatives > 0', () => {
      const baseProof = {
        ...ProofHarness.generateProof('json_validator', {
          total_cases: 10,
          passed_valid: 10,
          rejected_invalid: 0,
          false_negatives: 0,
          false_positives: 0,
        }),
        passed_valid: 9,
        rejected_invalid: 1,
        false_negatives: 1,
      };

      const result = ProofHarness.verifyProof(baseProof);
      assert.strictEqual(result.valid, false);
      assert.ok(result.reason.includes('false_negatives'), `Reason should mention false_negatives: ${result.reason}`);
    });
  });

  describe('Invalid signature detection', () => {
    test('proof fails verification when signature is altered', () => {
      const proofPath = path.join(PROOFS_DIR, 'config_validator.proof.json');
      const original = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));

      // Tamper: flip one hex digit in signature
      const tampered = { ...original, signature: original.signature.slice(0, -1) + (original.signature.at(-1) === 'a' ? 'b' : 'a') };
      const result = ProofHarness.verifyProof(tampered);

      assert.strictEqual(result.valid, false);
      assert.ok(result.reason.includes('Signature mismatch'), `Reason should mention signature: ${result.reason}`);
    });
  });

  describe('Validator removal (kill test)', () => {
    test('generate-all-proofs fails if a validator module is missing', () => {
      const validatorFile = path.join(process.cwd(), 'packages', 'gsd-tools', 'src', 'validation', 'json_validator.js');
      const backupFile = validatorFile + '.missing_bak';

      // Ensure validator exists
      if (!fs.existsSync(validatorFile)) {
        throw new Error('Validator file missing before test: ' + validatorFile);
      }

      // Move it away temporarily
      fs.renameSync(validatorFile, backupFile);

      try {
        // Run generator; it should exit with non-zero
        let exitCode = 0;
        try {
          execFileSync('node', ['scripts/generate-all-proofs.js', '--dry-run'], { stdio: 'ignore' });
        } catch (err) {
          exitCode = err.status || 1;
        }
        assert.notStrictEqual(exitCode, 0, 'Generator should exit with non-zero when validator missing');
      } finally {
        // Restore
        if (fs.existsSync(backupFile)) {
          fs.renameSync(backupFile, validatorFile);
        }
      }
    });
  });

  describe('Deterministic proof generation', () => {
    test('generator output is stable across repeated runs except for timestamp', () => {
      execFileSync('node', ['scripts/generate-all-proofs.js'], { stdio: 'ignore' });
      const first = JSON.parse(fs.readFileSync(path.join(PROOFS_DIR, 'contract_validator.proof.json'), 'utf-8'));

      execFileSync('node', ['scripts/generate-all-proofs.js'], { stdio: 'ignore' });
      const second = JSON.parse(fs.readFileSync(path.join(PROOFS_DIR, 'contract_validator.proof.json'), 'utf-8'));

      assert.ok(first.timestamp);
      assert.ok(second.timestamp);

      const { timestamp: firstTimestamp, ...firstStable } = first;
      const { timestamp: secondTimestamp, ...secondStable } = second;

      assert.notStrictEqual(firstTimestamp, undefined);
      assert.notStrictEqual(secondTimestamp, undefined);
      assert.deepStrictEqual(secondStable, firstStable);
    });
  });
});
