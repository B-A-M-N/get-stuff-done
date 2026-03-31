/**
 * Phase Input Validator
 * Validates phase input artifacts (objective, tasks, acceptance criteria)
 */
module.exports = {
  name: 'phase_input_validator',

  validate(content) {
    try {
      const obj = JSON.parse(content);
      // Phase input should have phase, plan, tasks array
      if (obj.phase === undefined) return { valid: false, error: 'missing phase' };
      if (obj.plan === undefined) return { valid: false, error: 'missing plan' };
      if (!Array.isArray(obj.tasks)) return { valid: false, error: 'tasks must be array' };
      // All tasks must have id and title
      for (const t of obj.tasks) {
        if (!t.id) return { valid: false, error: 'task missing id' };
        if (!t.title) return { valid: false, error: `task ${t.id} missing title` };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  },
};
