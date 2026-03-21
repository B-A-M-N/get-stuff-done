const { z } = require('zod');

const SUPPORTED_PROVIDERS = ['internal', 'claude', 'openai', 'gemini', 'kimi'];

function toList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => typeof item === 'string' ? item.split(/\r?\n+/) : [item])
      .map(item => String(item || '').trim())
      .filter(Boolean);
  }

  if (value === null || value === undefined) {
    return [];
  }

  return String(value)
    .split(/\r?\n+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function uniq(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function normalizeStringList(value) {
  return uniq(toList(value));
}

function buildMetadata(input = {}, options = {}) {
  const narrative = String(input.narrative || options.narrative || '').trim();
  return {
    source: input?.metadata?.source || options.source || 'itl-package',
    provider: input?.metadata?.provider || options.provider,
    generated_at: input?.metadata?.generated_at || options.generated_at || new Date().toISOString(),
    narrative_length: narrative.length,
  };
}

const routeHintSchema = z.enum(['new-project', 'quick']);

const inferenceItemSchema = z.object({
  text: z.string().min(1),
  evidence: z.string().min(1),
  confidence: z.number().min(0).max(1),
  field: z.enum(['goals', 'constraints', 'preferences', 'anti_requirements', 'success_criteria', 'risks']),
});

const interpretationSchema = z.object({
  narrative: z.string(),
  goals: z.array(z.string()),
  constraints: z.array(z.string()),
  preferences: z.array(z.string()),
  anti_requirements: z.array(z.string()),
  success_criteria: z.array(z.string()),
  risks: z.array(z.string()),
  unknowns: z.array(z.string()),
  assumptions: z.array(z.string()),
  inferences: z.array(inferenceItemSchema).default([]),
  route_hint: routeHintSchema,
  project_initialized: z.boolean(),
  metadata: z.object({
    source: z.string().min(1),
    provider: z.enum(SUPPORTED_PROVIDERS).optional(),
    generated_at: z.string().min(1),
    narrative_length: z.number().int().nonnegative(),
  }),
});

const ambiguitySchema = z.object({
  is_ambiguous: z.boolean(),
  severity: z.enum(['low', 'medium', 'high']),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  findings: z.array(z.object({
    type: z.string().min(1),
    severity: z.enum(['low', 'medium', 'high']),
    message: z.string().min(1),
    evidence: z.any().nullable(),
  })),
  requires_escalation: z.boolean().default(false),
});

const lockabilitySchema = z.object({
  lockable: z.boolean(),
  status: z.enum(['lockable', 'guidance-only']),
  findings: z.array(z.object({
    type: z.string().min(1),
    severity: z.enum(['blocker']),
    message: z.string().min(1),
    evidence: z.any().nullable().optional(),
  })),
  summary: z.string().min(1),
});

const providerRequestSchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
}).passthrough();

const resultSchema = z.object({
  narrative: z.string().min(1),
  interpretation: interpretationSchema,
  ambiguity: ambiguitySchema,
  lockability: lockabilitySchema,
  summary: z.string().min(1),
  provider_request: providerRequestSchema,
});

function normalizeInterpretation(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const projectInitialized = options.project_initialized ?? source.project_initialized ?? false;
  const routeHint = source.route_hint || options.route_hint || (projectInitialized ? 'quick' : 'new-project');

  return interpretationSchema.parse({
    narrative: String(source.narrative || options.narrative || '').trim(),
    goals: normalizeStringList(source.goals),
    constraints: normalizeStringList(source.constraints),
    preferences: normalizeStringList(source.preferences),
    anti_requirements: normalizeStringList(source.anti_requirements || source['anti-requirements']),
    success_criteria: normalizeStringList(source.success_criteria || source['success-criteria']),
    risks: normalizeStringList(source.risks),
    unknowns: normalizeStringList(source.unknowns),
    assumptions: normalizeStringList(source.assumptions),
    inferences: Array.isArray(source.inferences) ? source.inferences : [],
    route_hint: routeHint,
    project_initialized: Boolean(projectInitialized),
    metadata: buildMetadata(source, options),
  });
}

function stripBulletPrefix(line) {
  return String(line || '').replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim();
}

function splitNarrative(narrative) {
  return String(narrative || '')
    .split(/\r?\n+/)
    .map(stripBulletPrefix)
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(line => line.trim())
    .filter(Boolean);
}

function pushUnique(target, value) {
  if (!value) return;
  if (!target.some(item => item.toLowerCase() === value.toLowerCase())) {
    target.push(value);
  }
}

function addInference(target, sentence, field, confidence = 0.72) {
  if (!sentence) return;
  if (target.some(item => item.text.toLowerCase() === sentence.toLowerCase() && item.field === field)) {
    return;
  }
  target.push({ text: sentence, evidence: sentence, confidence, field });
}

