/**
 * Policy — Centralized prompt/gate evaluation
 */

const { loadConfig, resolvePromptPolicy, output, error } = require('./core.cjs');

function cmdPolicyShouldPrompt(cwd, keyPath, raw) {
  if (!keyPath) {
    error('policy key required');
  }

  let result;
  try {
    result = resolvePromptPolicy(loadConfig(cwd), keyPath);
  } catch (err) {
    error(err.message);
  }

  output(result, raw, result.should_prompt ? 'true' : 'false');
}

module.exports = {
  cmdPolicyShouldPrompt,
};
