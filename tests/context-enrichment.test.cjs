const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { harvestAmbientContext } = require('../get-stuff-done/bin/lib/state.cjs');
const { buildClarificationPrompt, buildInterpretationResult } = require('../get-stuff-done/bin/lib/itl.cjs');

test('Context Harvesting and Persistence', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir);

  // Setup mock files
  const stateContent = `---
gsd_state_version: 1.0
---
# Project State
## Decisions
- [Phase 01]: Use ITL — for narrative interpretation
`;
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);

  const projectContent = `# Project
## Goals
- Goal 1: High reliability
- Goal 2: Fast execution
## Constraints
- Constraint 1: No external dependencies
`;
  fs.writeFileSync(path.join(planningDir, 'PROJECT.md'), projectContent);

  const reqContent = `# Requirements
## v0.1 Requirements
- [ ] **REQ-001**: Implement context harvester
- [ ] **REQ-002**: Persist ITL output
`;
  fs.writeFileSync(path.join(planningDir, 'REQUIREMENTS.md'), reqContent);

  const phasesDir = path.join(planningDir, 'phases');
  fs.mkdirSync(phasesDir);
  const phase18Dir = path.join(phasesDir, '18-context-enrichment');
  fs.mkdirSync(phase18Dir);
  const phaseContextContent = `## Decisions
- Decision 1: Mocked decision for phase 18
`;
  fs.writeFileSync(path.join(phase18Dir, 'CONTEXT.md'), phaseContextContent);

  await t.test('harvestAmbientContext reads all files correctly', () => {
    const context = harvestAmbientContext(tmpDir, 18);
    
    assert.strictEqual(context.decisions.length, 1);
    assert.strictEqual(context.decisions[0].summary, 'Use ITL');
    
    assert.strictEqual(context.project_goals.length, 2);
    assert.strictEqual(context.project_goals[0], 'Goal 1: High reliability');
    
    assert.strictEqual(context.constraints.length, 1);
    assert.strictEqual(context.constraints[0], 'Constraint 1: No external dependencies');
    
    assert.strictEqual(context.active_requirements.length, 2);
    assert.strictEqual(context.active_requirements[0].id, 'REQ-001');
    
    assert.strictEqual(context.phase_decisions.length, 1);
    assert.strictEqual(context.phase_decisions[0], 'Decision 1: Mocked decision for phase 18');
  });

  await t.test('persistItlOutput creates correct JSON file', () => {
    const { persistItlOutput } = require('../get-stuff-done/bin/lib/itl.cjs');
    const itlResult = { interpretation: { goals: ['Test goal'] } };
    const targetPath = persistItlOutput(tmpDir, 18, itlResult);
    
    assert.ok(fs.existsSync(targetPath));
    assert.ok(targetPath.endsWith('18-ITL.json'));
    const persisted = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
    assert.deepStrictEqual(persisted, itlResult);
  });

  await t.test('buildClarificationPrompt uses ambient goals for missing-goal', () => {
    const ambientContext = {
      project_goals: ['Deliver high-quality CLI tool']
    };
    const finding = { type: 'missing-goal', severity: 'high' };
    const prompt = buildClarificationPrompt(finding, ambientContext);
    
    assert.ok(prompt.question.includes('Deliver high-quality CLI tool'));
    assert.strictEqual(prompt.choices[0].label, 'Use project goal');
  });

  await t.test('buildClarificationPrompt uses defaults when no goals present', () => {
    const ambientContext = { project_goals: [] };
    const finding = { type: 'missing-goal', severity: 'high' };
    const prompt = buildClarificationPrompt(finding, ambientContext);
    
    assert.ok(prompt.question.includes('What is the single most important outcome'));
    assert.strictEqual(prompt.choices[0].label, 'One concrete outcome');
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
