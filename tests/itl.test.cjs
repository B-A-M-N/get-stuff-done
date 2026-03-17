const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ZodError } = require('zod');
const { createTempProject, cleanup } = require('./helpers.cjs');
const {
  normalizeInterpretation,
  parseInterpretation,
  parseAmbiguity,
  parseLockability,
  parseInitializationSeed,
} = require('../get-stuff-done/bin/lib/itl-schema.cjs');
const {
  validateAdapter,
  buildProviderRequest,
  getDefaultInterpretationAdapter,
  getInterpretationAdapter,
  getSupportedProviders,
  interpretNarrativeWithAdapter,
} = require('../get-stuff-done/bin/lib/itl-adapters.cjs');
const { extractIntentFromNarrative } = require('../get-stuff-done/bin/lib/itl-extract.cjs');
const { assessAmbiguity, assessInvariantLockability } = require('../get-stuff-done/bin/lib/itl-ambiguity.cjs');
const { renderInterpretationSummary } = require('../get-stuff-done/bin/lib/itl-summary.cjs');
const { getAuditDbPath, getLatestInterpretation } = require('../get-stuff-done/bin/lib/itl-audit.cjs');
const { buildInterpretationResult, buildInitializationSeed, buildDiscussPhaseSeed, buildVerificationSeed } = require('../get-stuff-done/bin/lib/itl.cjs');

function withMockedItlModules(overrides, run) {
  const paths = {
    core: require.resolve('../get-stuff-done/bin/lib/core.cjs'),
    ambiguity: require.resolve('../get-stuff-done/bin/lib/itl-ambiguity.cjs'),
  };
  const itlPath = require.resolve('../get-stuff-done/bin/lib/itl.cjs');
  const originals = new Map();

  for (const [key, override] of Object.entries(overrides)) {
    const modulePath = paths[key];
    const original = require.cache[modulePath];
    const base = original ? original.exports : require(modulePath);
    originals.set(modulePath, original);
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports: { ...base, ...override },
    };
  }

  delete require.cache[itlPath];

  try {
    const itl = require(itlPath);
    return run(itl);
  } finally {
    delete require.cache[itlPath];
    for (const [modulePath, original] of originals.entries()) {
      if (original) {
        require.cache[modulePath] = original;
      } else {
        delete require.cache[modulePath];
      }
    }
  }
}

