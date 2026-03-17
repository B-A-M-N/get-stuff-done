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
  const interpretation = interpretNarrativeWithAdapter({
    narrative,
    project_initialized: projectInitialized,
    provider_response: options.provider_response,
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

  return parseInterpretationResult({
    narrative,
    interpretation,
    ambiguity,
    lockability,
    summary,
    provider_request,
    audit,
  });
}

function buildClarificationQuestions(ambiguity) {
  const findings = Array.isArray(ambiguity?.findings) ? ambiguity.findings : [];
  return findings
    .filter(finding => finding.severity === 'high' || finding.severity === 'medium')
    .slice(0, 2)
    .map(finding => {
      if (finding.type === 'missing-goal') {
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
  const activeRequirements = buildSeedList(
    interpretation.success_criteria,
    interpretation.goals,
  );

  return parseInitializationSeed({
    ...result,
    route: '/dostuff:new-project',
    needs_clarification: ambiguity.severity === 'high',
    clarification_questions: buildClarificationQuestions(ambiguity),
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
  const summary = renderInterpretationSummary(interpretation, ambiguity, {
    route_override: '/dostuff:discuss-phase',
  });

  return parseDiscussPhaseSeed({
    ...result,
    summary,
    route: '/dostuff:discuss-phase',
    needs_clarification: ambiguity.severity === 'high',
    clarification_questions: buildClarificationQuestions(ambiguity),
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
  const summary = renderInterpretationSummary(interpretation, ambiguity, {
    route_override: '/dostuff:verify-work',
  });
  const prioritizedChecks = buildSeedList(
    interpretation.success_criteria,
    interpretation.goals,
    3,
  );

  return parseVerificationSeed({
    ...result,
    summary,
    route: '/dostuff:verify-work',
    needs_clarification: ambiguity.severity === 'high',
    clarification_questions: buildClarificationQuestions(ambiguity),
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
  cmdItlInterpret,
  cmdItlInitSeed,
  cmdItlDiscussSeed,
  cmdItlVerifySeed,
  cmdItlLatest,
};
