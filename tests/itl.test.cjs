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
  parseAdversarialChallenge,
  parseLockability,
  parseInitializationSeed,
} = require('../get-stuff-done/bin/lib/itl-schema.cjs');
const {
  validateAdapter,
  buildAdversarialRequest,
  buildProviderRequest,
  getDefaultInterpretationAdapter,
  getInterpretationAdapter,
  getSupportedProviders,
  interpretNarrativeWithAdapter,
  challengeInterpretationWithAdapter,
} = require('../get-stuff-done/bin/lib/itl-adapters.cjs');
const { extractIntentFromNarrative } = require('../get-stuff-done/bin/lib/itl-extract.cjs');
const { assessAmbiguity, assessInvariantLockability, auditInferences, ESCALATION_THRESHOLD } = require('../get-stuff-done/bin/lib/itl-ambiguity.cjs');
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
      adversarial: parseAdversarialChallenge({
        summary: 'No model challenge requested.',
        findings: [],
        requires_escalation: false,
      }),
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
      clarification: {
        mode: 'none',
        resume_allowed: true,
        pause_if_unresolved: false,
        reason: 'No clarification checkpoint is required.',
        unresolved_risk: 'Unresolved items can stay visible as guidance and be revisited during structured discussion.',
        prompts: [],
      },
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
  test('default adapter preserves bullet narratives and emits conservative inferences', () => {
    const interpretation = interpretNarrativeWithAdapter({
      narrative: `- Keep setup local only\n- So that users can onboard quickly`,
      project_initialized: false,
    }, getDefaultInterpretationAdapter());

    assert.ok(interpretation.constraints.includes('Keep setup local only'));
    assert.ok(interpretation.success_criteria.includes('users can onboard quickly'));
    assert.ok(Array.isArray(interpretation.inferences));
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

  test('provider adapters build adversarial request payloads', () => {
    const input = {
      narrative: 'Add CSV export to the dashboard.',
      project_initialized: true,
      interpretation: normalizeInterpretation({
        narrative: 'Add CSV export to the dashboard.',
        goals: ['Add CSV export to the dashboard.'],
        success_criteria: ['Users can export dashboard data as CSV.'],
      }, { project_initialized: true }),
    };

    const claudeRequest = buildAdversarialRequest(input, 'claude');
    const openaiRequest = buildAdversarialRequest(input, 'openai');
    const geminiRequest = buildAdversarialRequest(input, 'gemini');
    const kimiRequest = buildAdversarialRequest(input, 'kimi');

    assert.strictEqual(claudeRequest.provider, 'claude');
    assert.ok(String(claudeRequest.messages[0].content).includes('CHALLENGE the interpretation'));
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


  test('provider adapters normalize adversarial challenge responses through the challenge schema', () => {
    const interpretation = normalizeInterpretation({
      narrative: 'I need a database.',
      goals: ['I need a database.'],
    }, { project_initialized: true });

    const claudeChallenge = challengeInterpretationWithAdapter({
      narrative: 'I need a database.',
      interpretation,
      project_initialized: true,
      provider_response: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: 'The interpretation overreaches.',
            findings: [{
              type: 'unsupported-technology',
              severity: 'high',
              message: 'The interpretation should not lock to PostgreSQL.',
              evidence: 'database',
              target_field: 'constraints',
              suggested_action: 'downgrade-to-unknown',
            }],
            requires_escalation: true,
          }),
        }],
      },
    }, getInterpretationAdapter('claude'));

    assert.strictEqual(claudeChallenge.requires_escalation, true);
    assert.strictEqual(claudeChallenge.findings[0].type, 'unsupported-technology');
  });

  test('adversarial challenge parser rejects malformed model challenge payloads', () => {
    const interpretation = normalizeInterpretation({
      narrative: 'I need a database.',
      goals: ['I need a database.'],
    }, { project_initialized: true });

    assert.throws(() => challengeInterpretationWithAdapter({
      narrative: 'I need a database.',
      interpretation,
      project_initialized: true,
      provider_response: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [{
              type: 'unsupported-technology',
              severity: 'critical',
              message: 'Bad severity should fail.',
              evidence: 'database',
            }],
          }),
        }],
      },
    }, getInterpretationAdapter('claude')), ZodError);
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


  test('itl interpret includes a default adversarial report when no model challenge is requested', () => {
    const output = buildInterpretationResult(tmpDir, {
      text: 'I want to build a narrative-first intake flow.',
      project_initialized: 'true',
    });

    assert.strictEqual(output.adversarial.requires_escalation, false);
    assert.deepStrictEqual(output.adversarial.findings, []);
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
    assert.strictEqual(output.clarification.mode, 'blocking');
    assert.strictEqual(output.clarification.resume_allowed, false);
    assert.strictEqual(output.clarification.pause_if_unresolved, true);
    assert.ok(output.clarification_questions.length > 0, 'clarification questions provided');
    assert.ok(output.clarification.prompts.length > 0, 'clarification prompts provided');
  });

  test('initialization seed asks for a primary goal when no explicit goal is detected', () => {
    const output = buildInitializationSeed(tmpDir, {
      text: 'Maybe ideally soon.',
    });

    assert.strictEqual(output.needs_clarification, true);
    assert.strictEqual(output.clarification.mode, 'blocking');
    assert.ok(output.clarification_questions.includes('What is the single most important outcome you want this project to deliver first?'));
    assert.ok(output.clarification.prompts.some(prompt => prompt.question.includes('single most important outcome')));
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
      text: 'I want this phase to make the workflow feel smoother, but I am not sure which interaction matters most yet.',
    });

    assert.strictEqual(output.needs_clarification, false);
    assert.strictEqual(output.clarification.mode, 'recommended');
    assert.strictEqual(output.clarification.resume_allowed, true);
    assert.ok(output.clarification_questions.length > 0, 'clarification questions provided');
  });

  test('discuss seed asks a scope tradeoff question for contradictory scope narratives', () => {
    const output = buildDiscussPhaseSeed(tmpDir, {
      text: 'Keep the first version lightweight but also make it everything the team might ever need.',
    });

    assert.strictEqual(output.needs_clarification, true);
    assert.strictEqual(output.clarification.mode, 'blocking');
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
    assert.strictEqual(output.clarification.mode, 'blocking');
    assert.ok(output.clarification_questions.length > 0, 'clarification questions provided');
  });

  test('verification seed requires clarification when speed and completeness conflict', () => {
    const output = buildVerificationSeed(tmpDir, {
      text: 'I need this shipped quickly, but it also has to be comprehensive with 100% coverage and fully audited.',
    });

    assert.strictEqual(output.needs_clarification, true);
    assert.strictEqual(output.clarification.mode, 'required');
    assert.strictEqual(output.clarification.resume_allowed, false);
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

  test('itl-schema exports sub-schemas as individual named exports (SCHEMA-05)', () => {
    const {
      interpretationSchema,
      ambiguitySchema,
      lockabilitySchema,
      clarificationCheckpointSchema,
      clarificationPromptSchema,
      schemas,
    } = require('../get-stuff-done/bin/lib/itl-schema.cjs');

    [interpretationSchema, ambiguitySchema, lockabilitySchema, clarificationCheckpointSchema, clarificationPromptSchema].forEach((schema, i) => {
      assert.ok(schema != null, `schema at index ${i} should not be null`);
      assert.ok(typeof schema.safeParse === 'function', `schema at index ${i} should have safeParse`);
    });

    assert.ok(schemas.clarificationPromptSchema != null, 'schemas.clarificationPromptSchema should be in schemas namespace');
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

describe('ITL inference schema', () => {
  test('interpretation schema accepts valid inferences array', () => {
    const result = normalizeInterpretation({
      narrative: 'I need a login page.',
      goals: ['I need a login page.'],
      inferences: [
        {
          text: 'Authentication state must be managed across sessions.',
          evidence: 'login page',
          confidence: 0.85,
          field: 'constraints',
        },
      ],
    }, { project_initialized: true });

    assert.strictEqual(result.inferences.length, 1);
    assert.strictEqual(result.inferences[0].field, 'constraints');
    assert.strictEqual(result.inferences[0].confidence, 0.85);
  });

  test('interpretation schema defaults inferences to empty array when absent', () => {
    const result = normalizeInterpretation({
      narrative: 'Add CSV export.',
      goals: ['Add CSV export.'],
    }, { project_initialized: true });

    assert.deepStrictEqual(result.inferences, []);
  });

  test('inference item schema rejects missing evidence', () => {
    assert.throws(() => normalizeInterpretation({
      narrative: 'Build a thing.',
      goals: ['Build a thing.'],
      inferences: [{ text: 'Some inference.', confidence: 0.9, field: 'constraints' }],
    }, { project_initialized: true }), ZodError);
  });

  test('inference item schema rejects confidence out of range', () => {
    assert.throws(() => normalizeInterpretation({
      narrative: 'Build a thing.',
      goals: [],
      inferences: [{ text: 'Some inference.', evidence: 'thing', confidence: 1.5, field: 'goals' }],
    }, { project_initialized: false }), ZodError);
  });

  test('inference item schema rejects invalid field enum', () => {
    assert.throws(() => normalizeInterpretation({
      narrative: 'Build a thing.',
      goals: [],
      inferences: [{ text: 'Some inference.', evidence: 'thing', confidence: 0.8, field: 'unknowns' }],
    }, { project_initialized: false }), ZodError);
  });
});

describe('ITL adversarial inference audit', () => {
  test('auditInferences returns empty findings for valid inferences with traceable evidence', () => {
    const interpretation = normalizeInterpretation({
      narrative: 'I need a login page that works on mobile.',
      goals: ['I need a login page that works on mobile.'],
      inferences: [
        {
          text: 'Mobile viewport support is required.',
          evidence: 'works on mobile',
          confidence: 0.9,
          field: 'constraints',
        },
      ],
    }, { project_initialized: true });

    const findings = auditInferences(interpretation);
    assert.deepStrictEqual(findings, []);
  });

  test('auditInferences flags evidence not present in narrative', () => {
    const interpretation = normalizeInterpretation({
      narrative: 'Build a dashboard.',
      goals: ['Build a dashboard.'],
      inferences: [
        {
          text: 'Users must be able to export data.',
          evidence: 'export functionality',
          confidence: 0.8,
          field: 'success_criteria',
        },
      ],
    }, { project_initialized: true });

    const findings = auditInferences(interpretation);
    assert.ok(findings.some(f => f.type === 'evidence-not-in-narrative'));
    assert.ok(findings.some(f => f.severity === 'high'));
  });

  test('auditInferences flags specificity hallucination for technology not in narrative', () => {
    const interpretation = normalizeInterpretation({
      narrative: 'I need a database to store user records.',
      goals: ['I need a database to store user records.'],
      inferences: [
        {
          text: 'PostgreSQL should be used for the database.',
          evidence: 'database',
          confidence: 0.8,
          field: 'constraints',
        },
      ],
    }, { project_initialized: true });

    const findings = auditInferences(interpretation);
    assert.ok(findings.some(f => f.type === 'specificity-hallucination'));
  });

  test('auditInferences flags low-confidence inferences that should be unknowns', () => {
    const interpretation = normalizeInterpretation({
      narrative: 'Build something for the team.',
      goals: ['Build something for the team.'],
      inferences: [
        {
          text: 'The team has five or more members.',
          evidence: 'team',
          confidence: 0.3,
          field: 'constraints',
        },
      ],
    }, { project_initialized: true });

    const findings = auditInferences(interpretation);
    assert.ok(findings.some(f => f.type === 'low-confidence-inference'));
  });

  test('adversarial findings propagate into ambiguity via buildInterpretationResult', () => {
    const tmpDir = require('./helpers.cjs').createTempProject();
    try {
      const result = buildInterpretationResult(tmpDir, {
        text: 'I need a database.',
        project_initialized: 'true',
        provider_response: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              narrative: 'I need a database.',
              goals: ['I need a database.'],
              constraints: [],
              preferences: [],
              anti_requirements: [],
              success_criteria: [],
              risks: [],
              unknowns: [],
              assumptions: [],
              inferences: [{
                text: 'PostgreSQL should be used.',
                evidence: 'fabricated evidence not in narrative',
                confidence: 0.85,
                field: 'constraints',
              }],
              route_hint: 'quick',
              project_initialized: true,
            }),
          }],
        },
        provider: 'claude',
      });

      assert.ok(result.ambiguity.findings.some(f => f.type === 'evidence-not-in-narrative' || f.type === 'specificity-hallucination'));
      assert.strictEqual(result.ambiguity.requires_escalation, true);
    } finally {
      require('./helpers.cjs').cleanup(tmpDir);
    }
  });


  test('model adversarial findings propagate into ambiguity without rewriting the interpretation', () => {
    const tmpDir = require('./helpers.cjs').createTempProject();
    try {
      const result = buildInterpretationResult(tmpDir, {
        text: 'I need a database.',
        project_initialized: 'true',
        provider_response: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              narrative: 'I need a database.',
              goals: ['I need a database.'],
              constraints: [],
              preferences: [],
              anti_requirements: [],
              success_criteria: [],
              risks: [],
              unknowns: [],
              assumptions: [],
              inferences: [],
              route_hint: 'quick',
              project_initialized: true,
            }),
          }],
        },
        provider: 'claude',
        adversarial_provider: 'claude',
        adversarial_provider_response: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              summary: 'The interpretation should stay generic.',
              findings: [{
                type: 'missing-unknown',
                severity: 'medium',
                message: 'The database type is unspecified and should remain unresolved.',
                evidence: 'database',
                target_field: 'constraints',
                suggested_action: 'request-clarification',
              }],
              requires_escalation: true,
            }),
          }],
        },
      });

      assert.strictEqual(result.adversarial.requires_escalation, true);
      assert.ok(result.ambiguity.findings.some(f => f.type === 'model-missing-unknown'));
      assert.deepStrictEqual(result.interpretation.constraints, []);
      assert.strictEqual(result.ambiguity.requires_escalation, true);
    } finally {
      require('./helpers.cjs').cleanup(tmpDir);
    }
  });
});