describe('ITL schema', () => {
  test('normalizes multiline and duplicate narrative fields', () => {
    const normalized = normalizeInterpretation({
      narrative: '  Build a planner  ',
      goals: ['First goal\nSecond goal', 'first goal'],
      constraints: 'Keep compatibility\nKeep compatibility',
      preferences: null,
      'anti-requirements': ['No rewrite', 'no rewrite'],
      'success-criteria': 'Ship fast\nShip fast',
      risks: ['Regression risk'],
      unknowns: undefined,
      assumptions: 'Operators will test it',
      metadata: { source: 'manual' },
    }, {
      project_initialized: true,
    });

    assert.deepStrictEqual(normalized.goals, ['First goal', 'Second goal']);
    assert.deepStrictEqual(normalized.constraints, ['Keep compatibility']);
    assert.deepStrictEqual(normalized.preferences, []);
    assert.deepStrictEqual(normalized.anti_requirements, ['No rewrite']);
    assert.deepStrictEqual(normalized.success_criteria, ['Ship fast']);
    assert.deepStrictEqual(normalized.unknowns, []);
    assert.strictEqual(normalized.route_hint, 'quick');
    assert.strictEqual(normalized.project_initialized, true);
    assert.strictEqual(normalized.metadata.source, 'manual');
    assert.strictEqual(normalized.metadata.narrative_length, 'Build a planner'.length);
  });

  test('rejects invalid route hints through canonical parsing', () => {
    assert.throws(() => parseInterpretation({
      narrative: 'Build a thing.',
      goals: ['Build a thing.'],
      constraints: [],
      preferences: [],
      anti_requirements: [],
      success_criteria: [],
      risks: [],
      unknowns: [],
      assumptions: [],
      route_hint: 'verify-work',
      project_initialized: true,
      metadata: {
        source: 'bad-adapter',
        generated_at: new Date().toISOString(),
        narrative_length: 14,
      },
    }), ZodError);
  });

  test('validates ambiguity, lockability, and seed contracts', () => {
    const interpretation = normalizeInterpretation({
      narrative: 'Build a planner.',
      goals: ['Build a planner.'],
      success_criteria: ['Users can create plans.'],
    }, {
      project_initialized: false,
    });
    const ambiguity = parseAmbiguity({
      is_ambiguous: false,
      severity: 'low',
      score: 0,
      confidence: 1,
      findings: [],
    });
    const lockability = parseLockability({
      lockable: false,
      status: 'guidance-only',
      findings: [{
        type: 'sparse-signal',
        severity: 'blocker',
        message: 'Narrative is too sparse.',
      }],
      summary: 'Guidance only.',
    });
    const seed = parseInitializationSeed({
      narrative: interpretation.narrative,
      interpretation,
      ambiguity,
      lockability,
      summary: 'Summary',
      provider_request: {
        provider: 'internal',
        mode: 'deterministic',
      },
      audit: {
        id: 1,
        created_at: new Date().toISOString(),
        db_path: '.planning/itl/audit.sqlite',
      },
      route: '/dostuff:new-project',
      needs_clarification: false,
      clarification_questions: [],
      project_seed: {
        goals: interpretation.goals,
        constraints: interpretation.constraints,
        preferences: interpretation.preferences,
        out_of_scope: interpretation.anti_requirements,
        success_criteria: interpretation.success_criteria,
        risks: interpretation.risks,
        open_questions: interpretation.unknowns,
        assumptions: interpretation.assumptions,
      },
      requirements_seed: {
        active: interpretation.goals,
        constraints: interpretation.constraints,
        out_of_scope: interpretation.anti_requirements,
        risks: interpretation.risks,
        open_questions: interpretation.unknowns,
      },
    });

    assert.strictEqual(seed.route, '/dostuff:new-project');
    assert.strictEqual(lockability.status, 'guidance-only');
    assert.strictEqual(ambiguity.severity, 'low');
  });
});

