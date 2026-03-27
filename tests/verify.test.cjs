/**
 * GSD Tools Tests - Verify
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, createTempGitProject, cleanup } = require('./helpers.cjs');
const { execSync } = require('child_process');

// ─── helpers ──────────────────────────────────────────────────────────────────

// Build a minimal valid PLAN.md content with all required frontmatter fields
function validPlanContent({ wave = 1, dependsOn = '[]', autonomous = 'true', extraTasks = '' } = {}) {
  return [
    '---',
    'phase: 01-test',
    'plan: 01',
    'type: execute',
    `wave: ${wave}`,
    `depends_on: ${dependsOn}`,
    'files_modified: [some/file.ts]',
    `autonomous: ${autonomous}`,
    'must_haves:',
    '  truths:',
    '    - "something is true"',
    '---',
    '',
    '<tasks>',
    '',
    '<task type="auto">',
    '  <name>Task 1: Do something</name>',
    '  <files>some/file.ts</files>',
    '  <action>Do the thing</action>',
    '  <verify><automated>echo ok</automated></verify>',
    '  <done>Thing is done</done>',
    '</task>',
    extraTasks,
    '',
    '</tasks>',
  ].join('\n');
}

function qualityPlanContent({
  phase = '01-test',
  plan = '01',
  wave = 1,
  dependsOn = '[]',
  requirements = '[REQ-1]',
  filesModified = '[src/feature.ts, src/feature.test.ts]',
  includeRisk = true,
  includeAssumption = false,
  missingReadFirst = false,
  missingAcceptance = false,
} = {}) {
  return [
    '---',
    `phase: ${phase}`,
    `plan: ${plan}`,
    'type: execute',
    `wave: ${wave}`,
    `depends_on: ${dependsOn}`,
    `requirements: ${requirements}`,
    `files_modified: ${filesModified}`,
    'autonomous: true',
    'must_haves:',
    '  truths:',
    '    - "feature works for the user"',
    '  artifacts:',
    '    - path: "src/feature.ts"',
    '      provides: "feature implementation"',
    '  key_links:',
    '    - from: "src/feature.ts"',
    '      to: "src/feature.test.ts"',
    '      via: "test import"',
    '      pattern: "feature"',
    '---',
    '',
    '# Plan',
    '',
    includeRisk ? 'Risk: rollback to existing feature toggle if integration fails.' : 'Notes: implementation details only.',
    includeAssumption ? 'Assumption: API payload shape remains provisional until backend confirms it.' : 'Execution notes: proceed with confirmed inputs.',
    '',
    '<tasks>',
    '<task type="auto">',
    '  <name>Build feature</name>',
    '  <files>src/feature.ts</files>',
    missingReadFirst ? '' : '  <read_first>src/feature.ts\nsrc/feature.test.ts</read_first>',
    '  <action>Implement feature() and wire it to the exported entrypoint used by src/feature.test.ts.</action>',
    missingAcceptance ? '' : '  <acceptance_criteria>src/feature.ts contains function feature(\nsrc/feature.test.ts exits 0</acceptance_criteria>',
    '  <verify><automated>node --test src/feature.test.ts</automated></verify>',
    '  <done>Feature implementation and test wiring are complete.</done>',
    '</task>',
    '</tasks>',
  ].filter(Boolean).join('\n');
}

describe('validate consistency command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('passes for consistent project', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: A\n### Phase 2: B\n### Phase 3: C\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02-b'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-c'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, true, 'should pass');
    assert.strictEqual(output.warning_count, 0, 'no warnings');
  });

  test('warns about phase on disk but not in roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: A\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02-orphan'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.warning_count > 0, 'should have warnings');
    assert.ok(
      output.warnings.some(w => w.includes('disk but not in ROADMAP')),
      'should warn about orphan directory'
    );
  });

  test('warns about gaps in phase numbering', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: A\n### Phase 3: C\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-c'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.warnings.some(w => w.includes('Gap in phase numbering')),
      'should warn about gap'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify plan-structure command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify plan-structure command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reports missing required frontmatter fields', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, '# No frontmatter here\n\nJust a plan without YAML.\n');

    const result = runGsdTools('verify plan-structure .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false, 'should be invalid');
    assert.ok(
      output.errors.some(e => e.includes('Missing required frontmatter field')),
      `Expected "Missing required frontmatter field" in errors: ${JSON.stringify(output.errors)}`
    );
  });

  test('validates complete plan with all required fields and tasks', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, validPlanContent());

    const result = runGsdTools('verify plan-structure .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, `should be valid, errors: ${JSON.stringify(output.errors)}`);
    assert.deepStrictEqual(output.errors, [], 'should have no errors');
    assert.strictEqual(output.task_count, 1, 'should have 1 task');
  });

  test('reports task missing name element', () => {
    const content = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: [some/file.ts]',
      'autonomous: true',
      'must_haves:',
      '  truths:',
      '    - "something"',
      '---',
      '',
      '<tasks>',
      '<task type="auto">',
      '  <action>Do it</action>',
      '  <verify><automated>echo ok</automated></verify>',
      '  <done>Done</done>',
      '</task>',
      '</tasks>',
    ].join('\n');

    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, content);

    const result = runGsdTools('verify plan-structure .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.errors.some(e => e.includes('Task missing <name>')),
      `Expected "Task missing <name>" in errors: ${JSON.stringify(output.errors)}`
    );
  });

  test('reports task missing action element', () => {
    const content = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: [some/file.ts]',
      'autonomous: true',
      'must_haves:',
      '  truths:',
      '    - "something"',
      '---',
      '',
      '<tasks>',
      '<task type="auto">',
      '  <name>Task 1: No action</name>',
      '  <verify><automated>echo ok</automated></verify>',
      '  <done>Done</done>',
      '</task>',
      '</tasks>',
    ].join('\n');

    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, content);

    const result = runGsdTools('verify plan-structure .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.errors.some(e => e.includes('missing <action>')),
      `Expected "missing <action>" in errors: ${JSON.stringify(output.errors)}`
    );
  });

  test('warns about wave > 1 with empty depends_on', () => {
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, validPlanContent({ wave: 2, dependsOn: '[]' }));

    const result = runGsdTools('verify plan-structure .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.warnings.some(w => w.includes('Wave > 1 but depends_on is empty')),
      `Expected "Wave > 1 but depends_on is empty" in warnings: ${JSON.stringify(output.warnings)}`
    );
  });

  test('errors when checkpoint task but autonomous is true', () => {
    const content = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: [some/file.ts]',
      'autonomous: true',
      'must_haves:',
      '  truths:',
      '    - "something"',
      '---',
      '',
      '<tasks>',
      '<task type="auto">',
      '  <name>Task 1: Normal</name>',
      '  <files>some/file.ts</files>',
      '  <action>Do it</action>',
      '  <verify><automated>echo ok</automated></verify>',
      '  <done>Done</done>',
      '</task>',
      '<task type="checkpoint:human-verify">',
      '  <name>Task 2: Verify UI</name>',
      '  <files>some/file.ts</files>',
      '  <action>Check the UI</action>',
      '  <verify><human>Visit the app</human></verify>',
      '  <done>UI verified</done>',
      '</task>',
      '</tasks>',
    ].join('\n');

    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, content);

    const result = runGsdTools('verify plan-structure .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.errors.some(e => e.includes('checkpoint tasks but autonomous is not false')),
      `Expected checkpoint/autonomous error in errors: ${JSON.stringify(output.errors)}`
    );
  });


  test('returns error for nonexistent file', () => {
    const result = runGsdTools('verify plan-structure .planning/phases/01-test/nonexistent.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, `Expected error field in output: ${JSON.stringify(output)}`);
    assert.ok(
      output.error.includes('File not found'),
      `Expected "File not found" in error: ${output.error}`
    );
  });
});

describe('verify plan-quality command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n\n### Phase 1: Test\n**Goal**: Ship feature\n**Requirements**: REQ-1\n');
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('passes balanced plans with explicit verification and risk coverage', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), qualityPlanContent());

    const result = runGsdTools(['verify', 'plan-quality', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'passed');
    assert.strictEqual(output.scores.goal_alignment.score, 5);
    assert.ok(output.issues.length === 0, `Expected no issues: ${JSON.stringify(output.issues)}`);
  });

  test('blocks when roadmap requirements are uncovered', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), qualityPlanContent({ requirements: '[REQ-2]' }));

    const result = runGsdTools(['verify', 'plan-quality', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'blocked');
    assert.ok(output.issues.some(issue => issue.severity === 'blocker' && issue.dimension === 'goal_alignment'));
  });

  test('returns revise when task atomicity and verification proxies are weak', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), qualityPlanContent({ includeRisk: false, missingReadFirst: true, missingAcceptance: true }));

    const result = runGsdTools(['verify', 'plan-quality', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'revise');
    assert.ok(output.issues.some(issue => issue.dimension === 'task_atomicity'));
    assert.ok(output.issues.some(issue => issue.dimension === 'verification_strength'));
    assert.ok(output.scores.task_atomicity.score < 5);
  });

  test('returns revise when upstream ambiguity is not carried forward', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-CONTEXT.md'), '# Context\n\n## Unresolved Ambiguities\n- API payload shape is still unsettled\n');
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), qualityPlanContent({ includeAssumption: false }));

    const result = runGsdTools(['verify', 'plan-quality', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'revise');
    assert.ok(output.issues.some(issue => issue.dimension === 'assumption_honesty'));
    assert.strictEqual(output.scores.assumption_honesty.score, 2);
  });

  test('blocks when research surfaces domain contract categories that no plan materializes', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-RESEARCH.md'), [
      '## Invariants',
      '- Feature output must stay JSON-serializable.',
      '',
      '## Policy Rules',
      '- Never emit partial success when validation fails.',
      '',
      '## Executable Checks',
      '- Run node --test src/feature.test.ts before handoff.',
    ].join('\n'));
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), qualityPlanContent());

    const result = runGsdTools(['verify', 'plan-quality', '01'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.status, 'blocked');
    assert.ok(output.issues.some(issue => issue.dimension === 'contract_materialization' && issue.severity === 'blocker'));
    assert.ok(output.uncovered_contract_categories.includes('invariants'));
    assert.ok(output.uncovered_contract_categories.includes('policy_rules'));
    assert.ok(output.scores.contract_materialization.score <= 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify phase-completeness command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify phase-completeness command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Create ROADMAP.md referencing phase 01 so findPhaseInternal can locate it
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n\n### Phase 1: Test\n**Goal**: Test phase\n'
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reports complete phase with matching plans and summaries', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan\n');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary\n');

    const result = runGsdTools('verify phase-completeness 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.complete, true, `should be complete, errors: ${JSON.stringify(output.errors)}`);
    assert.strictEqual(output.plan_count, 1, 'should have 1 plan');
    assert.strictEqual(output.summary_count, 1, 'should have 1 summary');
    assert.deepStrictEqual(output.incomplete_plans, [], 'should have no incomplete plans');
  });

  test('reports incomplete phase with plan missing summary', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan\n');

    const result = runGsdTools('verify phase-completeness 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.complete, false, 'should be incomplete');
    assert.ok(
      output.incomplete_plans.some(id => id.includes('01-01')),
      `Expected "01-01" in incomplete_plans: ${JSON.stringify(output.incomplete_plans)}`
    );
    assert.ok(
      output.errors.some(e => e.includes('Plans without summaries')),
      `Expected "Plans without summaries" in errors: ${JSON.stringify(output.errors)}`
    );
  });

  test('warns about orphan summaries', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary\n');

    const result = runGsdTools('verify phase-completeness 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.warnings.some(w => w.includes('Summaries without plans')),
      `Expected "Summaries without plans" in warnings: ${JSON.stringify(output.warnings)}`
    );
  });

  test('returns error for nonexistent phase', () => {
    const result = runGsdTools('verify phase-completeness 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, `Expected error field in output: ${JSON.stringify(output)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify-summary command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify summary command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns not found for nonexistent summary', () => {
    const result = runGsdTools('verify-summary .planning/phases/01-test/nonexistent.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, false, 'should not pass');
    assert.strictEqual(output.checks.summary_exists, false, 'summary should not exist');
    assert.ok(
      output.errors.some(e => e.includes('SUMMARY.md not found')),
      `Expected "SUMMARY.md not found" in errors: ${JSON.stringify(output.errors)}`
    );
  });

  test('passes for valid summary with real files and commits', () => {
    // Create a source file and commit it
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'console.log("hello");\n');
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "add app.js"', { cwd: tmpDir, stdio: 'pipe' });

    const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    // Write SUMMARY.md referencing the file and commit hash
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 01',
      'plan: 01',
      'subsystem: testing',
      'tags: [unit]',
      'provides: [app.js]',
      'duration: 10min',
      'completed: 2026-03-17',
      '---',
      '# Summary',
      '',
      `Created: \`src/app.js\``,
      '',
      `Commit: ${hash}`,
    ].join('\n'));

    const result = runGsdTools('verify-summary .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, true, `should pass, errors: ${JSON.stringify(output.errors)}`);
    assert.strictEqual(output.checks.summary_exists, true, 'summary should exist');
    assert.strictEqual(output.checks.commits_exist, true, 'commits should exist');
  });

  test('reports missing files mentioned in summary', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 01',
      'plan: 01',
      'subsystem: testing',
      'tags: [unit]',
      'provides: [app.js]',
      'duration: 10min',
      'completed: 2026-03-17',
      '---',
      '# Summary',
      '',
      'Created: `src/nonexistent.js`',
    ].join('\n'));

    const result = runGsdTools('verify-summary .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.checks.files_created.missing.includes('src/nonexistent.js'),
      `Expected missing to include "src/nonexistent.js": ${JSON.stringify(output.checks.files_created.missing)}`
    );
  });

  test('detects self-check section with pass indicators', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 01',
      'plan: 01',
      'subsystem: testing',
      'tags: [unit]',
      'provides: [app.js]',
      'duration: 10min',
      'completed: 2026-03-17',
      '---',
      '# Summary',
      '',
      '## Self-Check',
      '',
      'All tests pass',
    ].join('\n'));

    const result = runGsdTools('verify-summary .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.checks.self_check, 'passed', `Expected self_check "passed": ${JSON.stringify(output.checks)}`);
  });

  test('detects self-check section with fail indicators', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 01',
      'plan: 01',
      'subsystem: testing',
      'tags: [unit]',
      'provides: [app.js]',
      'duration: 10min',
      'completed: 2026-03-17',
      '---',
      '# Summary',
      '',
      '## Verification',
      '',
      'Tests failed',
    ].join('\n'));

    const result = runGsdTools('verify-summary .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.checks.self_check, 'failed', `Expected self_check "failed": ${JSON.stringify(output.checks)}`);
  });

  test('REG-03: returns self_check "not_found" when no self-check section exists', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 01',
      'plan: 01',
      'subsystem: testing',
      'tags: [unit]',
      'provides: [app.js]',
      'duration: 10min',
      'completed: 2026-03-17',
      '---',
      '# Summary',
      '',
      '## Accomplishments',
      '',
      'Everything went well.',
    ].join('\n'));

    const result = runGsdTools('verify-summary .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.checks.self_check, 'not_found', `Expected self_check "not_found": ${JSON.stringify(output.checks)}`);
    assert.strictEqual(output.passed, true, `Missing self-check should not fail: ${JSON.stringify(output)}`);
  });

  test('search(-1) regression: self-check guard prevents entry when no heading', () => {
    // No Self-Check/Verification/Quality Check heading — guard on line 79 prevents
    // content.search(selfCheckPattern) from ever being called, so -1 is impossible
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 01',
      'plan: 01',
      'subsystem: testing',
      'tags: [unit]',
      'provides: [app.js]',
      'duration: 10min',
      'completed: 2026-03-17',
      '---',
      '# Summary',
      '',
      '## Notes',
      '',
      'Some content here without a self-check heading.',
    ].join('\n'));

    const result = runGsdTools('verify-summary .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // Guard works: selfCheckPattern.test() is false, if block not entered, selfCheck stays 'not_found'
    assert.strictEqual(output.checks.self_check, 'not_found', `Expected not_found since no heading: ${JSON.stringify(output.checks)}`);
  });

  test('respects checkFileCount parameter', () => {
    // Write summary referencing 5 files (none exist)
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 01',
      'plan: 01',
      'subsystem: testing',
      'tags: [unit]',
      'provides: [app.js]',
      'duration: 10min',
      'completed: 2026-03-17',
      '---',
      '# Summary',
      '',
      'Files: `src/a.js`, `src/b.js`, `src/c.js`, `src/d.js`, `src/e.js`',
    ].join('\n'));

    // Pass checkFileCount = 1 so only 1 file is checked
    const result = runGsdTools('verify-summary .planning/phases/01-test/01-01-SUMMARY.md --check-count 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.checks.files_created.checked <= 1,
      `Expected checked <= 1, got ${output.checks.files_created.checked}`
    );
  });

  test('reports schema errors for malformed SUMMARY.md frontmatter', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    // Missing required 'phase' and 'plan' fields
    fs.writeFileSync(summaryPath, [
      '---',
      'subsystem: missing-fields',
      '---',
      '# Malformed Summary',
    ].join('\n'));

    const result = runGsdTools('verify-summary .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, false, 'should fail schema validation');
    assert.strictEqual(output.checks.schema_valid, false);
    assert.ok(
      output.errors.some(e => e.includes('Schema error: phase - Invalid input')),
      `Expected phase required error: ${JSON.stringify(output.errors)}`
    );
  });

  test('requires task commits for non-legacy summaries and accepts matching task coverage', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'console.log("app");\n');
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "task 1"', { cwd: tmpDir, stdio: 'pipe' });
    const firstHash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    fs.writeFileSync(path.join(tmpDir, 'src', 'server.js'), 'console.log("server");\n');
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "task 2"', { cwd: tmpDir, stdio: 'pipe' });
    const secondHash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '15-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 15',
      'plan: 01',
      'subsystem: runtime-enforced',
      'tags: [unit]',
      'provides: [runtime]',
      'duration: 10min',
      'completed: 2026-03-20',
      '---',
      '# Summary',
      '',
      'Created: `src/app.js`',
      'Modified: `src/server.js`',
      '',
      '- **Tasks:** 2',
      '',
      '## Task Commits',
      '',
      `- Task 1: ${firstHash}`,
      `- Task 2: ${secondHash}`,
      '',
      '## Self-Check',
      '',
      'All tests pass',
    ].join('\n'));

    const result = runGsdTools('verify-summary .planning/phases/01-test/15-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, true, JSON.stringify(output));
    assert.strictEqual(output.checks.task_commits.required, true);
    assert.strictEqual(output.checks.task_commits.section_present, true);
    assert.strictEqual(output.checks.task_commits.unique, 2);
  });

  test('fails non-legacy summaries without a task commit section', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '15-02-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 15',
      'plan: 02',
      'subsystem: runtime-enforced',
      'tags: [unit]',
      'provides: [runtime]',
      'duration: 5min',
      'completed: 2026-03-20',
      '---',
      '# Summary',
      '',
      '- **Tasks:** 1',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify-summary .planning/phases/01-test/15-02-SUMMARY.md', tmpDir).output);
    assert.strictEqual(output.passed, false);
    assert.ok(output.errors.some(err => err.includes('Missing required ## Task Commits section')));
  });

  test('fails when task commit coverage is below declared task count', () => {
    fs.writeFileSync(path.join(tmpDir, 'task.txt'), 'task\n');
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "one task"', { cwd: tmpDir, stdio: 'pipe' });
    const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '15-03-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 15',
      'plan: 03',
      'subsystem: runtime-enforced',
      'tags: [unit]',
      'provides: [runtime]',
      'duration: 5min',
      'completed: 2026-03-20',
      '---',
      '# Summary',
      '',
      '- **Tasks:** 2',
      '',
      '## Task Commits',
      '',
      `- Task 1: ${hash}`,
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify-summary .planning/phases/01-test/15-03-SUMMARY.md', tmpDir).output);
    assert.strictEqual(output.passed, false);
    assert.ok(output.errors.some(err => err.includes('Task commit coverage mismatch')));
  });

  test('fails when task commits reference hashes that do not exist', () => {
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '15-04-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 15',
      'plan: 04',
      'subsystem: runtime-enforced',
      'tags: [unit]',
      'provides: [runtime]',
      'duration: 5min',
      'completed: 2026-03-20',
      '---',
      '# Summary',
      '',
      '- **Tasks:** 1',
      '',
      '## Task Commits',
      '',
      '- Task 1: abcdef1234567',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify-summary .planning/phases/01-test/15-04-SUMMARY.md', tmpDir).output);
    assert.strictEqual(output.passed, false);
    assert.ok(output.errors.some(err => err.includes('Task commit hashes not found in git history')));
  });

  test('requires structured proof index for phase 71 summaries', () => {
    fs.writeFileSync(path.join(tmpDir, 'task.txt'), 'task\n');
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "task 1"', { cwd: tmpDir, stdio: 'pipe' });
    const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '71-01-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 71',
      'plan: 01',
      'subsystem: truth',
      'tags: [proof]',
      'provides: [proof-chain]',
      'context_artifact_ids: [phase-71-proof]',
      'duration: 5min',
      'completed: 2026-03-27',
      '---',
      '# Summary',
      '',
      '- **Tasks:** 1',
      '',
      '## Task Commits',
      '',
      `- Task 1: ${hash}`,
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify-summary .planning/phases/01-test/71-01-SUMMARY.md', tmpDir).output);
    assert.strictEqual(output.passed, false);
    assert.ok(output.errors.some(err => err.includes('Missing required ## Proof Index section')));
  });

  test('accepts structured proof index for phase 71 summaries', () => {
    fs.writeFileSync(path.join(tmpDir, 'task.txt'), 'task\n');
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "task 1"', { cwd: tmpDir, stdio: 'pipe' });
    const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '71-02-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 71',
      'plan: 02',
      'subsystem: truth',
      'tags: [proof]',
      'provides: [proof-chain]',
      'context_artifact_ids: [phase-71-proof]',
      'duration: 5min',
      'completed: 2026-03-27',
      '---',
      '# Summary',
      '',
      '- **Tasks:** 1',
      '',
      '## Task Commits',
      '',
      `- Task 1: ${hash}`,
      '',
      '## Proof Index',
      '',
      '```json',
      JSON.stringify([
        {
          task: 1,
          canonical_commit: hash,
          files: ['task.txt'],
          verify: 'node --test tests/proof.test.cjs',
          evidence: ['node --test tests/proof.test.cjs'],
          runtime_required: false,
          runtime_proof: [],
        },
      ], null, 2),
      '```',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify-summary .planning/phases/01-test/71-02-SUMMARY.md', tmpDir).output);
    assert.strictEqual(output.passed, true, JSON.stringify(output));
    assert.strictEqual(output.checks.proof_index.required, true);
    assert.strictEqual(output.checks.proof_index.entries, 1);
  });

  test('verify-work-cold-start reports runtime-sensitive summary paths', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'server.js'), 'console.log("server");\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'ui.js'), 'console.log("ui");\n');
    const coldSummary = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    fs.writeFileSync(coldSummary, [
      '---',
      'phase: 01',
      'plan: 01',
      'subsystem: smoke',
      'tags: [uat]',
      'provides: [runtime]',
      'duration: 5min',
      'completed: 2026-03-20',
      '---',
      '# Summary',
      '',
      'Created: `src/server.js`',
      'Modified: `src/ui.js`',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verify-work-cold-start 01', tmpDir).output);
    assert.strictEqual(output.found, true);
    assert.strictEqual(output.needs_cold_start_smoke_test, true);
    assert.deepStrictEqual(output.cold_start_paths, ['src/server.js']);
    assert.deepStrictEqual(output.summary_files, ['.planning/phases/01-test/01-01-SUMMARY.md']);
  });

  test('verify-work-cold-start stays false for non-runtime summaries', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'ui.js'), 'console.log("ui");\n');
    const summaryPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-02-SUMMARY.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'phase: 01',
      'plan: 02',
      'subsystem: ui',
      'tags: [uat]',
      'provides: [ui]',
      'duration: 5min',
      'completed: 2026-03-20',
      '---',
      '# Summary',
      '',
      'Created: `src/ui.js`',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verify-work-cold-start 01', tmpDir).output);
    assert.strictEqual(output.needs_cold_start_smoke_test, false);
    assert.deepStrictEqual(output.cold_start_paths, []);
  });
});

describe('verify verification artifact command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '72-test'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('passes for a hardened verification artifact with direct evidence', () => {
    const verificationPath = path.join(tmpDir, '.planning', 'phases', '72-test', '72-VERIFICATION.md');
    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-test',
      'verified: 2026-03-27T19:00:00Z',
      'status: VALID',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification uses strict statuses | VALID | `get-stuff-done/templates/verification-report.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | VALID | `get-stuff-done/templates/verification-report.md`, `node --test tests/commands.test.cjs` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| None | - | - | - |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[]',
      '```',
      '',
      '## Escalation',
      '',
      '```json',
      '{"required":false,"type":null,"reason":null,"explanation":null,"options":[],"implications":[]}',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"VALID","reason":"All requirements carry direct evidence."}',
      '```',
    ].join('\n'));

    const result = runGsdTools('verify verification-artifact .planning/phases/72-test/72-VERIFICATION.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, JSON.stringify(output));
  });

  test('fails when requirement evidence is summary-only', () => {
    const verificationPath = path.join(tmpDir, '.planning', 'phases', '72-test', '72-VERIFICATION.md');
    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-test',
      'verified: 2026-03-27T19:00:00Z',
      'status: INVALID',
      'score: 0/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification uses strict statuses | INVALID | `72-01-SUMMARY.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | INVALID | `72-01-SUMMARY.md` | direct proof missing |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| None | - | - | - |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Summary-only evidence"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"INVALID","reason":"Summary-only evidence is not proof."}',
      '```',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verification-artifact .planning/phases/72-test/72-VERIFICATION.md', tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('summary-only evidence')));
  });

  test('fails when conditional requirement omits explicit gap details', () => {
    const verificationPath = path.join(tmpDir, '.planning', 'phases', '72-test', '72-VERIFICATION.md');
    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-test',
      'verified: 2026-03-27T19:00:00Z',
      'status: CONDITIONAL',
      'score: 0/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification uses strict statuses | CONDITIONAL | `get-stuff-done/templates/verification-report.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-02 | CONDITIONAL | `get-stuff-done/templates/verification-report.md` |  |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| None | - | - | - |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"CONDITIONAL","reason":"Gap remains open."}',
      '```',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verification-artifact .planning/phases/72-test/72-VERIFICATION.md', tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('missing explicit gap details')));
  });

  test('fails when escalation remains unresolved but final status claims VALID', () => {
    const verificationPath = path.join(tmpDir, '.planning', 'phases', '72-test', '72-VERIFICATION.md');
    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-test',
      'verified: 2026-03-27T19:00:00Z',
      'status: VALID',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification uses strict statuses | VALID | `get-stuff-done/templates/verification-report.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | VALID | `get-stuff-done/templates/verification-report.md` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| None | - | - | - |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[]',
      '```',
      '',
      '## Escalation',
      '',
      '```json',
      '{"required":true,"type":"semantic_ambiguity","reason":"Meaning unresolved","explanation":"Need a human choice","options":["A","B"],"implications":["A narrows scope","B expands proof needs"]}',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"VALID","reason":"Incorrectly marked valid."}',
      '```',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verification-artifact .planning/phases/72-test/72-VERIFICATION.md', tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('Final Status must be CONDITIONAL')));
  });

  test('fails when blocker anti-pattern exists but final status is not INVALID', () => {
    const verificationPath = path.join(tmpDir, '.planning', 'phases', '72-test', '72-VERIFICATION.md');
    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-test',
      'verified: 2026-03-27T19:00:00Z',
      'status: CONDITIONAL',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification uses strict statuses | VALID | `get-stuff-done/templates/verification-report.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | VALID | `get-stuff-done/templates/verification-report.md` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| src/api.js | `return { ok: true }` placeholder | blocker | Placeholder affects execution |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Blocker anti-pattern remains in shipped path"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"CONDITIONAL","reason":"Incorrect downgrade."}',
      '```',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verification-artifact .planning/phases/72-test/72-VERIFICATION.md', tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('Final Status must be INVALID')));
  });

  test('accepts degrader anti-pattern when final status is CONDITIONAL and drift is classified', () => {
    const verificationPath = path.join(tmpDir, '.planning', 'phases', '72-test', '72-VERIFICATION.md');
    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-test',
      'verified: 2026-03-27T19:00:00Z',
      'status: CONDITIONAL',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification uses strict statuses | VALID | `get-stuff-done/templates/verification-report.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-02 | VALID | `get-stuff-done/templates/verification-report.md` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| src/api.js | `// TODO: tighten this check` | degrader | Incomplete but non-blocking |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Non-blocking degrader documented explicitly"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"CONDITIONAL","reason":"Degrader remains open."}',
      '```',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verification-artifact .planning/phases/72-test/72-VERIFICATION.md', tmpDir).output);
    assert.strictEqual(output.valid, true, JSON.stringify(output));
    assert.strictEqual(output.anti_pattern_summary.degraders, true);
    assert.strictEqual(output.anti_pattern_summary.blockers, false);
  });

  test('fails when inconsistency exists but drift analysis does not classify it', () => {
    const verificationPath = path.join(tmpDir, '.planning', 'phases', '72-test', '72-VERIFICATION.md');
    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-test',
      'verified: 2026-03-27T19:00:00Z',
      'status: CONDITIONAL',
      'score: 0/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification uses strict statuses | CONDITIONAL | `get-stuff-done/templates/verification-report.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-02 | CONDITIONAL | `get-stuff-done/templates/verification-report.md` | missing runtime proof |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| None | - | - | - |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"CONDITIONAL","reason":"Gap remains open."}',
      '```',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verification-artifact .planning/phases/72-test/72-VERIFICATION.md', tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('Drift Analysis must classify inconsistencies')));
  });

  test('accepts historical drift findings as non-blocking when current scope remains valid', () => {
    const verificationPath = path.join(tmpDir, '.planning', 'phases', '72-test', '72-VERIFICATION.md');
    fs.writeFileSync(verificationPath, [
      '---',
      'phase: 72-test',
      'verified: 2026-03-27T19:00:00Z',
      'status: VALID',
      'score: 1/1 requirements verified',
      '---',
      '# Phase 72 Verification',
      '',
      '## Observable Truths',
      '',
      '| # | Truth | Status | Evidence |',
      '|---|-------|--------|----------|',
      '| 1 | Verification uses strict statuses | VALID | `get-stuff-done/templates/verification-report.md` |',
      '',
      '## Requirement Coverage',
      '',
      '| Requirement | Status | Evidence | Gap |',
      '|-------------|--------|----------|-----|',
      '| TRUTH-VERIFY-01 | VALID | `get-stuff-done/templates/verification-report.md`, `node --test tests/verify.test.cjs` | - |',
      '',
      '## Anti-Pattern Scan',
      '',
      '| File | Pattern | Classification | Impact |',
      '|------|---------|----------------|--------|',
      '| legacy/old.js | `// TODO: remove` | historical_drift | Out-of-scope legacy finding |',
      '',
      '## Drift Analysis',
      '',
      '```json',
      '[{"type":"verification_drift","description":"Historical out-of-scope TODO retained for visibility only"}]',
      '```',
      '',
      '## Final Status',
      '',
      '```json',
      '{"status":"VALID","reason":"Current-scope requirements are fully evidenced; only historical drift remains."}',
      '```',
    ].join('\n'));

    const output = JSON.parse(runGsdTools('verify verification-artifact .planning/phases/72-test/72-VERIFICATION.md', tmpDir).output);
    assert.strictEqual(output.valid, true, JSON.stringify(output));
    assert.strictEqual(output.anti_pattern_summary.historical_only, true);
    assert.strictEqual(output.anti_pattern_summary.blockers, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify references command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify references command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reports valid when all referenced files exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'console.log("app");\n');
    const filePath = path.join(tmpDir, '.planning', 'phases', '01-test', 'doc.md');
    fs.writeFileSync(filePath, '@src/app.js\n');

    const result = runGsdTools('verify references .planning/phases/01-test/doc.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, `should be valid: ${JSON.stringify(output)}`);
    assert.strictEqual(output.found, 1, `should find 1 file: ${JSON.stringify(output)}`);
  });

  test('reports missing for nonexistent referenced files', () => {
    const filePath = path.join(tmpDir, '.planning', 'phases', '01-test', 'doc.md');
    fs.writeFileSync(filePath, '@src/missing.js\n');

    const result = runGsdTools('verify references .planning/phases/01-test/doc.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false, 'should be invalid');
    assert.ok(
      output.missing.includes('src/missing.js'),
      `Expected missing to include "src/missing.js": ${JSON.stringify(output.missing)}`
    );
  });

  test('detects backtick file paths', () => {
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils', 'helper.js'), 'module.exports = {};\n');
    const filePath = path.join(tmpDir, '.planning', 'phases', '01-test', 'doc.md');
    fs.writeFileSync(filePath, 'See `src/utils/helper.js` for details.\n');

    const result = runGsdTools('verify references .planning/phases/01-test/doc.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.found >= 1, `Expected at least 1 found, got ${output.found}`);
  });

  test('skips backtick template expressions', () => {
    // Template expressions like ${variable} in backtick paths are skipped
    // @-refs with http are processed but not found on disk
    const filePath = path.join(tmpDir, '.planning', 'phases', '01-test', 'doc.md');
    fs.writeFileSync(filePath, '`${variable}/path/file.js`\n');

    const result = runGsdTools('verify references .planning/phases/01-test/doc.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // Template expression is skipped entirely — total should be 0
    assert.strictEqual(output.total, 0, `Expected total 0 (template skipped): ${JSON.stringify(output)}`);
  });

  test('returns error for nonexistent file', () => {
    const result = runGsdTools('verify references .planning/phases/01-test/nonexistent.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, `Expected error field: ${JSON.stringify(output)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify commits command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify commits command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('validates real commit hashes', () => {
    const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    const result = runGsdTools(`verify commits ${hash}`, tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_valid, true, `Expected all_valid true: ${JSON.stringify(output)}`);
    assert.ok(output.valid.includes(hash), `Expected valid to include ${hash}: ${JSON.stringify(output.valid)}`);
  });

  test('reports invalid for fake hashes', () => {
    const result = runGsdTools('verify commits abcdef1234567', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_valid, false, `Expected all_valid false: ${JSON.stringify(output)}`);
    assert.ok(
      output.invalid.includes('abcdef1234567'),
      `Expected invalid to include "abcdef1234567": ${JSON.stringify(output.invalid)}`
    );
  });

  test('handles mixed valid and invalid hashes', () => {
    const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    const result = runGsdTools(`verify commits ${hash} abcdef1234567`, tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid.length, 1, `Expected 1 valid: ${JSON.stringify(output)}`);
    assert.strictEqual(output.invalid.length, 1, `Expected 1 invalid: ${JSON.stringify(output)}`);
    assert.strictEqual(output.all_valid, false, `Expected all_valid false: ${JSON.stringify(output)}`);
  });
});

describe('verify task-commit command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('accepts current HEAD with matching scope', () => {
    fs.writeFileSync(path.join(tmpDir, 'feature.txt'), 'ok\n');
    execSync('git add feature.txt', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "feat(08-02): add feature"', { cwd: tmpDir, stdio: 'pipe' });
    const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    const result = runGsdTools(['verify', 'task-commit', hash, '--scope', '08-02'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, JSON.stringify(output));
    assert.strictEqual(output.is_head, true);
    assert.strictEqual(output.scope_matches, true);
  });

  test('fails when hash is not current HEAD', () => {
    fs.writeFileSync(path.join(tmpDir, 'first.txt'), '1\n');
    execSync('git add first.txt', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "feat(08-02): first task"', { cwd: tmpDir, stdio: 'pipe' });
    const oldHash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    fs.writeFileSync(path.join(tmpDir, 'second.txt'), '2\n');
    execSync('git add second.txt', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "feat(08-02): second task"', { cwd: tmpDir, stdio: 'pipe' });

    const output = JSON.parse(runGsdTools(['verify', 'task-commit', oldHash, '--scope', '08-02'], tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('current HEAD')));
  });

  test('fails when subject scope does not match expected scope', () => {
    fs.writeFileSync(path.join(tmpDir, 'scoped.txt'), 'x\n');
    execSync('git add scoped.txt', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "feat(09-01): scoped task"', { cwd: tmpDir, stdio: 'pipe' });
    const hash = execSync('git rev-parse --short HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    const output = JSON.parse(runGsdTools(['verify', 'task-commit', hash, '--scope', '08-02'], tmpDir).output);
    assert.strictEqual(output.valid, false);
    assert.ok(output.errors.some(err => err.includes('expected scope 08-02')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// commit-task command
// ─────────────────────────────────────────────────────────────────────────────

describe('commit-task command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('commits files, verifies, and returns hash on success', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("hello")\n');
    const result = runGsdTools(
      ['commit-task', 'feat(08-02): add app entry point', '--scope', '08-02', '--files', 'app.js'],
      tmpDir
    );
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, true, JSON.stringify(output));
    assert.strictEqual(output.verified, true, JSON.stringify(output));
    assert.ok(output.hash, 'hash should be present');
    assert.strictEqual(output.scope_matches, true);
    assert.deepStrictEqual(output.errors, []);
  });

  test('exits 1 and returns verified:false when scope does not match commit subject', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("hello")\n');
    const result = runGsdTools(
      ['commit-task', 'feat(09-01): wrong scope', '--scope', '08-02', '--files', 'app.js'],
      tmpDir
    );
    assert.ok(!result.success, 'should exit 1 on scope mismatch');
    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, true);
    assert.strictEqual(output.verified, false);
    assert.ok(output.errors.some(e => e.includes('expected scope 08-02')));
  });

  test('fails when --scope is omitted', () => {
    const result = runGsdTools(
      ['commit-task', 'feat(08-02): add feature', '--files', 'app.js'],
      tmpDir
    );
    assert.ok(!result.success, 'should exit non-zero when scope is missing');
  });

  test('fails when --files is omitted', () => {
    const result = runGsdTools(
      ['commit-task', 'feat(08-02): add feature', '--scope', '08-02'],
      tmpDir
    );
    assert.ok(!result.success, 'should exit non-zero when files are missing');
  });

  test('reports nothing_to_commit when files have no staged changes', () => {
    // File doesn't exist so git add won't fail but commit will have nothing
    fs.writeFileSync(path.join(tmpDir, 'existing.js'), 'same\n');
    execSync('git add existing.js', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "chore: initial"', { cwd: tmpDir, stdio: 'pipe' });
    // Now try to commit with the same file unchanged
    const result = runGsdTools(
      ['commit-task', 'feat(08-02): no change', '--scope', '08-02', '--files', 'existing.js'],
      tmpDir
    );
    // nothing_to_commit exits 1 (same as other verification failures)
    assert.ok(!result.success, 'nothing_to_commit should exit 1');
    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, false);
    assert.ok(output.errors.some(e => e.includes('nothing to commit')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify artifacts command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify artifacts command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  function writePlanWithArtifacts(tmpDir, artifactsYaml) {
    // parseMustHavesBlock expects 4-space indent for block name, 6-space for items, 8-space for keys
    const content = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: [src/app.js]',
      'autonomous: true',
      'must_haves:',
      '    artifacts:',
      ...artifactsYaml.map(line => `      ${line}`),
      '---',
      '',
      '<tasks>',
      '<task type="auto">',
      '  <name>Task 1: Do thing</name>',
      '  <files>src/app.js</files>',
      '  <action>Do it</action>',
      '  <verify><automated>echo ok</automated></verify>',
      '  <done>Done</done>',
      '</task>',
      '</tasks>',
    ].join('\n');
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, content);
  }

  test('passes when all artifacts exist and match criteria', () => {
    writePlanWithArtifacts(tmpDir, [
      '- path: "src/app.js"',
      '  min_lines: 2',
      '  contains: "export"',
    ]);
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'const x = 1;\nexport default x;\nconst y = 2;\n');

    const result = runGsdTools('verify artifacts .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_passed, true, `Expected all_passed true: ${JSON.stringify(output)}`);
  });

  test('reports missing artifact file', () => {
    writePlanWithArtifacts(tmpDir, [
      '- path: "src/nonexistent.js"',
    ]);

    const result = runGsdTools('verify artifacts .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_passed, false, 'Expected all_passed false');
    assert.ok(
      output.artifacts[0].issues.some(i => i.includes('File not found')),
      `Expected "File not found" in issues: ${JSON.stringify(output.artifacts[0].issues)}`
    );
  });

  test('reports insufficient line count', () => {
    writePlanWithArtifacts(tmpDir, [
      '- path: "src/app.js"',
      '  min_lines: 10',
    ]);
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'const x = 1;\n');

    const result = runGsdTools('verify artifacts .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_passed, false, 'Expected all_passed false');
    assert.ok(
      output.artifacts[0].issues.some(i => i.includes('Only') && i.includes('lines, need 10')),
      `Expected line count issue: ${JSON.stringify(output.artifacts[0].issues)}`
    );
  });

  test('reports missing pattern', () => {
    writePlanWithArtifacts(tmpDir, [
      '- path: "src/app.js"',
      '  contains: "module.exports"',
    ]);
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'const x = 1;\n');

    const result = runGsdTools('verify artifacts .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_passed, false, 'Expected all_passed false');
    assert.ok(
      output.artifacts[0].issues.some(i => i.includes('Missing pattern')),
      `Expected "Missing pattern" in issues: ${JSON.stringify(output.artifacts[0].issues)}`
    );
  });

  test('reports missing export', () => {
    writePlanWithArtifacts(tmpDir, [
      '- path: "src/app.js"',
      '  exports:',
      '    - GET',
    ]);
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'const x = 1;\nexport const POST = () => {};\n');

    const result = runGsdTools('verify artifacts .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_passed, false, 'Expected all_passed false');
    assert.ok(
      output.artifacts[0].issues.some(i => i.includes('Missing export')),
      `Expected "Missing export" in issues: ${JSON.stringify(output.artifacts[0].issues)}`
    );
  });

  test('returns error when no artifacts in frontmatter', () => {
    const content = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: [src/app.js]',
      'autonomous: true',
      'must_haves:',
      '  truths:',
      '    - "something is true"',
      '---',
      '',
      '<tasks></tasks>',
    ].join('\n');
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, content);

    const result = runGsdTools('verify artifacts .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, `Expected error field: ${JSON.stringify(output)}`);
    assert.ok(
      output.error.includes('No must_haves.artifacts'),
      `Expected "No must_haves.artifacts" in error: ${output.error}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify key-links command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify key-links command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  function writePlanWithKeyLinks(tmpDir, keyLinksYaml) {
    // parseMustHavesBlock expects 4-space indent for block name, 6-space for items, 8-space for keys
    const content = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: [src/a.js]',
      'autonomous: true',
      'must_haves:',
      '    key_links:',
      ...keyLinksYaml.map(line => `      ${line}`),
      '---',
      '',
      '<tasks>',
      '<task type="auto">',
      '  <name>Task 1: Do thing</name>',
      '  <files>src/a.js</files>',
      '  <action>Do it</action>',
      '  <verify><automated>echo ok</automated></verify>',
      '  <done>Done</done>',
      '</task>',
      '</tasks>',
    ].join('\n');
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, content);
  }

  test('verifies link when pattern found in source', () => {
    writePlanWithKeyLinks(tmpDir, [
      '- from: "src/a.js"',
      '  to: "src/b.js"',
      '  pattern: "import.*b"',
    ]);
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.js'), "import { x } from './b';\n");
    fs.writeFileSync(path.join(tmpDir, 'src', 'b.js'), 'exports.x = 1;\n');

    const result = runGsdTools('verify key-links .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_verified, true, `Expected all_verified true: ${JSON.stringify(output)}`);
  });

  test('verifies link when pattern found in target', () => {
    writePlanWithKeyLinks(tmpDir, [
      '- from: "src/a.js"',
      '  to: "src/b.js"',
      '  pattern: "exports\\.targetFunc"',
    ]);
    // pattern NOT in source, but found in target
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.js'), 'const x = 1;\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'b.js'), 'exports.targetFunc = () => {};\n');

    const result = runGsdTools('verify key-links .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_verified, true, `Expected verified via target: ${JSON.stringify(output)}`);
    assert.ok(
      output.links[0].detail.includes('target'),
      `Expected detail about target: ${output.links[0].detail}`
    );
  });

  test('fails when pattern not found in source or target', () => {
    writePlanWithKeyLinks(tmpDir, [
      '- from: "src/a.js"',
      '  to: "src/b.js"',
      '  pattern: "missingPattern"',
    ]);
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.js'), 'const x = 1;\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'b.js'), 'const y = 2;\n');

    const result = runGsdTools('verify key-links .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_verified, false, `Expected all_verified false: ${JSON.stringify(output)}`);
    assert.strictEqual(output.links[0].verified, false, 'link should not be verified');
  });

  test('verifies link without pattern using string inclusion', () => {
    writePlanWithKeyLinks(tmpDir, [
      '- from: "src/a.js"',
      '  to: "src/b.js"',
    ]);
    // source file contains the 'to' value as a string
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.js'), "const b = require('./src/b.js');\n");
    fs.writeFileSync(path.join(tmpDir, 'src', 'b.js'), 'module.exports = {};\n');

    const result = runGsdTools('verify key-links .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_verified, true, `Expected all_verified true: ${JSON.stringify(output)}`);
    assert.ok(
      output.links[0].detail.includes('Target referenced in source'),
      `Expected "Target referenced in source" in detail: ${output.links[0].detail}`
    );
  });

  test('reports source file not found', () => {
    writePlanWithKeyLinks(tmpDir, [
      '- from: "src/nonexistent.js"',
      '  to: "src/b.js"',
      '  pattern: "something"',
    ]);
    fs.writeFileSync(path.join(tmpDir, 'src', 'b.js'), 'module.exports = {};\n');

    const result = runGsdTools('verify key-links .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.links[0].detail.includes('Source file not found'),
      `Expected "Source file not found" in detail: ${output.links[0].detail}`
    );
  });

  test('returns error when no key_links in frontmatter', () => {
    const content = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: [src/a.js]',
      'autonomous: true',
      'must_haves:',
      '  truths:',
      '    - "something is true"',
      '---',
      '',
      '<tasks></tasks>',
    ].join('\n');
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(planPath, content);

    const result = runGsdTools('verify key-links .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, `Expected error field: ${JSON.stringify(output)}`);
    assert.ok(
      output.error.includes('No must_haves.key_links'),
      `Expected "No must_haves.key_links" in error: ${output.error}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify context-contract command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify context-contract command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('passes when unresolved ambiguities and assumptions stay out of locked decisions', () => {
    const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
    fs.writeFileSync(contextPath, [
      '# Phase 1: Test - Context',
      '',
      '<decisions>',
      '## Implementation Decisions',
      '### Output',
      '- Use JSON output by default.',
      '</decisions>',
      '',
      '<research_cues>',
      '## Research Cues',
      '### Unresolved Ambiguities',
      '- Whether pagination should be automatic.',
      '### Interpreted Assumptions',
      '- Existing API auth can be reused.',
      '</research_cues>',
    ].join('\n'));

    const result = runGsdTools('verify context-contract .planning/phases/01-test/01-CONTEXT.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, `should be valid, errors: ${JSON.stringify(output.errors)}`);
  });

  test('fails when guidance-only items are duplicated in implementation decisions', () => {
    const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
    fs.writeFileSync(contextPath, [
      '# Phase 1: Test - Context',
      '',
      '<decisions>',
      '## Implementation Decisions',
      '### Output',
      '- Existing API auth can be reused.',
      '</decisions>',
      '',
      '<research_cues>',
      '## Research Cues',
      '### Unresolved Ambiguities',
      '- Whether pagination should be automatic.',
      '### Interpreted Assumptions',
      '- Existing API auth can be reused.',
      '</research_cues>',
    ].join('\n'));

    const result = runGsdTools('verify context-contract .planning/phases/01-test/01-CONTEXT.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false, 'should be invalid');
    assert.ok(
      output.errors.some(e => e.includes('Guidance-only item duplicated in Implementation Decisions')),
      `Expected duplication error: ${JSON.stringify(output.errors)}`
    );
  });

  test('fails when plan hardens unresolved ambiguity without assumption/defer markers', () => {
    const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(contextPath, [
      '# Phase 1: Test - Context',
      '',
      '<decisions>',
      '## Implementation Decisions',
      '### Output',
      '- Use JSON output by default.',
      '</decisions>',
      '',
      '<research_cues>',
      '## Research Cues',
      '### Unresolved Ambiguities',
      '- Whether pagination should be automatic.',
      '### Interpreted Assumptions',
      '- Existing API auth can be reused.',
      '</research_cues>',
    ].join('\n'));
    fs.writeFileSync(planPath, [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'autonomous: true',
      'must_haves:',
      '  truths: []',
      '---',
      '',
      'The implementation will assume existing API auth can be reused.',
      'The task also decides whether pagination should be automatic.',
    ].join('\n'));

    const result = runGsdTools('verify context-contract .planning/phases/01-test/01-CONTEXT.md --plan .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false, 'should be invalid');
    assert.ok(
      output.errors.some(e => e.includes('Unresolved ambiguity appears in the plan')),
      `Expected unresolved ambiguity carry-forward error: ${JSON.stringify(output.errors)}`
    );
    assert.ok(
      output.errors.some(e => e.includes('Interpreted assumption appears in the plan')),
      `Expected interpreted assumption carry-forward error: ${JSON.stringify(output.errors)}`
    );
  });

  test('passes when plan carries forward ambiguity as assumption/deferred work', () => {
    const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
    const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
    fs.writeFileSync(contextPath, [
      '# Phase 1: Test - Context',
      '',
      '<decisions>',
      '## Implementation Decisions',
      '### Output',
      '- Use JSON output by default.',
      '</decisions>',
      '',
      '<research_cues>',
      '## Research Cues',
      '### Unresolved Ambiguities',
      '- Whether pagination should be automatic.',
      '### Interpreted Assumptions',
      '- Existing API auth can be reused.',
      '</research_cues>',
    ].join('\n'));
    fs.writeFileSync(planPath, [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'autonomous: true',
      'must_haves:',
      '  truths: []',
      '---',
      '',
      'Open question: Whether pagination should be automatic.',
      'Assumption: Existing API auth can be reused.',
      'Deferred follow-up if either assumption is wrong.',
    ].join('\n'));

    const result = runGsdTools('verify context-contract .planning/phases/01-test/01-CONTEXT.md --plan .planning/phases/01-test/01-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, `should be valid, errors: ${JSON.stringify(output.errors)}`);
  });
});

// GSD-AUTHORITY: 72-02-1:679e25c9e6346459acf2ce39c6b6e08efd82caad72f00a9d863c0cb356b903fe
