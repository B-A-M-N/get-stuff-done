/**
 * Artifact Schema — canonical Zod schemas for disk-persistence artifacts.
 * Distinct domain from ITL interpretation schemas (itl-schema.cjs).
 */

const { z } = require('zod');

// ---------------------------------------------------------------------------
// checkpointArtifactSchema — validates CHECKPOINT.md frontmatter (SCHEMA-01)
// ---------------------------------------------------------------------------

const checkpointArtifactSchema = z.object({
  status: z.enum(['pending', 'awaiting-response', 'resolved']),
  type: z.string().min(1),
  why_blocked: z.string().min(1),
  what_is_uncertain: z.string().min(1),
  choices: z.string().min(1),
  allow_freeform: z.union([z.boolean(), z.enum(['true', 'false'])]),
  resume_condition: z.string().min(1),
  resolved_at: z.string().optional(),
});

function parseCheckpointArtifact(input) {
  return checkpointArtifactSchema.parse(input);
}

// ---------------------------------------------------------------------------
// checkpointResponseSchema — validates agent key:value text response (SCHEMA-04)
// Preprocessor transforms raw text into a plain object before Zod validation.
// Error messages MUST match the strings in verify.cjs lines 238-256 exactly —
// tests/checkpoint-validator.test.cjs asserts on these strings.
// ---------------------------------------------------------------------------

function parseKeyValueText(val) {
  if (typeof val !== 'string') return val;
  const result = {};
  for (const line of val.split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/im);
    if (match) result[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return result;
}

const checkpointResponseSchema = z.preprocess(
  parseKeyValueText,
  z.object({
    status: z.enum(['continue', 'checkpoint', 'blocked'], {
      error: (issue) => {
        if (issue.input !== undefined) return `Invalid checkpoint status: ${issue.input}`;
        return 'Invalid checkpoint status';
      },
    }),
    why_blocked: z.string({
      error: () => 'Missing checkpoint field: why_blocked',
    })
      .min(1)
      .refine(v => !/^waiting for user input\.?$/i.test(v), { message: 'why_blocked is too vague' }),
    what_is_uncertain: z.string({
      error: () => 'Missing checkpoint field: what_is_uncertain',
    })
      .min(1)
      .refine(v => !/^needs clarification\.?$/i.test(v), { message: 'what_is_uncertain is too vague' }),
    choices: z.string({
      error: () => 'Missing checkpoint field: choices',
    })
      .min(1)
      .refine(v => /^\[.*\]$/.test(v) || /^none$/i.test(v), { message: 'choices must be a bracketed list or "none"' }),
    allow_freeform: z.enum(['true', 'false'], {
      error: () => 'allow_freeform must be true or false',
    }),
    resume_condition: z.string({
      error: () => 'Missing checkpoint field: resume_condition',
    })
      .min(1),
  })
);

function parseCheckpointResponse(input) {
  return checkpointResponseSchema.parse(input);
}

// ---------------------------------------------------------------------------
// executionSummarySchema — validates SUMMARY.md frontmatter (SCHEMA-02 home)
// Phase 19 (SCHEMA-03) wires cmdVerifySummary to use this schema.
// ---------------------------------------------------------------------------

const executionSummarySchema = z.object({
  phase: z.union([z.string(), z.number()]),
  plan: z.union([z.string(), z.number()]),
  subsystem: z.string().min(1),
  tags: z.array(z.string()),
  requires: z.array(z.union([
    z.string(),
    z.object({
      phase: z.string().min(1),
      provides: z.string().min(1),
    }),
  ])).optional(),
  provides: z.array(z.string()),
  affects: z.array(z.string()).optional(),
  'tech-stack': z.object({
    added: z.array(z.string()),
    patterns: z.array(z.string()),
  }).optional(),
  'key-files': z.object({
    created: z.array(z.string()),
    modified: z.array(z.string()),
  }).optional(),
  'key-decisions': z.array(z.string()).optional(),
  'patterns-established': z.array(z.string()).optional(),
  'requirements-completed': z.array(z.string()).optional(),
  duration: z.string().min(1),
  completed: z.string().min(1),
});

function parseExecutionSummary(input) {
  return executionSummarySchema.parse(input);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkpointArtifactSchema,
  checkpointResponseSchema,
  executionSummarySchema,
  parseCheckpointArtifact,
  parseCheckpointResponse,
  parseExecutionSummary,
};