describe('ITL adapters', () => {
  test('provider registry includes internal, claude, gemini, kimi, and openai', () => {
    assert.deepStrictEqual(getSupportedProviders(), ['internal', 'claude', 'openai', 'gemini', 'kimi']);
  });

  test('default adapter prepares input and preserves canonical interpretation shape', () => {
    const adapter = getDefaultInterpretationAdapter();
    const prepared = adapter.prepareInput({
      narrative: '  Add CSV export to the dashboard.  ',
      project_initialized: true,
    });

    assert.deepStrictEqual(prepared, {
      narrative: 'Add CSV export to the dashboard.',
      project_initialized: true,
      provider_response: undefined,
    });

    const interpretation = interpretNarrativeWithAdapter(prepared, adapter);
    assert.strictEqual(interpretation.metadata.source, 'heuristic-extractor');
    assert.strictEqual(interpretation.route_hint, 'quick');
  });

  test('provider adapters build provider-specific request payloads', () => {
    const input = {
      narrative: 'Add CSV export to the dashboard.',
      project_initialized: true,
    };

    const claudeRequest = buildProviderRequest(input, 'claude');
    const openaiRequest = buildProviderRequest(input, 'openai');
    const geminiRequest = buildProviderRequest(input, 'gemini');
    const kimiRequest = buildProviderRequest(input, 'kimi');

    assert.strictEqual(claudeRequest.provider, 'claude');
    assert.ok(typeof claudeRequest.system === 'string');
    assert.strictEqual(openaiRequest.provider, 'openai');
    assert.ok(openaiRequest.response_format);
    assert.strictEqual(geminiRequest.provider, 'gemini');
    assert.ok(geminiRequest.systemInstruction);
    assert.strictEqual(kimiRequest.provider, 'kimi');
    assert.ok(Array.isArray(kimiRequest.messages));
  });

  test('provider adapters normalize provider-specific responses through the canonical schema', () => {
    const claude = interpretNarrativeWithAdapter({
      narrative: 'Ignored because fixture response is supplied.',
      project_initialized: true,
      provider_response: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            narrative: 'Add CSV export to the dashboard.',
            goals: ['Add CSV export to the dashboard.'],
            constraints: ['It must not break existing exports.'],
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
    }, getInterpretationAdapter('claude'));

    const openai = interpretNarrativeWithAdapter({
      narrative: 'Ignored because fixture response is supplied.',
      project_initialized: false,
      provider_response: {
        choices: [{
          message: {
            content: JSON.stringify({
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
            }),
          },
        }],
      },
    }, getInterpretationAdapter('openai'));

    const gemini = interpretNarrativeWithAdapter({
      narrative: 'Ignored because fixture response is supplied.',
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
    }, getInterpretationAdapter('gemini'));

    const kimi = interpretNarrativeWithAdapter({
      narrative: 'Ignored because fixture response is supplied.',
      project_initialized: true,
      provider_response: {
        output_parsed: {
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
        },
      },
    }, getInterpretationAdapter('kimi'));

    assert.strictEqual(claude.metadata.provider, 'claude');
    assert.strictEqual(openai.metadata.provider, 'openai');
    assert.strictEqual(gemini.metadata.provider, 'gemini');
    assert.strictEqual(kimi.metadata.provider, 'kimi');
    assert.strictEqual(openai.route_hint, 'new-project');
    assert.strictEqual(claude.route_hint, 'quick');
  });

  test('openai-style adapters also normalize output-array payloads', () => {
    const openai = interpretNarrativeWithAdapter({
      narrative: 'Ignored because fixture response is supplied.',
      project_initialized: true,
      provider_response: {
        output: [{
          content: [{
            text: JSON.stringify({
              narrative: 'Keep the dashboard export lightweight.',
              goals: ['Keep the dashboard export lightweight.'],
              constraints: [],
              preferences: [],
              anti_requirements: [],
              success_criteria: ['Users can export data without extra steps.'],
              risks: [],
              unknowns: [],
              assumptions: [],
              route_hint: 'quick',
              project_initialized: true,
            }),
          }],
        }],
      },
    }, getInterpretationAdapter('openai'));

    assert.strictEqual(openai.metadata.provider, 'openai');
    assert.strictEqual(openai.route_hint, 'quick');
  });

  test('provider adapters fall back to deterministic extraction when no provider response is supplied', () => {
    const narrative = 'Add CSV export to the reporting dashboard.';
    const claude = interpretNarrativeWithAdapter({
      narrative,
      project_initialized: true,
    }, getInterpretationAdapter('claude'));
    const openai = interpretNarrativeWithAdapter({
      narrative,
      project_initialized: true,
    }, getInterpretationAdapter('openai'));
    const gemini = interpretNarrativeWithAdapter({
      narrative,
      project_initialized: true,
    }, getInterpretationAdapter('gemini'));
    const kimi = interpretNarrativeWithAdapter({
      narrative,
      project_initialized: true,
    }, getInterpretationAdapter('kimi'));

    assert.strictEqual(claude.metadata.provider, 'claude');
    assert.strictEqual(openai.metadata.provider, 'openai');
    assert.strictEqual(gemini.metadata.provider, 'gemini');
    assert.strictEqual(kimi.metadata.provider, 'kimi');
    assert.strictEqual(claude.route_hint, 'quick');
    assert.strictEqual(openai.route_hint, 'quick');
    assert.strictEqual(gemini.route_hint, 'quick');
    assert.strictEqual(kimi.route_hint, 'quick');
  });

  test('adapter seam rejects malformed adapters and malformed payloads', () => {
    assert.throws(() => validateAdapter(null), /must be an object/);
    assert.throws(() => validateAdapter({ name: '' }), /non-empty name/);
    assert.throws(() => validateAdapter({ name: 'bad-adapter' }), /interpret\(\) function/);

    assert.throws(() => interpretNarrativeWithAdapter({
      narrative: 'Build a thing.',
      project_initialized: false,
    }, {
      name: 'bad-adapter',
      interpret() {
        return {
          narrative: 'Build a thing.',
          route_hint: 'unsupported-route',
        };
      },
    }), ZodError);

    const claudeMalformed = interpretNarrativeWithAdapter({
      narrative: 'Build a thing.',
      project_initialized: false,
      provider_response: {
        content: [{ type: 'tool_use' }],
      },
    }, getInterpretationAdapter('claude'));

    assert.strictEqual(claudeMalformed.metadata.provider, 'claude');
    assert.strictEqual(claudeMalformed.route_hint, 'new-project');
    assert.deepStrictEqual(claudeMalformed.goals, []);

    assert.throws(() => getInterpretationAdapter('bogus-provider'), /Unsupported ITL provider/);
  });
});

