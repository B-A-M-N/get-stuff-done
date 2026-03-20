/**
 * ITL Schema — canonical Zod-backed schemas for narrative interpretation.
 */

const { z } = require('zod');

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
    source: input?.metadata?.source || options.source || 'itl',
    provider: input?.metadata?.provider || options.provider,
    generated_at: input?.metadata?.generated_at || options.generated_at || new Date().toISOString(),
    narrative_length: narrative.length,
  };
}

const stringListField = z.preprocess(normalizeStringList, z.array(z.string()));
const routeHintSchema = z.enum(['new-project', 'quick']);

const interpretationMetadataSchema = z.object({
  source: z.string().min(1),
  provider: z.enum(['internal', 'claude', 'openai', 'gemini', 'kimi']).optional(),
  generated_at: z.string().min(1),
  narrative_length: z.number().int().nonnegative(),
});

const inferenceFieldSchema = z.enum([
  'goals',
  'constraints',
  'preferences',
  'anti_requirements',
  'success_criteria',
  'risks',
]);

const inferenceItemSchema = z.object({
  text: z.string().min(1),
  evidence: z.string().min(1),
  confidence: z.number().min(0).max(1),
  field: inferenceFieldSchema,
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
  metadata: interpretationMetadataSchema,
});

const ambiguityFindingSchema = z.object({
  type: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  message: z.string().min(1),
  evidence: z.any().nullable(),
});

const ambiguitySchema = z.object({
  is_ambiguous: z.boolean(),
  severity: z.enum(['low', 'medium', 'high']),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  findings: z.array(ambiguityFindingSchema),
  requires_escalation: z.boolean().default(false),
});

const adversarialChallengeFindingSchema = z.object({
  type: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  message: z.string().min(1),
  evidence: z.any().nullable().default(null),
  target_field: inferenceFieldSchema.optional(),
  suggested_action: z.enum([
    'downgrade-to-unknown',
    'remove-unsupported-claim',
    'request-clarification',
    'flag-contradiction',
  ]).optional(),
});

const adversarialChallengeSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(adversarialChallengeFindingSchema).default([]),
  requires_escalation: z.boolean().default(false),
});

const lockabilityFindingSchema = z.object({
  type: z.string().min(1),
  severity: z.enum(['blocker']),
  message: z.string().min(1),
  evidence: z.any().nullable().optional(),
});

const lockabilitySchema = z.object({
  lockable: z.boolean(),
  status: z.enum(['lockable', 'guidance-only']),
  findings: z.array(lockabilityFindingSchema),
  summary: z.string().min(1),
});

const auditRecordSchema = z.object({
  id: z.number().int().positive(),
  created_at: z.string().min(1),
  narrative: z.string().min(1),
  route_hint: routeHintSchema,
  project_initialized: z.boolean(),
  interpretation: interpretationSchema,
  ambiguity: ambiguitySchema,
  summary: z.string().min(1),
  db_path: z.string().min(1),
});

const providerRequestSchema = z.object({
  provider: z.enum(['internal', 'claude', 'openai', 'gemini', 'kimi']),
}).passthrough();

const interpretationResultSchema = z.object({
  narrative: z.string().min(1),
  interpretation: interpretationSchema,
  ambiguity: ambiguitySchema,
  adversarial: adversarialChallengeSchema,
  lockability: lockabilitySchema,
  summary: z.string().min(1),
  provider_request: providerRequestSchema,
  audit: z.object({
    id: z.number().int().positive(),
    created_at: z.string().min(1),
    db_path: z.string().min(1),
  }),
});

const projectSeedSchema = z.object({
  goals: z.array(z.string()),
  constraints: z.array(z.string()),
  preferences: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  success_criteria: z.array(z.string()),
  risks: z.array(z.string()),
  open_questions: z.array(z.string()),
  assumptions: z.array(z.string()),
});

const requirementsSeedSchema = z.object({
  active: z.array(z.string()),
  constraints: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risks: z.array(z.string()),
  open_questions: z.array(z.string()),
});

const grayAreaHintSchema = z.object({
  area: z.string().min(1),
  reason: z.string().min(1),
  seeds: z.array(z.string()),
});