function inferRouteHint(narrative, projectInitialized) {
  const text = String(narrative || '').toLowerCase();
  if (!projectInitialized) return 'new-project';
  if (/\b(start|new project|from scratch|build an app|build a product|launch)\b/.test(text)) {
    return 'new-project';
  }
  return 'quick';
}

function extractSuccessClause(sentence) {
  const match = sentence.match(/\b(?:so that|in order to)\b\s*(.+)$/i);
  return match ? match[1].trim() : '';
}

function extractIntentFromNarrative(narrative, options = {}) {
  const sentences = splitNarrative(narrative);
  const interpretation = {
    narrative: String(narrative || '').trim(),
    goals: [],
    constraints: [],
    preferences: [],
    anti_requirements: [],
    success_criteria: [],
    risks: [],
    unknowns: [],
    assumptions: [],
    inferences: [],
    route_hint: inferRouteHint(narrative, options.project_initialized),
    project_initialized: Boolean(options.project_initialized),
    metadata: {
      source: 'heuristic-extractor',
      provider: options.provider,
      generated_at: new Date().toISOString(),
    },
  };

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (/\b(want|need|build|create|make|add|implement|ship|launch)\b/.test(lower)) pushUnique(interpretation.goals, sentence);
    if (/\b(must|cannot|can't|without|within|only|at least|no more than|avoid)\b/.test(lower)) pushUnique(interpretation.constraints, sentence);
    if (/\b(prefer|ideally|would rather|like to)\b/.test(lower)) pushUnique(interpretation.preferences, sentence);
    if (/\b(don't want|do not want|should not|must not|avoid|not include|without)\b/.test(lower)) pushUnique(interpretation.anti_requirements, sentence);
    if (/\b(should|success|done when|able to|user can|users can|needs to be able to)\b/.test(lower)) pushUnique(interpretation.success_criteria, sentence);
    if (/\b(risk|concern|worried|afraid|regression|latency|security|breaking)\b/.test(lower)) pushUnique(interpretation.risks, sentence);
    if (/\b(not sure|unsure|unknown|maybe|probably|somehow|something|stuff|whatever|roughly|kind of|sort of|etc\.?|and so on)\b/.test(lower)) pushUnique(interpretation.unknowns, sentence);

    const successClause = extractSuccessClause(sentence);
    if (successClause) pushUnique(interpretation.success_criteria, successClause);
  }

  if (interpretation.goals.length === 0 && sentences[0]) {
    addInference(interpretation.inferences, sentences[0], 'goals', 0.74);
    pushUnique(interpretation.assumptions, 'Primary goal inferred from the opening narrative because no explicit goal sentence was detected.');
  }
  if (interpretation.success_criteria.length === 0) {
    const candidate = sentences.find(sentence => /\b(user|users|team|operator|admin|customer)\b/i.test(sentence));
    if (candidate) addInference(interpretation.inferences, candidate, 'success_criteria', 0.71);
    pushUnique(interpretation.assumptions, 'Success criteria are incomplete and may need clarification before execution.');
  }

  return normalizeInterpretation(interpretation, {
    narrative,
    project_initialized: options.project_initialized,
    route_hint: interpretation.route_hint,
    source: 'heuristic-extractor',
    provider: options.provider,
  });
}

function addFinding(findings, type, severity, message, evidence) {
  findings.push({ type, severity, message, evidence });
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

function hasText(values, pattern) {
  return values.some(value => pattern.test(value.toLowerCase()));
}

function assessAmbiguity(interpretation) {
  const findings = [];
  const searchable = buildSearchableValues(interpretation);
  if ((interpretation.goals || []).length === 0) addFinding(findings, 'missing-goal', 'high', 'No explicit goal was detected.', null);
  if ((interpretation.unknowns || []).length > 0) addFinding(findings, 'vague-language', (interpretation.unknowns || []).length > 1 ? 'high' : 'medium', 'Narrative contains uncertain or vague language.', interpretation.unknowns);

  const contradictionChecks = [
    { type: 'scope-contradiction', severity: 'high', left: /\b(simple|minimal|lightweight)\b/, right: /\b(complex|full-featured|enterprise|everything)\b/, message: 'Narrative mixes minimal-scope and full-scope expectations.' },
    { type: 'deployment-contradiction', severity: 'high', left: /\b(local only|offline only|no cloud)\b/, right: /\b(multi-provider|cloud|hosted|remote api)\b/, message: 'Narrative mixes local-only and hosted/provider-dependent expectations.' },
    { type: 'priority-conflict', severity: 'medium', left: /\b(fast|quickly|asap)\b/, right: /\b(comprehensive|thorough|fully audited|100% coverage)\b/, message: 'Narrative mixes speed-first and completeness-first priorities.' },
  ];

  for (const check of contradictionChecks) {
    if (hasText(searchable, check.left) && hasText(searchable, check.right)) addFinding(findings, check.type, check.severity, check.message, null);
  }

  const ESCALATION_THRESHOLD = 0.20;
  const score = Math.min(1, findings.reduce((total, finding) => total + (finding.severity === 'high' ? 0.55 : 0.25), 0));
  const severity = findings.some(f => f.severity === 'high') ? 'high' : findings.length > 0 ? 'medium' : 'low';
  const finalScore = Number(score.toFixed(2));
  return ambiguitySchema.parse({
    is_ambiguous: severity !== 'low',
    severity,
    score: finalScore,
    confidence: Number(Math.max(0.05, 1 - finalScore).toFixed(2)),
    findings,
    requires_escalation: finalScore > ESCALATION_THRESHOLD,
  });
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

  if (ambiguity.severity === 'high') addFinding(findings, 'ambiguity-gate', 'blocker', 'High ambiguity blocks inferred constraints from becoming lockable invariants.', ambiguity.findings);
  if (inferredCandidates.length === 0) addFinding(findings, 'missing-invariant-candidates', 'blocker', 'No stable inferred constraint candidates were detected.', null);

  const checks = [
    { type: 'preference-not-invariant', pattern: /\b(prefer|ideally|maybe|hopefully|nice to have|would be cool|would be nice)\b/, message: 'Narrative frames potential invariants as preferences or soft wishes.' },
    { type: 'emotional-escalation', pattern: /\b(hate|angry|furious|terrible|awful|broken mess|disaster)\b/, message: 'Emotionally charged language makes the inferred constraint unstable without clarification.' },
    { type: 'underspecified-invariant', pattern: /\b(always|never|must|cannot|can\'t)\b/, message: 'Invariant-style language appears without enough stable supporting detail.', requireSparse: true },
  ];

  for (const check of checks) {
    if (!check.pattern.test(combinedText)) continue;
    if (check.requireSparse && inferredCandidates.length > 1 && ambiguity.severity === 'low') continue;
    addFinding(findings, check.type, 'blocker', check.message, null);
  }

  const sparseNarrative = searchable.length <= 1 || searchable.join(' ').trim().split(/\s+/).length < 10;
  if (sparseNarrative) addFinding(findings, 'sparse-signal', 'blocker', 'Narrative is too sparse to safely lock inferred constraints as invariants.', searchable);

  const status = findings.length === 0 ? 'lockable' : 'guidance-only';
  return lockabilitySchema.parse({
    lockable: status === 'lockable',
    status,
    findings,
    summary: status === 'lockable'
      ? 'Inferred constraints survived the adversarial ambiguity pass.'
      : 'Inferred constraints remain guidance-only until ambiguity and adversarial concerns are resolved.',
  });
}

function renderSection(title, items) {
  if (!items || items.length === 0) return `## ${title}\n- None identified`;
  return `## ${title}\n` + items.map(item => `- ${item}`).join('\n');
}

function renderInferences(inferences) {
  if (!inferences || inferences.length === 0) return '## Inferences\n- None identified';
  return '## Inferences\n' + inferences.map(inf => {
    const pct = Math.round(inf.confidence * 100);
    return `- [${inf.field}, ${pct}% confidence] ${inf.text}\n  _Evidence: "${inf.evidence}"_`;
  }).join('\n');
}

function renderInterpretationSummary(interpretation, ambiguity) {
  const route = interpretation.route_hint === 'new-project' ? '/dostuff:new-project' : '/dostuff:quick';
  const escalationNote = ambiguity.requires_escalation
    ? `**Escalation required** — ambiguity score ${Math.round(ambiguity.score * 100)}% exceeds threshold. Human clarification needed before proceeding.`
    : null;

  const lines = [
    '# Intent Interpretation Summary',
    '',
    `**Suggested route:** ${route}`,
    `**Project initialized:** ${interpretation.project_initialized ? 'Yes' : 'No'}`,
    `**Ambiguity:** ${ambiguity.severity} (confidence ${ambiguity.confidence})`,
  ];

  if (escalationNote) lines.push('', escalationNote);

  lines.push(
    '',
    renderSection('Goals', interpretation.goals),
    '',
    renderSection('Constraints', interpretation.constraints),
    '',
    renderSection('Preferences', interpretation.preferences),
    '',
    renderSection('Anti-Requirements', interpretation.anti_requirements),
    '',
    renderSection('Success Criteria', interpretation.success_criteria),
    '',
    renderSection('Risks', interpretation.risks),
    '',
    renderInferences(interpretation.inferences),
    '',
    renderSection('Unknowns', interpretation.unknowns),
    '',
    renderSection('Assumptions', interpretation.assumptions),
  );

  if (ambiguity.findings.length > 0) {
    lines.push('', '## Ambiguity Findings');
    for (const finding of ambiguity.findings) lines.push(`- [${finding.severity}] ${finding.message}`);
  }
  return lines.join('\n').trim() + '\n';
}

function buildCanonicalPrompt(narrative, projectInitialized) {
  return [
    'Interpret the narrative into the canonical ITL schema.',
    'Return JSON only.',
    `project_initialized=${projectInitialized ? 'true' : 'false'}`,
    '',
    'Narrative:',
    narrative,
  ].join('\n');
}

function pickFirstStringContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstStringContent(item);
      if (picked) return picked;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  return pickFirstStringContent(value.text || value.content || value.output_text || value.arguments || value.result || value.message || value.data || value.parts || value.candidates || value.response);
}

function parseJsonPayload(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function build_provider_request(input_text, context_data = {}) {
  const narrative = String(input_text || '').trim();
  const projectInitialized = Boolean(context_data.project_initialized);
  const provider = context_data.provider || 'internal';
  const prompt = buildCanonicalPrompt(narrative, projectInitialized);
  if (provider === 'claude') return { provider, model: 'claude-sonnet', system: 'Return only JSON matching the canonical ITL schema.', messages: [{ role: 'user', content: prompt }] };
  if (provider === 'openai') return { provider, model: 'gpt-4.1', response_format: { type: 'json_schema', json_schema: { name: 'itl_interpretation', schema: 'canonical-interpretation' } }, messages: [{ role: 'system', content: 'Return only JSON matching the canonical ITL schema.' }, { role: 'user', content: prompt }] };
  if (provider === 'gemini') return { provider, model: 'gemini-2.5-pro', systemInstruction: { parts: [{ text: 'Return only JSON matching the canonical ITL schema.' }] }, generationConfig: { responseMimeType: 'application/json' }, contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  if (provider === 'kimi') return { provider, model: 'kimi-k2', messages: [{ role: 'system', content: 'Return only JSON matching the canonical ITL schema.' }, { role: 'user', content: prompt }] };
  return { provider: 'internal', mode: 'deterministic', narrative, project_initialized: projectInitialized };
}

function normalizeProviderResponse(provider, input_text, context_data = {}) {
  const prepared = {
    narrative: String(input_text || '').trim(),
    project_initialized: Boolean(context_data.project_initialized),
  };
  const response = context_data.provider_response;
  if (response === undefined) {
    return extractIntentFromNarrative(prepared.narrative, { project_initialized: prepared.project_initialized, provider });
  }

  const parsed = parseJsonPayload(response);
  let payload = parsed;
  if (provider === 'claude' && parsed?.content) payload = pickFirstStringContent(parsed.content);
  if ((provider === 'openai' || provider === 'kimi') && parsed?.output_parsed) payload = parsed.output_parsed;
  if ((provider === 'openai' || provider === 'kimi') && parsed?.choices?.[0]?.message?.content) payload = pickFirstStringContent(parsed.choices[0].message.content);
  if ((provider === 'openai' || provider === 'kimi') && parsed?.output?.[0]?.content) payload = pickFirstStringContent(parsed.output[0].content);
  if (provider === 'gemini' && parsed?.candidates?.[0]?.content?.parts) payload = pickFirstStringContent(parsed.candidates[0].content.parts);

  return normalizeInterpretation(parseJsonPayload(payload), {
    narrative: prepared.narrative,
    project_initialized: prepared.project_initialized,
    provider,
    source: provider === 'internal' ? 'heuristic-extractor' : `${provider}-adapter`,
  });
}

function interpret_narrative(input_text, context_data = {}) {
  const narrative = String(input_text || '').trim();
  if (!narrative) throw new Error('input_text is required');
  const provider = context_data.provider || 'internal';
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported ITL provider "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }

  const interpretation = provider === 'internal'
    ? extractIntentFromNarrative(narrative, { project_initialized: Boolean(context_data.project_initialized), provider })
    : normalizeProviderResponse(provider, narrative, context_data);
  const ambiguity = assessAmbiguity(interpretation);
  const lockability = assessInvariantLockability(interpretation, ambiguity);
  const summary = renderInterpretationSummary(interpretation, ambiguity);
  const provider_request = build_provider_request(narrative, context_data);

  return resultSchema.parse({
    narrative,
    interpretation,
    ambiguity,
    lockability,
    summary,
    provider_request,
  });
}

module.exports = {
  interpret_narrative,
  interpretNarrative: interpret_narrative,
  build_provider_request,
  buildProviderRequest: build_provider_request,
  get_supported_providers: () => [...SUPPORTED_PROVIDERS],
  getSupportedProviders: () => [...SUPPORTED_PROVIDERS],
  addInference,
  schemas: {

    interpretation: interpretationSchema,
    inference: inferenceItemSchema,
    ambiguity: ambiguitySchema,
    lockability: lockabilitySchema,
    result: resultSchema,
  },
};
