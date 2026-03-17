const { test } = require('node:test');
const assert = require('node:assert');

// RED: artifact-schema.cjs does not exist yet — all tests must fail until GREEN phase

const {
  checkpointArtifactSchema,
  checkpointResponseSchema,
  executionSummarySchema,
  parseCheckpointArtifact,
  parseCheckpointResponse,
  parseExecutionSummary,
} = require('../get-stuff-done/bin/lib/artifact-schema.cjs');

// ---------------------------------------------------------------------------
// checkpointArtifactSchema
// ---------------------------------------------------------------------------

test('checkpointArtifactSchema: accepts valid complete object', () => {
  const result = checkpointArtifactSchema.parse({
    status: 'pending',
    type: 'decision',
    why_blocked: 'x',
    what_is_uncertain: 'y',
    choices: '[a,b]',
    allow_freeform: true,
    resume_condition: 'z',
  });
  assert.strictEqual(result.status, 'pending');
});

test('checkpointArtifactSchema: accepts resolved_at optional field', () => {
  assert.doesNotThrow(() => {
    checkpointArtifactSchema.parse({
      status: 'pending',
      type: 'decision',
      why_blocked: 'x',
      what_is_uncertain: 'y',
      choices: '[a,b]',
      allow_freeform: true,
      resume_condition: 'z',
      resolved_at: '2026-01-01',
    });
  });
});

test('checkpointArtifactSchema: throws ZodError on empty object', () => {
  assert.throws(() => {
    checkpointArtifactSchema.parse({});
  });
});

test('checkpointArtifactSchema: accepts allow_freeform as string "true"', () => {
  assert.doesNotThrow(() => {
    checkpointArtifactSchema.parse({
      status: 'pending',
      type: 'decision',
      why_blocked: 'x',
      what_is_uncertain: 'y',
      choices: '[a,b]',
      allow_freeform: 'true',
      resume_condition: 'z',
    });
  });
});

// ---------------------------------------------------------------------------
// checkpointResponseSchema — parses raw key:value text
// ---------------------------------------------------------------------------

test('checkpointResponseSchema: accepts well-formed text blob', () => {
  const text = [
    'status: checkpoint',
    'why_blocked: Mobile vs desktop still unresolved.',
    'what_is_uncertain: Whether layout optimizes for mobile or desktop first.',
    'choices: [mobile-first, desktop-first]',
    'allow_freeform: true',
    'resume_condition: Resume when user selects priority.',
  ].join('\n');

  const r = checkpointResponseSchema.safeParse(text);
  assert.strictEqual(r.success, true, JSON.stringify(r.error?.errors ?? []));
});

test('checkpointResponseSchema: rejects vague why_blocked', () => {
  const text = [
    'status: checkpoint',
    'why_blocked: Waiting for user input.',
    'what_is_uncertain: Needs clarification.',
    'allow_freeform: maybe',
    'resume_condition: ask user',
  ].join('\n');

  const r = checkpointResponseSchema.safeParse(text);
  assert.strictEqual(r.success, false);
  const msgs = r.error.errors.map(e => e.message);
  assert.ok(msgs.some(m => m.includes('why_blocked is too vague')), `why_blocked vague missing in: ${JSON.stringify(msgs)}`);
  assert.ok(msgs.some(m => m.includes('what_is_uncertain is too vague')), `what_is_uncertain vague missing in: ${JSON.stringify(msgs)}`);
  assert.ok(msgs.some(m => m.includes('allow_freeform must be true or false')), `allow_freeform error missing in: ${JSON.stringify(msgs)}`);
  assert.ok(msgs.some(m => m.includes('Missing checkpoint field: choices')), `Missing choices error missing in: ${JSON.stringify(msgs)}`);
});

test('checkpointResponseSchema: produces Missing checkpoint field error for absent fields', () => {
  // Only status provided — everything else missing
  const text = 'status: checkpoint';
  const r = checkpointResponseSchema.safeParse(text);
  assert.strictEqual(r.success, false);
  const msgs = r.error.errors.map(e => e.message);
  assert.ok(msgs.some(m => m.includes('Missing checkpoint field: choices')), `Missing choices: ${JSON.stringify(msgs)}`);
  assert.ok(msgs.some(m => m.includes('Missing checkpoint field: why_blocked')), `Missing why_blocked: ${JSON.stringify(msgs)}`);
});

test('checkpointResponseSchema: rejects invalid status', () => {
  const text = [
    'status: unknown',
    'why_blocked: Some reason.',
    'what_is_uncertain: Something uncertain.',
    'choices: [a, b]',
    'allow_freeform: true',
    'resume_condition: When done.',
  ].join('\n');

  const r = checkpointResponseSchema.safeParse(text);
  assert.strictEqual(r.success, false);
  const msgs = r.error.errors.map(e => e.message);
  assert.ok(msgs.some(m => m.includes('Invalid checkpoint status:')), `Invalid status error missing in: ${JSON.stringify(msgs)}`);
});

// ---------------------------------------------------------------------------
// executionSummarySchema
// ---------------------------------------------------------------------------

test('executionSummarySchema: accepts valid phase/plan/name', () => {
  assert.doesNotThrow(() => {
    executionSummarySchema.parse({ phase: '15', plan: '01', name: 'Test' });
  });
});

test('executionSummarySchema: throws when phase is missing', () => {
  assert.throws(() => {
    executionSummarySchema.parse({ plan: '01', name: 'Test' });
  });
});

test('executionSummarySchema: accepts optional requirements_completed array', () => {
  assert.doesNotThrow(() => {
    executionSummarySchema.parse({
      phase: '15',
      plan: '01',
      name: 'Test',
      requirements_completed: ['SCHEMA-01', 'SCHEMA-02'],
    });
  });
});

// ---------------------------------------------------------------------------
// parse function exports
// ---------------------------------------------------------------------------

test('parseCheckpointArtifact: is a function exported correctly', () => {
  assert.strictEqual(typeof parseCheckpointArtifact, 'function');
});

test('parseCheckpointResponse: is a function exported correctly', () => {
  assert.strictEqual(typeof parseCheckpointResponse, 'function');
});

test('parseExecutionSummary: is a function exported correctly', () => {
  assert.strictEqual(typeof parseExecutionSummary, 'function');
});
