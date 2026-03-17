/**
 * ITL — command surface for narrative interpretation and audit access.
 */

const fs = require('fs');
const path = require('path');
const { output, error } = require('./core.cjs');
const { buildProviderRequest, getInterpretationAdapter, interpretNarrativeWithAdapter } = require('./itl-adapters.cjs');
const { assessAmbiguity, assessInvariantLockability } = require('./itl-ambiguity.cjs');
const { renderInterpretationSummary } = require('./itl-summary.cjs');
const { recordInterpretation, getLatestInterpretation } = require('./itl-audit.cjs');
const {
  parseAmbiguity,
  parseLockability,
  parseInterpretationResult,
  parseInitializationSeed,
  parseDiscussPhaseSeed,
  parseVerificationSeed,
} = require('./itl-schema.cjs');

function getProjectInitialized(cwd, explicitValue) {
  if (explicitValue === 'true') return true;
  if (explicitValue === 'false') return false;
  return fs.existsSync(path.join(cwd, '.planning', 'PROJECT.md'));
}

function buildInterpretationResult(cwd, options) {
  const narrative = String(options.text || '').trim();
  if (!narrative) {
    error('narrative text required for itl interpret');
  }

  const projectInitialized = getProjectInitialized(cwd, options.project_initialized);
  const provider = options.provider || 'internal';
  const adapter = getInterpretationAdapter(provider);
  const ambientContext = options.ambient_context || null;

  const interpretation = interpretNarrativeWithAdapter({
    narrative,
    project_initialized: projectInitialized,
    provider_response: options.provider_response,
    ambient_context: ambientContext,
  }, options.adapter || adapter);
  const ambiguity = parseAmbiguity(assessAmbiguity(interpretation));
  const lockability = parseLockability(assessInvariantLockability(interpretation, ambiguity));
  const summary = renderInterpretationSummary(interpretation, ambiguity);
  const provider_request = buildProviderRequest({
    narrative,
    project_initialized: projectInitialized,
  }, provider);
  const audit = recordInterpretation(cwd, {
    narrative,
    interpretation,
    ambiguity,
    summary,
  });

  const result = parseInterpretationResult({
    narrative,
    interpretation,
    ambiguity,
    lockability,
    summary,
    provider_request,
    audit,
  });

  if (options.phase) {
    persistItlOutput(cwd, options.phase, result);
  }

  return result;
}

/**
 * Persist ITL result to phase-specific JSON file.
 */
function persistItlOutput(cwd, phaseNumber, itlResult) {
  if (!phaseNumber) return null;

  const paddedPhase = String(phaseNumber).padStart(2, '0');
  const planningDir = path.join(cwd, '.planning');
  const phasesDir = path.join(planningDir, 'phases');

  if (!fs.existsSync(phasesDir)) return null;

  const phaseDir = fs.readdirSync(phasesDir).find(d => d.startsWith(paddedPhase));
  if (!phaseDir) return null;

  const targetPath = path.join(phasesDir, phaseDir, `${paddedPhase}-ITL.json`);
  fs.writeFileSync(targetPath, JSON.stringify(itlResult, null, 2), 'utf-8');
  return targetPath;
}

function buildClarificationQuestions(ambiguity, ambientContext) {
  const findings = Array.isArray(ambiguity?.findings) ? ambiguity.findings : [];
  return findings
    .filter(finding => finding.severity === 'high' || finding.severity === 'medium')
    .map(finding => {
      if (finding.type === 'missing-goal') {
        const projectGoals = ambientContext?.project_goals || [];
        if (projectGoals.length > 0) {
          return `Your project goal is "${projectGoals[0]}". Does this apply to this phase, or do you have a specific phase-level outcome in mind?`;
        }
        return 'What is the single most important outcome you want this project to deliver first?';
      }
      if (finding.type === 'vague-language') {
        return 'Which part of the scope is still fuzzy, and what concrete behavior do you want there?';
      }
      if (finding.type === 'scope-contradiction') {
        return 'Should the first version stay intentionally minimal, or are you asking for a broader initial scope?';
      }
      if (finding.type === 'priority-conflict') {
        return 'Which matters more for the first release: shipping quickly or maximizing completeness?';
      }
      return `Clarify this point: ${finding.message}`;
    });
}

