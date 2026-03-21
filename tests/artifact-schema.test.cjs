const { test } = require('node:test');
const assert = require('node:assert');

// RED: artifact-schema.cjs does not exist yet — all tests must fail until GREEN phase

const {
  checkpointArtifactSchema,
  checkpointResponseSchema,
  executionSummarySchema,
  contextArtifactSchema,
  parseCheckpointArtifact,
  parseCheckpointResponse,
  parseExecutionSummary,
  parseContextArtifact,
} = require('../get-stuff-done/bin/lib/artifact-schema.cjs');

const { generateArtifactId } = require('../get-stuff-done/bin/lib/context-artifact.cjs');

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
  const msgs = r.error.issues.map(e => e.message);
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
  const msgs = r.error.issues.map(e => e.message);
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
  const msgs = r.error.issues.map(e => e.message);
  assert.ok(msgs.some(m => m.includes('Invalid checkpoint status:')), `Invalid status error missing in: ${JSON.stringify(msgs)}`);
});

// ---------------------------------------------------------------------------
// executionSummarySchema
// ---------------------------------------------------------------------------

test('executionSummarySchema: accepts valid complete object', () => {
  assert.doesNotThrow(() => {
    executionSummarySchema.parse({
      phase: '15',
      plan: '01',
      subsystem: 'testing',
      tags: ['unit'],
      provides: ['nothing'],
      duration: '10min',
      completed: '2026-03-17',
    });
  });
});

test('executionSummarySchema: accepts legacy object (phase < 15) with "name" instead of "subsystem"', () => {
  const result = executionSummarySchema.parse({
    phase: '14',
    plan: '01',
    name: 'legacy-subsystem',
  });
  assert.strictEqual(result.subsystem, 'legacy-subsystem');
});

test('executionSummarySchema: accepts legacy object (phase < 15) missing modern fields', () => {
  assert.doesNotThrow(() => {
    executionSummarySchema.parse({
      phase: 10,
      plan: '02',
      subsystem: 'core',
    });
  });
});

test('executionSummarySchema: throws when modern fields missing for phase >= 15', () => {
  const r = executionSummarySchema.safeParse({
    phase: 15,
    plan: '01',
    subsystem: 'core',
  });
  assert.strictEqual(r.success, false);
  const msgs = r.error.issues.map(e => e.message);
  assert.ok(msgs.includes('Required field: tags'));
  assert.ok(msgs.includes('Required field: provides'));
  assert.ok(msgs.includes('Required field: duration'));
  assert.ok(msgs.includes('Required field: completed'));
});

test('executionSummarySchema: throws when phase is missing', () => {
  assert.throws(() => {
    executionSummarySchema.parse({
      plan: '01',
      subsystem: 'testing',
      tags: ['unit'],
      provides: ['nothing'],
      duration: '10min',
      completed: '2026-03-17',
    });
  });
});

test('executionSummarySchema: accepts optional requirements_completed array', () => {
  assert.doesNotThrow(() => {
    executionSummarySchema.parse({
      phase: '15',
      plan: '01',
      subsystem: 'testing',
      tags: ['unit'],
      provides: ['nothing'],
      duration: '10min',
      completed: '2026-03-17',
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

test('parseContextArtifact: is a function exported correctly', () => {
  assert.strictEqual(typeof parseContextArtifact, 'function');
});

// ---------------------------------------------------------------------------
// contextArtifactSchema
// ---------------------------------------------------------------------------

test('contextArtifactSchema: accepts valid complete object', () => {
  const valid = {
    id: 'abc-123',
    source_uri: 'https://example.com',
    type: 'external',
    content_markdown: '# Hello',
    content_hash: 'sha256-hash',
    normalized_at: '2026-03-24T12:00:00Z',
    provenance: {
      producer: 'firecrawl',
      producer_version: '1.0.0',
      parameters_hash: null
    }
  };
  assert.doesNotThrow(() => contextArtifactSchema.parse(valid));
});

test('contextArtifactSchema: rejects missing fields', () => {
  const invalid = {
    id: 'abc-123',
    source_uri: 'https://example.com'
    // missing everything else
  };
  assert.throws(() => contextArtifactSchema.parse(invalid));
});

test('contextArtifactSchema: rejects invalid type', () => {
  const invalid = {
    id: 'abc-123',
    source_uri: 'https://example.com',
    type: 'invalid-type',
    content_markdown: '# Hello',
    content_hash: 'sha256-hash',
    normalized_at: '2026-03-24T12:00:00Z',
    provenance: {
      producer: 'firecrawl',
      producer_version: '1.0.0',
      parameters_hash: null
    }
  };
  assert.throws(() => contextArtifactSchema.parse(invalid));
});

test('contextArtifactSchema: rejects invalid producer', () => {
  const invalid = {
    id: 'abc-123',
    source_uri: 'https://example.com',
    type: 'external',
    content_markdown: '# Hello',
    content_hash: 'sha256-hash',
    normalized_at: '2026-03-24T12:00:00Z',
    provenance: {
      producer: 'unknown-producer',
      producer_version: '1.0.0',
      parameters_hash: null
    }
  };
  assert.throws(() => contextArtifactSchema.parse(invalid));
});

// ---------------------------------------------------------------------------
// generateArtifactId
// ---------------------------------------------------------------------------

test('generateArtifactId: produces deterministic 64-char hex hash', () => {
  const uri = 'https://example.com/doc';
  const hash = 'content-hash-123';
  const id1 = generateArtifactId(uri, hash);
  const id2 = generateArtifactId(uri, hash);
  
  assert.strictEqual(id1, id2, 'Should be deterministic');
  assert.match(id1, /^[a-f0-9]{64}$/, 'Should be 64-char hex');
});

test('generateArtifactId: produces different IDs for different inputs', () => {
  const id1 = generateArtifactId('uri1', 'hash');
  const id2 = generateArtifactId('uri2', 'hash');
  const id3 = generateArtifactId('uri1', 'hash-other');
  
  assert.notStrictEqual(id1, id2);
  assert.notStrictEqual(id1, id3);
});
