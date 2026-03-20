const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const pkg = require('../packages/itl');

describe('standalone itl package', () => {
  test('package metadata and type declarations exist', () => {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'packages', 'itl', 'package.json'), 'utf8'));
    assert.strictEqual(pkgJson.name, '@get-stuff-done/itl');
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'packages', 'itl', 'index.d.ts')));
  });

  test('interpret_narrative returns standardized canonical output', () => {
    const result = pkg.interpret_narrative(
      'I want to build a planning assistant. Users should be able to describe goals in plain English.',
      { project_initialized: false }
    );

    assert.strictEqual(result.interpretation.route_hint, 'new-project');
    assert.strictEqual(result.provider_request.provider, 'internal');
    assert.ok(result.summary.includes('Intent Interpretation Summary'));
    assert.ok(Array.isArray(result.ambiguity.findings));
  });
  test('interpret_narrative handles bullet-heavy deterministic narratives', () => {
    const result = pkg.interpret_narrative(
      `- Keep everything local only\n- So that operators can onboard quickly`,
      { project_initialized: false }
    );

    assert.ok(result.interpretation.constraints.includes('Keep everything local only'));
    assert.ok(result.interpretation.success_criteria.includes('operators can onboard quickly'));
  });


  test('standalone package supports provider-aware fixture normalization', () => {
    const result = pkg.interpret_narrative('Ignored because provider fixture is supplied.', {
      provider: 'claude',
      project_initialized: true,
      provider_response: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            narrative: 'Add CSV export to the dashboard.',
            goals: ['Add CSV export to the dashboard.'],
            constraints: [],
            preferences: [],
            anti_requirements: [],
            success_criteria: ['Users can export dashboard data as CSV.'],
            risks: [],
            unknowns: [],
            assumptions: [],
            route_hint: 'quick',
            project_initialized: true,
          }),
        }],
      },
    });

    assert.strictEqual(result.interpretation.metadata.provider, 'claude');
    assert.strictEqual(result.provider_request.provider, 'claude');
    assert.strictEqual(result.interpretation.route_hint, 'quick');
  });

  test('standalone package normalizes newline-delimited string fields from provider payloads', () => {
    const result = pkg.interpret_narrative('Ignored by fixture.', {
      provider: 'openai',
      project_initialized: true,
      provider_response: {
        output_parsed: {
          narrative: 'Launch a new project.',
          goals: 'Launch a new project.\nlaunch a new project.',
          constraints: 'Keep compatibility\nKeep compatibility',
          preferences: '',
          anti_requirements: '',
          success_criteria: 'Users can start quickly.',
          risks: '',
          unknowns: '',
          assumptions: '',
          route_hint: 'new-project',
          project_initialized: true,
        },
      },
    });

    assert.deepStrictEqual(result.interpretation.goals, ['Launch a new project.']);
    assert.deepStrictEqual(result.interpretation.constraints, ['Keep compatibility']);
  });

  test('standalone package exposes provider request builder and provider list', () => {
    const request = pkg.build_provider_request('Add CSV export.', { provider: 'openai', project_initialized: true });
    assert.strictEqual(request.provider, 'openai');
    assert.ok(request.response_format);
    assert.deepStrictEqual(pkg.get_supported_providers(), ['internal', 'claude', 'openai', 'gemini', 'kimi']);
  });

  test('standalone package exposes aliases and canonical schemas', () => {
    assert.strictEqual(typeof pkg.interpretNarrative, 'function');
    assert.strictEqual(typeof pkg.buildProviderRequest, 'function');
    assert.strictEqual(typeof pkg.getSupportedProviders, 'function');
    assert.ok(pkg.schemas.interpretation);
    assert.ok(pkg.schemas.result);
  });

  test('standalone package builds provider-specific requests across all supported providers', () => {
    const claude = pkg.buildProviderRequest('Add CSV export.', { provider: 'claude', project_initialized: true });
    const gemini = pkg.buildProviderRequest('Add CSV export.', { provider: 'gemini', project_initialized: true });
    const kimi = pkg.buildProviderRequest('Add CSV export.', { provider: 'kimi', project_initialized: true });
    const internal = pkg.buildProviderRequest('Add CSV export.', { project_initialized: true });

    assert.strictEqual(claude.provider, 'claude');
    assert.ok(claude.system);
    assert.strictEqual(gemini.provider, 'gemini');
    assert.ok(gemini.contents);
    assert.strictEqual(kimi.provider, 'kimi');
    assert.ok(kimi.messages);
    assert.strictEqual(internal.provider, 'internal');
    assert.strictEqual(internal.mode, 'deterministic');
  });

  test('standalone package handles openai, gemini, and kimi response fixtures', () => {
    const openai = pkg.interpret_narrative('Ignored by fixture.', {
      provider: 'openai',
      project_initialized: false,
      provider_response: {
        output_parsed: {
          narrative: 'Build a planning assistant from scratch.',
          goals: ['Build a planning assistant from scratch.'],
          constraints: [],
          preferences: [],
          anti_requirements: [],
          success_criteria: ['Users can initialize a project from a narrative.'],
          risks: [],
          unknowns: [],
          assumptions: [],
          route_hint: 'new-project',
          project_initialized: false,
        },
      },
    });

    const gemini = pkg.interpret_narrative('Ignored by fixture.', {
      provider: 'gemini',
      project_initialized: true,
      provider_response: {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                narrative: 'Verify the primary user flow first.',
                goals: ['Verify the primary user flow first.'],
                constraints: [],
                preferences: [],
                anti_requirements: [],
                success_criteria: ['Operators can validate the primary flow quickly.'],
                risks: [],
                unknowns: [],
                assumptions: [],
                route_hint: 'quick',
                project_initialized: true,
              }),
            }],
          },
        }],
      },
    });

    const kimi = pkg.interpret_narrative('Ignored by fixture.', {
      provider: 'kimi',
      project_initialized: true,
      provider_response: {
        choices: [{
          message: {
            content: JSON.stringify({
              narrative: 'Discuss the phase and keep scope tight.',
              goals: ['Discuss the phase and keep scope tight.'],
              constraints: [],
              preferences: [],
              anti_requirements: [],
              success_criteria: ['The phase discussion stays focused.'],
              risks: [],
              unknowns: [],
              assumptions: [],
              route_hint: 'quick',
              project_initialized: true,
            }),
          },
        }],
      },
    });

    assert.strictEqual(openai.interpretation.metadata.provider, 'openai');
    assert.strictEqual(gemini.interpretation.metadata.provider, 'gemini');
    assert.strictEqual(kimi.interpretation.metadata.provider, 'kimi');
    assert.strictEqual(openai.interpretation.route_hint, 'new-project');
  });

  test('standalone package uses deterministic provider fallback and renders ambiguity findings', () => {
    const result = pkg.interpret_narrative(
      'Maybe build something somehow. I need this done quickly, but it also has to be comprehensive with 100% coverage and fully audited.',
      { provider: 'openai', project_initialized: true }
    );

    assert.strictEqual(result.interpretation.metadata.provider, 'openai');
    assert.ok(result.summary.includes('## Ambiguity Findings'));
    assert.ok(result.ambiguity.findings.length > 0);
  });

  test('standalone package infers new-project route for launch-style narratives in initialized projects', () => {
    const result = pkg.interpret_narrative('Launch a new project for operators.', {
      project_initialized: true,
    });

    assert.strictEqual(result.interpretation.route_hint, 'new-project');
  });

  test('standalone package records assumptions when explicit goals are missing', () => {
    const result = pkg.interpret_narrative('Maybe soon. Probably lightweight.', {
      project_initialized: false,
    });

    assert.ok(result.interpretation.assumptions.length > 0);
  });

  test('standalone package tolerates empty provider text arrays through canonical fallback', () => {
    const result = pkg.interpret_narrative('Build a thing.', {
      provider: 'claude',
      project_initialized: false,
      provider_response: {
        content: [{ type: 'tool_use' }],
      },
    });

    assert.strictEqual(result.interpretation.metadata.provider, 'claude');
    assert.deepStrictEqual(result.interpretation.goals, []);
    assert.strictEqual(result.interpretation.route_hint, 'new-project');
  });

  test('standalone package rejects empty input and unsupported providers', () => {
    assert.throws(() => pkg.interpret_narrative('   '), /input_text is required/);
    assert.throws(() => pkg.interpret_narrative('Build a thing.', { provider: 'bogus' }), /Unsupported ITL provider/);
  });
});