function buildClarificationPrompt(finding, ambientContext) {
  if (finding.type === 'missing-goal') {
    const projectGoals = ambientContext?.project_goals || [];
    const question = projectGoals.length > 0
      ? `Your project goal is "${projectGoals[0]}". Does this apply to this phase, or do you have a specific phase-level outcome in mind?`
      : 'What is the single most important outcome you want this to deliver first?';

    const choices = projectGoals.length > 0
      ? [
          { label: 'Use project goal', description: `Anchor this phase to the project goal: ${projectGoals[0]}` },
          { label: 'New phase goal', description: 'Define a specific outcome unique to this phase.' },
        ]
      : [
          { label: 'One concrete outcome', description: 'Anchor the work around one specific deliverable first.' },
          { label: 'Broader direction first', description: 'Clarify the overall direction before locking a first deliverable.' },
        ];

    return {
      finding_type: finding.type,
      severity: finding.severity,
      decision_surface: 'Primary outcome',
      why_this_is_needed: 'The workflow needs a single concrete target before it can write artifacts or pick a safe next step.',
      question,
      choices,
      allow_freeform: true,
    };
  }

  if (finding.type === 'vague-language') {
    return {
      finding_type: finding.type,
      severity: finding.severity,
      decision_surface: 'Concrete behavior',
      why_this_is_needed: 'The current narrative is too fuzzy for the agent to infer the intended behavior safely.',
      question: 'Which part is still fuzzy, and what concrete behavior do you want there?',
      choices: [
        { label: 'Narrow to one behavior', description: 'Pick the single concrete behavior that matters most right now.' },
        { label: 'Keep exploratory', description: 'Stay broad for now and let later discussion refine the details.' },
      ],
      allow_freeform: true,
    };
  }

  if (finding.type === 'scope-contradiction') {
    return {
      finding_type: finding.type,
      severity: finding.severity,
      decision_surface: 'Scope boundary',
      why_this_is_needed: 'The narrative mixes minimal and broad scope, so the workflow cannot safely decide what belongs in this pass.',
      question: 'Should the first version stay intentionally minimal, or are you asking for a broader initial scope?',
      choices: [
        { label: 'Minimal first', description: 'Keep the first pass intentionally narrow and defer extras.' },
        { label: 'Broader first pass', description: 'Include a wider initial scope even if it increases complexity.' },
      ],
      allow_freeform: true,
    };
  }

  if (finding.type === 'priority-conflict') {
    const decisions = ambientContext?.decisions || [];
    const priorityDecision = decisions.find(d => d.summary.toLowerCase().includes('priority') || d.summary.toLowerCase().includes('completeness'));

    return {
      finding_type: finding.type,
      severity: finding.severity,
      decision_surface: 'Release priority',
      why_this_is_needed: priorityDecision
        ? `A prior decision noted: "${priorityDecision.summary}". Confirm if this still holds or if this phase has a different priority.`
        : 'The workflow needs to know whether to optimize for speed or completeness before it can prioritize safely.',
      question: 'Which matters more for the first release: shipping quickly or maximizing completeness?',
      choices: [
        { label: 'Ship quickly', description: 'Bias toward the fastest safe path to a usable release.' },
        { label: 'Maximize completeness', description: 'Bias toward broader coverage before shipping.' },
      ],
      allow_freeform: true,
    };
  }

  if (finding.type === 'deployment-contradiction') {
    return {
      finding_type: finding.type,
      severity: finding.severity,
      decision_surface: 'Deployment model',
      why_this_is_needed: 'Local-only and hosted/provider-connected paths impose different architecture and verification constraints.',
      question: 'Should this stay local-only, or should it integrate with hosted or provider-backed systems?',
      choices: [
        { label: 'Local-only', description: 'Avoid hosted dependencies and keep the first pass entirely local.' },
        { label: 'Hosted/provider-connected', description: 'Allow cloud or provider-backed integration from the start.' },
      ],
      allow_freeform: true,
    };
  }

  return {
    finding_type: finding.type,
    severity: finding.severity,
    decision_surface: 'Clarification checkpoint',
    why_this_is_needed: finding.message,
    question: `Clarify this point: ${finding.message}`,
    choices: [
      { label: 'Confirm the interpretation', description: 'Keep the current interpretation and sharpen it with one detail.' },
      { label: 'Revise the interpretation', description: 'Correct the current interpretation before the workflow continues.' },
    ],
    allow_freeform: true,
  };
}