describe('ITL extraction', () => {
  test('extracts core narrative categories', () => {
    const interpretation = extractIntentFromNarrative(
      'I want to build a marketplace. It must work without breaking existing planning. I prefer a lightweight first version. Users should be able to describe goals in plain English.'
    );

    assert.ok(interpretation.goals.length > 0, 'goals extracted');
    assert.ok(interpretation.constraints.length > 0, 'constraints extracted');
    assert.ok(interpretation.preferences.length > 0, 'preferences extracted');
    assert.ok(interpretation.success_criteria.length > 0, 'success criteria extracted');
  });

  test('defaults route hint based on project initialization', () => {
    const newProject = extractIntentFromNarrative('Build a new product from scratch.', { project_initialized: false });
    const existingProject = extractIntentFromNarrative('Add CSV export to the dashboard.', { project_initialized: true });

    assert.strictEqual(newProject.route_hint, 'new-project');
    assert.strictEqual(existingProject.route_hint, 'quick');
  });
});

describe('ITL ambiguity', () => {
  test('flags vague language as ambiguous', () => {
    const interpretation = extractIntentFromNarrative('I want something that maybe does stuff somehow.', { project_initialized: true });
    const ambiguity = assessAmbiguity(interpretation);

    assert.strictEqual(ambiguity.is_ambiguous, true);
    assert.ok(ambiguity.findings.some(f => f.type === 'vague-language'));
  });

  test('flags conflicting priorities', () => {
    const interpretation = extractIntentFromNarrative(
      'I need this done quickly, but it also has to be comprehensive with 100% coverage and fully audited.',
      { project_initialized: true }
    );
    const ambiguity = assessAmbiguity(interpretation);

    assert.strictEqual(ambiguity.is_ambiguous, true);
    assert.ok(ambiguity.findings.some(f => f.type === 'priority-conflict'));
  });

  test('adversarial pass keeps preference-like invariant claims as guidance only', () => {
    const interpretation = extractIntentFromNarrative(
      'I would prefer this to always stay simple and maybe never feel bloated.',
      { project_initialized: true }
    );
    const ambiguity = assessAmbiguity(interpretation);
    const lockability = assessInvariantLockability(interpretation, ambiguity);

    assert.strictEqual(lockability.lockable, false);
    assert.ok(lockability.findings.some(f => f.type === 'preference-not-invariant'));
  });

  test('adversarial pass blocks emotionally vague narratives from becoming lockable', () => {
    const interpretation = extractIntentFromNarrative(
      'I hate this broken mess and it must never suck again.',
      { project_initialized: true }
    );
    const ambiguity = assessAmbiguity(interpretation);
    const lockability = assessInvariantLockability(interpretation, ambiguity);

    assert.strictEqual(lockability.lockable, false);
    assert.ok(lockability.findings.some(f => f.type === 'emotional-escalation'));
  });

  test('low ambiguity does not automatically imply lockable invariants', () => {
    const interpretation = extractIntentFromNarrative(
      'Build a dashboard for operators. It must stay fast.',
      { project_initialized: true }
    );
    const ambiguity = assessAmbiguity(interpretation);
    const lockability = assessInvariantLockability(interpretation, ambiguity);

    assert.strictEqual(ambiguity.severity, 'low');
    assert.strictEqual(lockability.lockable, false);
    assert.ok(lockability.findings.some(f => f.type === 'underspecified-invariant' || f.type === 'sparse-signal'));
  });
});

