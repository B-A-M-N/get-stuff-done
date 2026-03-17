const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'get-stuff-done');

test('checkpoint references and subagent prompts require explicit blocker protocol', () => {
  const checkpointRef = fs.readFileSync(path.join(root, 'references', 'checkpoints.md'), 'utf-8');
  const plannerPrompt = fs.readFileSync(path.join(root, 'templates', 'planner-subagent-prompt.md'), 'utf-8');
  const debugPrompt = fs.readFileSync(path.join(root, 'templates', 'debug-subagent-prompt.md'), 'utf-8');
  const executePlan = fs.readFileSync(path.join(root, 'workflows', 'execute-plan.md'), 'utf-8');
  const executePhase = fs.readFileSync(path.join(root, 'workflows', 'execute-phase.md'), 'utf-8');

  for (const content of [checkpointRef, plannerPrompt, debugPrompt, executePlan, executePhase]) {
    assert.ok(content.includes('why_blocked'), 'should require why_blocked');
    assert.ok(content.includes('what_is_uncertain'), 'should require what_is_uncertain');
    assert.ok(content.includes('resume_condition'), 'should require resume_condition');
  }

  assert.ok(checkpointRef.includes('choices'), 'checkpoint reference should require concrete choices');
  assert.ok(checkpointRef.includes('allow_freeform'), 'checkpoint reference should require freeform allowance');
  assert.ok(checkpointRef.includes('Waiting for user input.'), 'checkpoint reference should show a bad example');
});
