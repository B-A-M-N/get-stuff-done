const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const COMMAND_PATH = path.join(__dirname, '..', 'commands', 'gsd', 'dostuff.md');
const WORKFLOW_PATH = path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'dostuff.md');

describe('dostuff command', () => {
  test('command file exists', () => {
    assert.ok(fs.existsSync(COMMAND_PATH), 'commands/gsd/dostuff.md should exist');
  });

  test('workflow file exists', () => {
    assert.ok(fs.existsSync(WORKFLOW_PATH), 'get-stuff-done/workflows/dostuff.md should exist');
  });

  test('command routes narrative to new-project or quick', () => {
    const content = fs.readFileSync(COMMAND_PATH, 'utf8');
    assert.ok(content.includes('name: gsd:dostuff'));
    assert.ok(content.includes('/dostuff:new-project'));
    assert.ok(content.includes('/dostuff:quick'));
    assert.ok(content.includes('interpretation summary'));
    assert.ok(content.includes('@~/.claude/get-stuff-done/workflows/dostuff.md'));
  });

  test('workflow uses ITL interpretation before routing', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    assert.ok(content.includes('itl interpret'));
    assert.ok(content.includes('clarification checkpoint'));
    assert.ok(content.includes('lockability result'));
    assert.ok(content.includes('Keep asking while the checkpoint remains `required` or `blocking`'));
    assert.ok(content.includes('/dostuff:new-project'));
    assert.ok(content.includes('/dostuff:quick'));
    assert.ok(content.includes('If `$ARGUMENTS` is empty'));
  });
});

describe('new-project narrative-first flow', () => {
  test('source command describes narrative-first initialization', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'commands', 'gsd', 'new-project.md'), 'utf8');
    assert.ok(content.includes('narrative-first intake'));
    assert.ok(content.includes('ITL interpretation'));
    assert.ok(content.includes('/dostuff:plan-phase 1'));
  });

  test('workflow uses init-seed interpretation and bounded clarification', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'new-project.md'), 'utf8');
    assert.ok(content.includes('itl init-seed'));
    assert.ok(content.includes('Tell me what you\'re trying to build'));
    assert.ok(content.includes('clarification.mode'));
    assert.ok(content.includes('clarification.reason'));
    assert.ok(content.includes('provide their own wording'));
    assert.ok(content.includes('stop before writing files'));
    assert.ok(content.includes('requirements_seed.active'));
  });
});

describe('discuss-phase narrative-first flow', () => {
  test('source command describes narrative-first discuss-phase behavior', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'commands', 'gsd', 'discuss-phase.md'), 'utf8');
    assert.ok(content.includes('freeform phase narrative'));
    assert.ok(content.includes('ITL interpretation'));
    assert.ok(content.includes('/dostuff:discuss-phase'));
  });

  test('workflow uses discuss-seed interpretation and bounded clarification', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'discuss-phase.md'), 'utf8');
    assert.ok(content.includes('itl discuss-seed'));
    assert.ok(content.includes('Interpretation Preview'));
    assert.ok(content.includes('clarification.mode'));
    assert.ok(content.includes('why clarification is being raised'));
    assert.ok(content.includes('do not silently resolve it by inference'));
    assert.ok(content.includes('stop auto mode'));
    assert.ok(content.includes('deferred ideas'));
  });
});

describe('verify-work narrative-first flow', () => {
  test('source command describes installed dostuff verify-work surface', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'commands', 'gsd', 'verify-work.md'), 'utf8');
    assert.ok(content.includes('/dostuff:verify-work'));
    assert.ok(content.includes('Validate built features through conversational UAT'));
  });

  test('workflow uses verify-seed interpretation before UAT', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'verify-work.md'), 'utf8');
    assert.ok(content.includes('itl verify-seed'));
    assert.ok(content.includes('Narrative-first verification is additive'));
    assert.ok(content.includes('prioritized_checks'));
    assert.ok(content.includes('normal UAT format'));
    assert.ok(content.includes('clarification.mode'));
    assert.ok(content.includes('stop before extracting tests'));
  });
});