describe('ITL summary', () => {
  test('renders deterministic summary sections', () => {
    const interpretation = extractIntentFromNarrative('I want to add natural language intake. Users can describe goals in plain English.', { project_initialized: true });
    const ambiguity = assessAmbiguity(interpretation);
    const summary = renderInterpretationSummary(interpretation, ambiguity);

    assert.ok(summary.includes('# Intent Interpretation Summary'));
    assert.ok(summary.includes('## Goals'));
    assert.ok(summary.includes('## Success Criteria'));
  });

  test('renders empty sections and route overrides explicitly', () => {
    const summary = renderInterpretationSummary({
      route_hint: 'quick',
      project_initialized: true,
      goals: [],
      constraints: [],
      preferences: [],
      anti_requirements: [],
      success_criteria: [],
      risks: [],
      unknowns: [],
      assumptions: [],
    }, {
      severity: 'low',
      confidence: 0.9,
      findings: [],
    }, {
      route_override: '/dostuff:verify-work',
    });

    assert.ok(summary.includes('**Suggested route:** /dostuff:verify-work'));
    assert.ok(summary.includes('## Goals\n- None identified'));
    assert.ok(!summary.includes('## Ambiguity Findings'));
  });
});

describe('ITL audit and gsd-tools integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('itl interpret creates SQLite audit trail and returns structured output', () => {
    const output = buildInterpretationResult(tmpDir, {
      text: 'I want to build a narrative-first intake flow. It must not break existing commands. Users should be able to explain goals in plain English.',
      project_initialized: 'true',
    });

    assert.strictEqual(output.interpretation.route_hint, 'quick');
    assert.ok(output.summary.includes('Intent Interpretation Summary'));
    assert.ok('lockability' in output, 'lockability result present');
    assert.ok(fs.existsSync(path.join(tmpDir, output.audit.db_path)), 'audit sqlite file should exist');
  });

  test('itl latest returns the most recent interpretation record', () => {
    buildInterpretationResult(tmpDir, {
      text: 'I want to add a lightweight narrative parser.',
      project_initialized: 'true',
    });

    const output = getLatestInterpretation(tmpDir);
    assert.ok(output, 'latest interpretation should exist');
    assert.ok(output.summary.includes('Intent Interpretation Summary'));
  });

  test('itl latest returns null when no interpretation has been recorded yet', () => {
    const latest = getLatestInterpretation(tmpDir);
    assert.strictEqual(latest, null);
  });

  test('audit helper can read back the latest persisted interpretation', () => {
    buildInterpretationResult(tmpDir, {
      text: 'I want to build a new project from scratch, but maybe the exact scope is still unclear.',
      project_initialized: 'false',
    });

    const latest = getLatestInterpretation(tmpDir);
    assert.ok(latest, 'latest interpretation should exist');
    assert.strictEqual(latest.route_hint, 'new-project');
    assert.strictEqual(getAuditDbPath(tmpDir).endsWith(path.join('.planning', 'itl', 'audit.sqlite')), true);
  });

  test('interpretation result falls back to filesystem project detection when explicit flag is omitted', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Existing Project\n');

    const output = buildInterpretationResult(tmpDir, {
      text: 'Add CSV export to the dashboard.',
    });

    assert.strictEqual(output.interpretation.project_initialized, true);
    assert.strictEqual(output.interpretation.route_hint, 'quick');
  });

  test('interpretation result defaults to new-project when no project file exists and no flag is passed', () => {
    const output = buildInterpretationResult(tmpDir, {
      text: 'Build a new project from scratch.',
    });

    assert.strictEqual(output.interpretation.project_initialized, false);
    assert.strictEqual(output.interpretation.route_hint, 'new-project');
  });

  test('initialization seed produces artifact-friendly fields for new projects', () => {
    const output = buildInitializationSeed(tmpDir, {
      text: 'I want to build a narrative-first project bootstrap. It must preserve existing planning rigor. Users should be able to describe goals in plain English.',
    });

    assert.strictEqual(output.interpretation.route_hint, 'new-project');
    assert.strictEqual(output.route, '/dostuff:new-project');
    assert.ok(output.project_seed.goals.length > 0, 'project seed goals are present');
    assert.ok(output.requirements_seed.active.length > 0, 'requirements seed active items are present');
  });

  test('initialization seed requests bounded clarification for high ambiguity', () => {
    const output = buildInitializationSeed(tmpDir, {
      text: 'Maybe I want something somehow. It should be simple but also everything.',
    });

    assert.strictEqual(output.needs_clarification, true);
    assert.ok(output.clarification_questions.length > 0, 'clarification questions provided');
  });

  test('initialization seed asks for a primary goal when no explicit goal is detected', () => {
    const output = buildInitializationSeed(tmpDir, {
      text: 'Maybe ideally soon.',
    });

    assert.strictEqual(output.needs_clarification, true);
    assert.ok(output.clarification_questions.includes('What is the single most important outcome you want this project to deliver first?'));
  });

  test('initialization seed matches the gsd-tools init-seed contract', () => {
    const output = buildInitializationSeed(tmpDir, {
      text: 'I want to build a new planning assistant. Users should be able to describe the outcome in plain English.',
    });

    assert.strictEqual(output.route, '/dostuff:new-project');
    assert.ok(Array.isArray(output.requirements_seed.active));
    assert.ok(output.summary.includes('Intent Interpretation Summary'));
  });

  test('discuss seed produces narrative-first discussion fields for phase intake', () => {
    const output = buildDiscussPhaseSeed(tmpDir, {
      text: 'I want phase discussion to start from a short narrative, keep scope tight, and preserve CONTEXT.md for planning.',
    });

    assert.strictEqual(output.route, '/dostuff:discuss-phase');
    assert.ok(output.summary.includes('/dostuff:discuss-phase'));
    assert.ok(output.discussion_seed.gray_area_hints.length > 0, 'gray area hints are present');
    assert.ok(Array.isArray(output.discussion_seed.deferred_ideas));
  });

  test('discuss seed requests bounded clarification for ambiguous phase narratives', () => {
    const output = buildDiscussPhaseSeed(tmpDir, {
      text: 'Maybe the phase should somehow do stuff, but also everything, without changing anything.',
    });

    assert.strictEqual(output.needs_clarification, true);
    assert.ok(output.clarification_questions.length > 0, 'clarification questions provided');
  });

  test('discuss seed asks a scope tradeoff question for contradictory scope narratives', () => {
    const output = buildDiscussPhaseSeed(tmpDir, {
      text: 'Keep the first version lightweight but also make it everything the team might ever need.',
    });

    assert.strictEqual(output.needs_clarification, true);
    assert.ok(output.clarification_questions.includes('Should the first version stay intentionally minimal, or are you asking for a broader initial scope?'));
  });

  test('verification seed produces narrative-first verification fields', () => {
    const output = buildVerificationSeed(tmpDir, {
      text: 'I want to verify the most important user outcome first and make sure the new flow did not break existing behavior.',
    });

    assert.strictEqual(output.route, '/dostuff:verify-work');
    assert.ok(output.summary.includes('/dostuff:verify-work'));
    assert.ok(output.verification_seed.prioritized_checks.length > 0, 'prioritized checks are present');
    assert.ok(Array.isArray(output.verification_seed.verification_hints));
  });

  test('verification seed requests bounded clarification for ambiguous verification narratives', () => {
    const output = buildVerificationSeed(tmpDir, {
      text: 'Maybe it kind of works somehow, but also everything should be checked at once.',
    });

    assert.strictEqual(output.needs_clarification, true);
    assert.ok(output.clarification_questions.length > 0, 'clarification questions provided');
  });

  test('verification seed asks for a release priority when speed and completeness conflict', () => {
    const output = buildVerificationSeed(tmpDir, {
      text: 'I need this shipped quickly, but it also has to be comprehensive with 100% coverage and fully audited.',
    });

    assert.strictEqual(output.needs_clarification, false);
    assert.ok(output.clarification_questions.includes('Which matters more for the first release: shipping quickly or maximizing completeness?'));
  });
});

