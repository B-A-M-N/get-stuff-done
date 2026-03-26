const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Ajv = require('ajv');

const PHASE_52_DIR = path.join(
  process.cwd(),
  '.planning',
  'phases',
  '52-truth-enforcement-hardening'
);
const PROOF_SCHEMA_PATH = path.join(PHASE_52_DIR, 'schemas', 'proof-schema.json');

class ProofHarness {
  /**
   * Generate a deterministic proof for a validator's test results.
   * @param {string} validatorName - Name of the validator (e.g., 'json_validator')
   * @param {object} testResults - Test outcome metrics
   * @param {number} testResults.total_cases
   * @param {number} testResults.passed_valid
   * @param {number} testResults.rejected_invalid
   * @param {number} testResults.false_negatives
   * @param {number} testResults.false_positives
   * @returns {object} Proof object matching proof-schema.json
   */
  static generateProof(validatorName, testResults) {
    const contractHash = this.#computeContractHash(validatorName);
    const signature = this.#signProof(validatorName, testResults);
    const timestamp = new Date().toISOString();

    const proof = {
      version: '1.0.0',
      validator: validatorName,
      timestamp,
      total_cases: testResults.total_cases,
      passed_valid: testResults.passed_valid,
      rejected_invalid: testResults.rejected_invalid,
      false_negatives: testResults.false_negatives,
      false_positives: testResults.false_positives,
      contract_hash: contractHash,
      signature,
    };

    const validation = this.#validateProofSchema(proof);
    if (!validation.valid) {
      throw new Error(`Generated proof failed schema validation: ${validation.reason}`);
    }

    return proof;
  }

  /**
   * Compute SHA256 hash of the validator's contract file.
   * Looks for contracts/{validator}.yaml (or .json) in project root.
   * @private
   */
  static #computeContractHash(validatorName) {
    // Try .yaml then .json for contract file
    const possiblePaths = [
      path.join(process.cwd(), 'contracts', `${validatorName}.yaml`),
      path.join(process.cwd(), 'contracts', `${validatorName}.json`),
      path.join(process.cwd(), '.planning', 'phases', '52-truth-enforcement-hardening', 'contracts', `${validatorName}.yaml`),
    ];

    const contractPath = possiblePaths.find(fs.existsSync);
    if (!contractPath) {
      // No contract file — return hash of empty string (deterministic fallback)
      return crypto.createHash('sha256').update('').digest('hex');
    }

    const content = fs.readFileSync(contractPath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Compute tamper-evident signature of the proof contents.
   * Includes validator name and all test result fields (but not timestamp).
   * @private
   */
  static #signProof(validatorName, testResults) {
    const signPayload = JSON.stringify({ validatorName, testResults });
    return crypto.createHash('sha256').update(signPayload).digest('hex');
  }

  /**
   * Verify a proof's integrity and validity.
   * Checks: schema, signature tamper-evidence, contract hash consistency, zero errors.
   * @param {object} proof
   * @returns {object} { valid: boolean, reason?: string }
   */
  static verifyProof(proof) {
    // 1. Schema validation
    const schemaValidation = this.#validateProofSchema(proof);
    if (!schemaValidation.valid) {
      if (proof && typeof proof === 'object' && proof.false_negatives !== 0) {
        return { valid: false, reason: `false_negatives is ${proof.false_negatives}, expected 0` };
      }
      if (proof && typeof proof === 'object' && proof.false_positives !== 0) {
        return { valid: false, reason: `false_positives is ${proof.false_positives}, expected 0` };
      }
      return schemaValidation;
    }

    // 2. Signature tamper check
    const expectedSignature = this.#signProof(proof.validator, {
      total_cases: proof.total_cases,
      passed_valid: proof.passed_valid,
      rejected_invalid: proof.rejected_invalid,
      false_negatives: proof.false_negatives,
      false_positives: proof.false_positives,
    });
    if (proof.signature !== expectedSignature) {
      return { valid: false, reason: 'Signature mismatch (tampering detected)' };
    }

    // 3. Contract hash consistency
    const expectedContractHash = this.#computeContractHash(proof.validator);
    if (proof.contract_hash !== expectedContractHash) {
      return { valid: false, reason: 'Contract hash mismatch' };
    }

    return { valid: true };
  }

  static #validateProofSchema(proof) {
    try {
      const validate = this.#getSchemaValidator();
      const schemaValid = validate(proof);
      if (!schemaValid) {
        return {
          valid: false,
          reason: `Schema validation failed: ${this.#ajv.errorsText(validate.errors)}`,
        };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: `Schema load error: ${err.message}` };
    }
  }

  static #getSchemaValidator() {
    if (!this.#schemaValidator) {
      const schema = JSON.parse(fs.readFileSync(PROOF_SCHEMA_PATH, 'utf-8'));
      this.#schemaValidator = this.#ajv.compile(schema);
    }
    return this.#schemaValidator;
  }

  static #ajv = new Ajv();
  static #schemaValidator;
}

module.exports = { ProofHarness };
// Also export verifyProof directly for convenience
module.exports.verifyProof = ProofHarness.verifyProof;
