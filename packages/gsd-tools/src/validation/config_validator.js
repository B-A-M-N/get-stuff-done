/**
 * Config Validator
 * Validates that configuration contains required fields.
 * Expected format: { mode: string, retries: number, timeout: number }
 */
module.exports = {
  name: 'config_validator',

  validate(content) {
    try {
      const obj = JSON.parse(content);
      const required = ['mode', 'retries', 'timeout'];
      const missing = required.filter(k => !(k in obj));
      if (missing.length === 0) {
        return { valid: true };
      }
      return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  },
};