describe('ITL command wrappers', () => {
  test('command wrappers emit interpretation payloads through core output', () => {
    const calls = [];
    const tmpDir = createTempProject();

    try {
      withMockedItlModules({
        core: {
          output(result, raw, rawValue) {
            calls.push({ result, raw, rawValue });
          },
          error(message) {
            throw new Error(message);
          },
        },
      }, itl => {
        itl.cmdItlInterpret(tmpDir, {
          text: 'Add CSV export to the reporting dashboard.',
          provider: 'claude',
          provider_response: {
            content: [{
              type: 'text',
              text: JSON.stringify({
                narrative: 'Add CSV export to the reporting dashboard.',
                goals: ['Add CSV export to the reporting dashboard.'],
                constraints: [],
                preferences: [],
                anti_requirements: [],
                success_criteria: ['Users can export the reporting dashboard as CSV.'],
                risks: [],
                unknowns: [],
                assumptions: [],
                route_hint: 'quick',
                project_initialized: true,
              }),
            }],
          },
          project_initialized: 'true',
        }, false);
        itl.cmdItlInitSeed(tmpDir, {
          text: 'Build a new project from scratch with plain English intake.',
        }, true);
        itl.cmdItlDiscussSeed(tmpDir, {
          text: 'Keep this phase focused, guided, and compatible with existing planning.',
        }, false);
        itl.cmdItlVerifySeed(tmpDir, {
          text: 'Verify the primary outcome first without breaking existing behavior.',
        }, true);
      });
    } finally {
      cleanup(tmpDir);
    }

    assert.strictEqual(calls.length, 4);
    assert.strictEqual(calls[0].result.interpretation.route_hint, 'quick');
    assert.strictEqual(calls[0].result.interpretation.metadata.provider, 'claude');
    assert.strictEqual(calls[0].result.provider_request.provider, 'claude');
    assert.ok(calls[1].rawValue.includes('/dostuff:new-project'));
    assert.strictEqual(calls[2].result.route, '/dostuff:discuss-phase');
    assert.ok(calls[3].rawValue.includes('/dostuff:verify-work'));
  });

  test('itl latest wrapper returns explicit found false when no audit rows exist', () => {
    const calls = [];
    const tmpDir = createTempProject();

    try {
      withMockedItlModules({
        core: {
          output(result, raw, rawValue) {
            calls.push({ result, raw, rawValue });
          },
          error(message) {
            throw new Error(message);
          },
        },
      }, itl => {
        itl.cmdItlLatest(tmpDir, false);
      });
    } finally {
      cleanup(tmpDir);
    }

    assert.deepStrictEqual(calls, [{
      result: {
        found: false,
        error: 'No ITL interpretations recorded yet.',
      },
      raw: false,
      rawValue: undefined,
    }]);
  });

  test('itl latest wrapper returns found true with the persisted record payload', () => {
    const calls = [];
    const tmpDir = createTempProject();

    try {
      withMockedItlModules({
        core: {
          output(result, raw, rawValue) {
            calls.push({ result, raw, rawValue });
          },
          error(message) {
            throw new Error(message);
          },
        },
      }, itl => {
        itl.buildInterpretationResult(tmpDir, {
          text: 'Add a stable interpretation history view.',
          project_initialized: 'true',
        });
        itl.cmdItlLatest(tmpDir, false);
      });
    } finally {
      cleanup(tmpDir);
    }

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].result.found, true);
    assert.strictEqual(calls[0].result.route_hint, 'quick');
  });

  test('empty narrative paths still fail through core error', () => {
    const tmpDir = createTempProject();

    try {
      assert.throws(() => withMockedItlModules({
        core: {
          output() {
            throw new Error('output should not be called');
          },
          error(message) {
            throw new Error(message);
          },
        },
      }, itl => {
        itl.buildInterpretationResult(tmpDir, { text: '   ' });
      }), /narrative text required for itl interpret/);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('clarification falls back to raw finding messages for unknown ambiguity types', () => {
    const tmpDir = createTempProject();
    let output;

    try {
      withMockedItlModules({
        ambiguity: {
          assessAmbiguity() {
            return {
              is_ambiguous: true,
              severity: 'high',
              score: 0.8,
              confidence: 0.2,
              findings: [
                {
                  type: 'custom-gap',
                  severity: 'medium',
                  message: 'Need a sharper definition of the migration boundary.',
                },
              ],
            };
          },
          assessInvariantLockability() {
            return {
              lockable: false,
              status: 'guidance-only',
              findings: [],
              summary: 'Guidance only.',
            };
          },
        },
      }, itl => {
        output = itl.buildInitializationSeed(tmpDir, {
          text: 'Plan something unclear.',
        });
      });
    } finally {
      cleanup(tmpDir);
    }

    assert.deepStrictEqual(output.clarification_questions, [
      'Clarify this point: Need a sharper definition of the migration boundary.',
    ]);
  });
});