describe('research handoff integration', () => {
  test('context template distinguishes research cues from decisions', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'templates', 'context.md'), 'utf8');
    assert.ok(content.includes('## Research Cues'));
    assert.ok(content.includes('### Invariant Safety'));
    assert.ok(content.includes('### Unresolved Ambiguities'));
    assert.ok(content.includes('### Interpreted Assumptions'));
    assert.ok(content.includes('not locked implementation decisions'));
  });

  test('research-phase command consumes narrative-first context cues', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'commands', 'gsd', 'research-phase.md'), 'utf8');
    assert.ok(content.includes('Narrative Intake Summary'));
    assert.ok(content.includes('Research Cues'));
    assert.ok(content.includes('inferred assumptions as settled requirements'));
  });

  test('research-phase workflow distinguishes decisions from inferred guidance', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'research-phase.md'), 'utf8');
    assert.ok(content.includes('Implementation Decisions'));
    assert.ok(content.includes('Research Cues'));
    assert.ok(content.includes('Narrative Intake Summary'));
    assert.ok(content.includes('Invariant Safety'));
    assert.ok(content.includes('Unresolved Ambiguities'));
  });
});

describe('planning handoff integration', () => {
  test('plan-phase command describes narrative-first planning handoff', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'commands', 'gsd', 'plan-phase.md'), 'utf8');
    assert.ok(content.includes('Narrative-first context'));
    assert.ok(content.includes('planning contracts'));
    assert.ok(content.includes('context-contract validator'));
  });

  test('plan-phase workflow distinguishes locked decisions from inferred planning guidance', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'plan-phase.md'), 'utf8');
    assert.ok(content.includes('Implementation Decisions'));
    assert.ok(content.includes('Narrative Intake Summary'));
    assert.ok(content.includes('Research Cues'));
    assert.ok(content.includes('Invariant Safety'));
    assert.ok(content.includes('Unresolved Ambiguities'));
    assert.ok(content.includes('do not silently convert it into hard scope'));
    assert.ok(content.includes('verify context-contract'));
  });

  test('planning docs describe richer handoff without replacing plan validation', () => {
    const help = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'help.md'), 'utf8');
    const commands = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COMMANDS.md'), 'utf8');
    assert.ok(help.includes('richer narrative/context/research handoff'));
    assert.ok(help.includes('context-contract gate'));
    assert.ok(commands.includes('keeping PLAN.md and validation as the planning contracts'));
    assert.ok(commands.includes('context-contract gate before the broader plan checker'));
  });
});

describe('regression audit contract', () => {
  test('docs do not overclaim invariant enforcement scope', () => {
    const help = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'help.md'), 'utf8');
    const commands = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COMMANDS.md'), 'utf8');
    assert.ok(help.includes('full workflow-by-workflow consumption is still being audited'));
    assert.ok(commands.includes('full downstream workflow enforcement is not claimed'));
  });
});

describe('canonical schema and adapter contract', () => {
  test('docs describe the canonical ITL boundary without overclaiming provider support', () => {
    const help = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'help.md'), 'utf8');
    const commands = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COMMANDS.md'), 'utf8');
    const architecture = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ARCHITECTURE.md'), 'utf8');
    assert.ok(help.includes('Zod-backed schemas'));
    assert.ok(help.includes('shared registry'));
    assert.ok(commands.includes('Claude, Gemini, Kimi, and OpenAI'));
    assert.ok(architecture.includes('itl-schema.cjs'));
    assert.ok(architecture.includes('itl-adapters.cjs'));
    assert.ok(architecture.includes('concrete provider adapters now exist'));
  });
});

describe('standalone package contract', () => {
  test('docs describe the extracted package and its clean API', () => {
    const help = fs.readFileSync(path.join(__dirname, '..', 'get-stuff-done', 'workflows', 'help.md'), 'utf8');
    const commands = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COMMANDS.md'), 'utf8');
    const architecture = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ARCHITECTURE.md'), 'utf8');
    assert.ok(help.includes('packages/itl'));
    assert.ok(help.includes('interpret_narrative(input_text, context_data)'));
    assert.ok(commands.includes('packages/itl'));
    assert.ok(architecture.includes('Standalone ITL Package'));
  });
});
