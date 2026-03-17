/**
 * ITL Ambiguity — ambiguity scoring helpers for narrative interpretation.
 */

function addFinding(findings, type, severity, message, evidence) {
  findings.push({ type, severity, message, evidence });
}

function hasText(values, pattern) {
  return values.some(value => pattern.test(value.toLowerCase()));
}

function buildSearchableValues(interpretation) {
  return [
    ...(interpretation.goals || []),
    ...(interpretation.constraints || []),
    ...(interpretation.preferences || []),
    ...(interpretation.anti_requirements || []),
    ...(interpretation.success_criteria || []),
    ...(interpretation.risks || []),
    ...(interpretation.unknowns || []),
  ];
}

function assessAmbiguity(interpretation) {
  const findings = [];
  const searchable = buildSearchableValues(interpretation);

  if ((interpretation.goals || []).length === 0) {
    addFinding(findings, 'missing-goal', 'high', 'No explicit goal was detected.', null);
  }

  if ((interpretation.unknowns || []).length > 0) {
    addFinding(
      findings,
      'vague-language',
      (interpretation.unknowns || []).length > 1 ? 'high' : 'medium',
      'Narrative contains uncertain or vague language.',
      interpretation.unknowns
    );
  }

  const contradictionChecks = [
    {
      type: 'scope-contradiction',
      severity: 'high',
      left: /\b(simple|minimal|lightweight)\b/,
      right: /\b(complex|full-featured|enterprise|everything)\b/,
      message: 'Narrative mixes minimal-scope and full-scope expectations.',
    },
    {
      type: 'deployment-contradiction',
      severity: 'high',
      left: /\b(local only|offline only|no cloud)\b/,
      right: /\b(multi-provider|cloud|hosted|remote api)\b/,
      message: 'Narrative mixes local-only and hosted/provider-dependent expectations.',
    },
    {
      type: 'priority-conflict',
      severity: 'medium',
      left: /\b(fast|quickly|asap)\b/,
      right: /\b(comprehensive|thorough|fully audited|100% coverage)\b/,
      message: 'Narrative mixes speed-first and completeness-first priorities.',
    },
  ];

  for (const check of contradictionChecks) {
    if (hasText(searchable, check.left) && hasText(searchable, check.right)) {
      addFinding(findings, check.type, check.severity, check.message, null);
    }
  }

  const score = Math.min(
    1,
    findings.reduce((total, finding) => total + (finding.severity === 'high' ? 0.55 : 0.25), 0)
  );
  const severity = findings.some(f => f.severity === 'high')
    ? 'high'
    : findings.length > 0
      ? 'medium'
      : 'low';

  return {
    is_ambiguous: severity !== 'low',
    severity,
    score: Number(score.toFixed(2)),
    confidence: Number(Math.max(0.05, 1 - score).toFixed(2)),
    findings,
  };
}

function assessInvariantLockability(interpretation, ambiguity = assessAmbiguity(interpretation)) {
  const findings = [];
  const searchable = buildSearchableValues(interpretation);
  const combinedText = searchable.join(' ').toLowerCase();
  const inferredCandidates = [
    ...(interpretation.constraints || []),
    ...(interpretation.success_criteria || []),
    ...(interpretation.risks || []),
  ];

  if (ambiguity.severity === 'high') {
    addFinding(
      findings,
      'ambiguity-gate',
      'blocker',
      'High ambiguity blocks inferred constraints from becoming lockable invariants.',
      ambiguity.findings
    );
  }

  if (inferredCandidates.length === 0) {
    addFinding(
      findings,
      'missing-invariant-candidates',
      'blocker',
      'No stable inferred constraint candidates were detected.',
      null
    );
  }

  const pseudoInvariantChecks = [
    {
      type: 'preference-not-invariant',
      severity: 'blocker',
      pattern: /\b(prefer|ideally|maybe|hopefully|nice to have|would be cool|would be nice)\b/,
      message: 'Narrative frames potential invariants as preferences or soft wishes.',
    },
    {
      type: 'emotional-escalation',
      severity: 'blocker',
      pattern: /\b(hate|angry|furious|terrible|awful|broken mess|disaster)\b/,
      message: 'Emotionally charged language makes the inferred constraint unstable without clarification.',
    },
    {
      type: 'underspecified-invariant',
      severity: 'blocker',
      pattern: /\b(always|never|must|cannot|can\'t)\b/,
      message: 'Invariant-style language appears without enough stable supporting detail.',
      requireSparse: true,
    },
  ];

  for (const check of pseudoInvariantChecks) {
    if (!check.pattern.test(combinedText)) continue;
    if (check.requireSparse && inferredCandidates.length > 1 && ambiguity.severity === 'low') continue;
    addFinding(findings, check.type, check.severity, check.message, null);
  }

  const sparseNarrative = searchable.length <= 1 || searchable.join(' ').trim().split(/\s+/).length < 10;
  if (sparseNarrative) {
    addFinding(
      findings,
      'sparse-signal',
      'blocker',
      'Narrative is too sparse to safely lock inferred constraints as invariants.',
      searchable
    );
  }

  const status = findings.length === 0 ? 'lockable' : 'guidance-only';

  return {
    lockable: status === 'lockable',
    status,
    findings,
    summary: status === 'lockable'
      ? 'Inferred constraints survived the adversarial ambiguity pass.'
      : 'Inferred constraints remain guidance-only until ambiguity and adversarial concerns are resolved.',
  };
}

module.exports = {
  assessAmbiguity,
  assessInvariantLockability,
};