function buildClarificationCheckpoint(route, ambiguity, ambientContext) {
  const findings = Array.isArray(ambiguity?.findings) ? ambiguity.findings : [];
  const prompts = findings
    .filter(finding => finding.severity === 'high' || finding.severity === 'medium')
    .map(f => buildClarificationPrompt(f, ambientContext));

  const routeRequiresMediumGate = route === '/dostuff:new-project' || route === '/dostuff:verify-work';
  let mode = 'none';

  if (findings.some(finding => finding.severity === 'high')) {
    mode = 'blocking';
  } else if (findings.some(finding => finding.severity === 'medium')) {
    mode = routeRequiresMediumGate ? 'required' : 'recommended';
  }

  const resume_allowed = mode === 'none' || mode === 'recommended';
  const pause_if_unresolved = mode === 'required' || mode === 'blocking';
  const defaultReason = 'No clarification checkpoint is required.';
  const firstFinding = findings[0];

  return {
    mode,
    resume_allowed,
    pause_if_unresolved,
    reason: firstFinding
      ? `Clarification is needed because ${firstFinding.message.toLowerCase()}`
      : defaultReason,
    unresolved_risk: pause_if_unresolved
      ? 'Continuing without resolving this could lock the wrong scope, artifact content, or verification target.'
      : 'Unresolved items can stay visible as guidance and be revisited during structured discussion.',
    prompts,
  };
}

function buildSeedList(primary, fallback, limit = 3) {
  const values = Array.isArray(primary) && primary.length > 0 ? primary : fallback;
  return values.slice(0, limit);
}

function buildGrayAreaHints(interpretation) {
  const hints = [];

  if (interpretation.goals.length > 0 || interpretation.success_criteria.length > 0) {
    hints.push({
      area: 'Primary behavior',
      reason: 'Confirm the user-facing behavior this phase must make feel correct.',
      seeds: buildSeedList(interpretation.success_criteria, interpretation.goals, 2),
    });
  }

  if (interpretation.constraints.length > 0 || interpretation.risks.length > 0) {
    hints.push({
      area: 'Compatibility guardrails',
      reason: 'Clarify what cannot break while the phase changes are introduced.',
      seeds: buildSeedList(interpretation.constraints, interpretation.risks, 2),
    });
  }

  if (interpretation.preferences.length > 0 || interpretation.unknowns.length > 0) {
    hints.push({
      area: 'Interaction and pacing',
      reason: 'Capture how guided, lightweight, or selective the discussion should feel.',
      seeds: buildSeedList(interpretation.preferences, interpretation.unknowns, 2),
    });
  }

  if (interpretation.anti_requirements.length > 0 || interpretation.assumptions.length > 0) {
    hints.push({
      area: 'Scope boundaries',
      reason: 'Separate in-scope decisions from ideas that belong in later phases.',
      seeds: buildSeedList(interpretation.anti_requirements, interpretation.assumptions, 2),
    });
  }

  return hints.slice(0, 4);
}

function buildInitializationSeed(cwd, options) {
  const result = buildInterpretationResult(cwd, {
    ...options,
    project_initialized: 'false',
  });

  const { interpretation, ambiguity } = result;
  const ambientContext = options.ambient_context || null;
  const activeRequirements = buildSeedList(
    interpretation.success_criteria,
    interpretation.goals,
  );
  const clarification = buildClarificationCheckpoint('/dostuff:new-project', ambiguity, ambientContext);

  return parseInitializationSeed({
    ...result,
    route: '/dostuff:new-project',
    needs_clarification: clarification.mode === 'required' || clarification.mode === 'blocking',
    clarification_questions: buildClarificationQuestions(ambiguity, ambientContext),
    clarification,
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
      active: activeRequirements,
      constraints: interpretation.constraints,
      out_of_scope: interpretation.anti_requirements,
      risks: interpretation.risks,
      open_questions: interpretation.unknowns,
    },
  });
}