const discussionSeedSchema = z.object({
  goals: z.array(z.string()),
  constraints: z.array(z.string()),
  preferences: z.array(z.string()),
  success_criteria: z.array(z.string()),
  unknowns: z.array(z.string()),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  gray_area_hints: z.array(grayAreaHintSchema),
  deferred_ideas: z.array(z.string()),
});

const verificationHintSchema = z.object({
  focus: z.string().min(1),
  reason: z.string().min(1),
  checks: z.array(z.string()),
});

const verificationSeedSchema = z.object({
  prioritized_checks: z.array(z.string()),
  expected_outcomes: z.array(z.string()),
  success_criteria: z.array(z.string()),
  constraints: z.array(z.string()),
  risks: z.array(z.string()),
  unknowns: z.array(z.string()),
  assumptions: z.array(z.string()),
  verification_hints: z.array(verificationHintSchema),
});

const clarificationChoiceSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
});

const clarificationPromptSchema = z.object({
  finding_type: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  decision_surface: z.string().min(1),
  why_this_is_needed: z.string().min(1),
  question: z.string().min(1),
  choices: z.array(clarificationChoiceSchema).min(2),
  allow_freeform: z.boolean(),
});

const clarificationCheckpointSchema = z.object({
  mode: z.enum(['none', 'recommended', 'required', 'blocking']),
  resume_allowed: z.boolean(),
  pause_if_unresolved: z.boolean(),
  reason: z.string().min(1),
  unresolved_risk: z.string().min(1),
  prompts: z.array(clarificationPromptSchema),
});

const baseSeedSchema = interpretationResultSchema.extend({
  route: z.string().min(1),
  needs_clarification: z.boolean(),
  clarification_questions: z.array(z.string()),
  clarification: clarificationCheckpointSchema,
});

const initializationSeedSchema = baseSeedSchema.extend({
  route: z.literal('/dostuff:new-project'),
  project_seed: projectSeedSchema,
  requirements_seed: requirementsSeedSchema,
});

const discussSeedSchema = baseSeedSchema.extend({
  route: z.literal('/dostuff:discuss-phase'),
  discussion_seed: discussionSeedSchema,
});

const verificationSeedSchemaWrapper = baseSeedSchema.extend({
  route: z.literal('/dostuff:verify-work'),
  verification_seed: verificationSeedSchema,
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

function parseInterpretation(input, options = {}) {
  return normalizeInterpretation(input, options);
}

function parseAmbiguity(input) {
  return ambiguitySchema.parse(input);
}

function parseAdversarialChallenge(input = {}) {
  const parsed = adversarialChallengeSchema.parse(input);
  return adversarialChallengeSchema.parse({
    ...parsed,
    requires_escalation: Boolean(
      parsed.requires_escalation
      || parsed.findings.some(finding => finding.severity === 'medium' || finding.severity === 'high')
    ),
  });
}

function parseLockability(input) {
  return lockabilitySchema.parse(input);
}

function parseAuditRecord(input) {
  return auditRecordSchema.parse(input);
}

function parseInterpretationResult(input) {
  return interpretationResultSchema.parse(input);
}

function parseInitializationSeed(input) {
  return initializationSeedSchema.parse(input);
}

function parseDiscussPhaseSeed(input) {
  return discussSeedSchema.parse(input);
}

function parseVerificationSeed(input) {
  return verificationSeedSchemaWrapper.parse(input);
}

module.exports = {
  toList,
  uniq,
  normalizeInterpretation,
  parseInterpretation,
  parseAmbiguity,
  parseAdversarialChallenge,
  parseLockability,
  parseAuditRecord,
  parseInterpretationResult,
  parseInitializationSeed,
  parseDiscussPhaseSeed,
  parseVerificationSeed,
  schemas: {
    routeHintSchema,
    inferenceItemSchema,
    interpretationSchema,
    ambiguitySchema,
    adversarialChallengeSchema,
    lockabilitySchema,
    auditRecordSchema,
    providerRequestSchema,
    interpretationResultSchema,
    initializationSeedSchema,
    discussSeedSchema,
    verificationSeedSchema: verificationSeedSchemaWrapper,
    clarificationCheckpointSchema,
    clarificationPromptSchema,
    stringListField,
  },
  inferenceItemSchema,
  interpretationSchema,
  ambiguitySchema,
  adversarialChallengeSchema,
  lockabilitySchema,
  clarificationCheckpointSchema,
  clarificationPromptSchema,
};
