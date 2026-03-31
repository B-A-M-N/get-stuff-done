/**
 * JSON Validator
 * Validates that input is valid JSON.
 */
module.exports = {
  name: 'json_validator',

  validate(content) {
    try {
      JSON.parse(content);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  },
};