function buildDiscussPhaseSeed(cwd, options) {
  const result = buildInterpretationResult(cwd, {
    ...options,
    project_initialized: 'true',
  });

  const { interpretation, ambiguity } = result;
  const ambientContext = options.ambient_context || null;
  const summary = renderInterpretationSummary(interpretation, ambiguity, {
    route_override: '/dostuff:discuss-phase',
  });
  const clarification = buildClarificationCheckpoint('/dostuff:discuss-phase', ambiguity, ambientContext);

  return parseDiscussPhaseSeed({
    ...result,
    summary,
    route: '/dostuff:discuss-phase',
    needs_clarification: clarification.mode === 'required' || clarification.mode === 'blocking',
    clarification_questions: buildClarificationQuestions(ambiguity, ambientContext),
    clarification,
    discussion_seed: {
      goals: interpretation.goals,
      constraints: interpretation.constraints,
      preferences: interpretation.preferences,
      success_criteria: interpretation.success_criteria,
      unknowns: interpretation.unknowns,
      risks: interpretation.risks,
      assumptions: interpretation.assumptions,
      out_of_scope: interpretation.anti_requirements,
      gray_area_hints: buildGrayAreaHints(interpretation),
      deferred_ideas: interpretation.anti_requirements,
    },
  });
}

function buildVerificationHints(interpretation) {
  const hints = [];

  const primaryChecks = buildSeedList(
    interpretation.success_criteria,
    interpretation.goals,
    3,
  );

  if (primaryChecks.length > 0) {
    hints.push({
      focus: 'Primary outcomes',
      reason: 'Verify the outcomes the user will care about first.',
      checks: primaryChecks,
    });
  }

  const guardrails = buildSeedList(
    interpretation.constraints,
    interpretation.risks,
    2,
  );

  if (guardrails.length > 0) {
    hints.push({
      focus: 'Regression guardrails',
      reason: 'Check behavior that must not break while validating the new work.',
      checks: guardrails,
    });
  }

  const unknowns = buildSeedList(
    interpretation.unknowns,
    interpretation.assumptions,
    2,
  );

  if (unknowns.length > 0) {
    hints.push({
      focus: 'Clarify uncertain expectations',
      reason: 'Surface areas that may need explicit confirmation during UAT.',
      checks: unknowns,
    });
  }

  return hints.slice(0, 3);
}

function buildVerificationSeed(cwd, options) {
  const result = buildInterpretationResult(cwd, {
    ...options,
    project_initialized: 'true',
  });

  const { interpretation, ambiguity } = result;
  const ambientContext = options.ambient_context || null;
  const summary = renderInterpretationSummary(interpretation, ambiguity, {
    route_override: '/dostuff:verify-work',
  });
  const prioritizedChecks = buildSeedList(
    interpretation.success_criteria,
    interpretation.goals,
    3,
  );
  const clarification = buildClarificationCheckpoint('/dostuff:verify-work', ambiguity, ambientContext);

  return parseVerificationSeed({
    ...result,
    summary,
    route: '/dostuff:verify-work',
    needs_clarification: clarification.mode === 'required' || clarification.mode === 'blocking',
    clarification_questions: buildClarificationQuestions(ambiguity, ambientContext),
    clarification,
    verification_seed: {
      prioritized_checks: prioritizedChecks,
      expected_outcomes: buildSeedList(interpretation.goals, interpretation.success_criteria, 3),
      success_criteria: interpretation.success_criteria,
      constraints: interpretation.constraints,
      risks: interpretation.risks,
      unknowns: interpretation.unknowns,
      assumptions: interpretation.assumptions,
      verification_hints: buildVerificationHints(interpretation),
    },
  });
}

function cmdItlInterpret(cwd, options, raw) {
  const result = buildInterpretationResult(cwd, options);
  output(result, raw, result.summary);
}

function cmdItlInitSeed(cwd, options, raw) {
  const result = buildInitializationSeed(cwd, options);
  output(result, raw, result.summary);
}

function cmdItlDiscussSeed(cwd, options, raw) {
  const result = buildDiscussPhaseSeed(cwd, options);
  output(result, raw, result.summary);
}

function cmdItlVerifySeed(cwd, options, raw) {
  const result = buildVerificationSeed(cwd, options);
  output(result, raw, result.summary);
}

function cmdItlLatest(cwd, raw) {
  const latest = getLatestInterpretation(cwd);
  if (!latest) {
    output({ found: false, error: 'No ITL interpretations recorded yet.' }, raw);
    return;
  }
  output({ found: true, ...latest }, raw);
}

module.exports = {
  buildProviderRequest,
  buildInterpretationResult,
  buildInitializationSeed,
  buildDiscussPhaseSeed,
  buildVerificationSeed,
  buildClarificationPrompt,
  cmdItlInterpret,
  cmdItlInitSeed,
  cmdItlDiscussSeed,
  cmdItlVerifySeed,
  cmdItlLatest,
};
