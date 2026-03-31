/**
 * Contract Validator
 * Validates contract metadata payloads used by the proof harness.
 */
module.exports = {
  name: 'contract_validator',

  validate(content) {
    try {
      const obj = JSON.parse(content);

      if (typeof obj.validator !== 'string' || obj.validator.length === 0) {
        return { valid: false, error: 'validator must be non-empty string' };
      }

      if (typeof obj.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(obj.version)) {
        return { valid: false, error: 'version must be semver string' };
      }

      if (typeof obj.contract_hash !== 'string' || !/^[a-f0-9]{64}$/i.test(obj.contract_hash)) {
        return { valid: false, error: 'contract_hash must be 64-char hex' };
      }

      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  },
};