describe('ITL ambiguity escalation threshold', () => {
  test('ESCALATION_THRESHOLD is 0.20', () => {
    assert.strictEqual(ESCALATION_THRESHOLD, 0.20);
  });

  test('clean narrative with no findings does not require escalation', () => {
    const interpretation = extractIntentFromNarrative(
      'I want to add CSV export to the dashboard. Users should be able to download their data.',
      { project_initialized: true }
    );
    const ambiguity = assessAmbiguity(interpretation);

    assert.strictEqual(ambiguity.requires_escalation, false);
  });

  test('any medium or high finding triggers escalation', () => {
    const interpretation = extractIntentFromNarrative(
      'I need this done quickly, but it also has to be comprehensive with 100% coverage.',
      { project_initialized: true }
    );
    const ambiguity = assessAmbiguity(interpretation);

    assert.ok(ambiguity.score > ESCALATION_THRESHOLD);
    assert.strictEqual(ambiguity.requires_escalation, true);
  });

  test('requires_escalation surfaces in summary when threshold exceeded', () => {
    const interpretation = extractIntentFromNarrative(
      'Maybe build something somehow.',
      { project_initialized: true }
    );
    const ambiguity = assessAmbiguity(interpretation);
    const summary = renderInterpretationSummary(interpretation, ambiguity);

    assert.strictEqual(ambiguity.requires_escalation, true);
    assert.ok(summary.includes('Escalation required'));
  });

  test('requires_escalation is false and not shown in summary for unambiguous narratives', () => {
    const interpretation = extractIntentFromNarrative(
      'Add a CSV export button to the reporting page. Users should be able to download the current view as a CSV file.',
      { project_initialized: true }
    );
    const ambiguity = assessAmbiguity(interpretation);
    const summary = renderInterpretationSummary(interpretation, ambiguity);

    assert.strictEqual(ambiguity.requires_escalation, false);
    assert.ok(!summary.includes('Escalation required'));
  });
});
