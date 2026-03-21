/**
 * Context — Per-workflow execution snapshot builder.
 *
 * Reads project artifacts and emits a Zod-validated JSON snapshot shaped to
 * exactly what each workflow needs. Agents inject this at call start instead
 * of reconstructing state from individual files.
 *
 * Schemas are per-workflow and composed from shared fragments. To change what
 * a workflow receives, edit only its schema object here. schema_version bumps
 * on breaking changes so callers can detect stale cached snapshots.
 *
 * Usage:
 *   node gsd-tools.cjs context build --workflow execute-plan [--phase N] [--plan M]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { output, error, safeReadFile, execGit, findPhaseInternal } = require('./core.cjs');
const { runVerifyIntegrity } = require('./verify.cjs');
const contextStore = require('./context-store.cjs');
const contextArtifact = require('./context-artifact.cjs');
const crypto = require('crypto');

// ─── Fragment schemas ─────────────────────────────────────────────────────────

const GitStateSchema = z.object({
  head: z.string(),
  branch: z.string(),
  clean: z.boolean(),
});

const PlanPointerSchema = z.object({
  phase: z.number().nullable(),
  plan: z.number().nullable(),
  phase_dir: z.string().nullable(),
});

const TaskEntrySchema = z.object({
  task: z.number().nullable(),
  hash: z.string(),
  subject: z.string(),
  ts: z.string().optional(),
}).nullable();

const GateSummarySchema = z.object({
  key: z.string(),
  blocked_at: z.string(),
  age_seconds: z.number(),
  stale: z.boolean(),
});

const WarningSchema = z.object({
  message: z.string(),
  severity: z.enum(['stop', 'ignorable']),
});

// ─── Per-workflow schemas ─────────────────────────────────────────────────────
// Each workflow declares exactly the fields it needs. Add new workflows here;
// no other file needs to change. Bump schema_version on breaking changes.

const IntegrityResultSchema = z.object({
  coherent: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(WarningSchema),
  checks: z.record(z.string(), z.unknown()),
});

const SCHEMAS = {
  'execute-plan': z.object({
    schema_version: z.literal(2),
    workflow: z.literal('execute-plan'),
    git: GitStateSchema,
    pointer: PlanPointerSchema,
    pending_gates: z.array(GateSummarySchema),
    last_task: TaskEntrySchema,
    checkpoint_present: z.boolean(),
    integrity: IntegrityResultSchema,
    coherent: z.boolean(),
    warnings: z.array(WarningSchema),
  }),

  'verify-work': z.object({
    schema_version: z.literal(1),
    workflow: z.literal('verify-work'),
    git: GitStateSchema,
    pointer: PlanPointerSchema,
    summary_exists: z.boolean(),
    verification_exists: z.boolean(),
    warnings: z.array(WarningSchema),
  }),

  'plan-phase': z.object({
    schema_version: z.literal(1),
    workflow: z.literal('plan-phase'),
    git: GitStateSchema,
    next_phase: z.number().nullable(),
    roadmap_exists: z.boolean(),
    research_exists: z.boolean(),
    warnings: z.array(WarningSchema),
  }),
};

// ─── Shared readers ───────────────────────────────────────────────────────────

function readGitState(cwd) {
  const headResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const branchResult = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const statusResult = execGit(cwd, ['status', '--porcelain']);
  return {
    head: headResult.exitCode === 0 ? headResult.stdout.trim() : 'unknown',
    branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() : 'unknown',
    clean: statusResult.exitCode === 0 ? statusResult.stdout.trim() === '' : false,
  };
}

function readPlanPointer(cwd, phaseOverride, planOverride) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const raw = safeReadFile(statePath);
  let phase = phaseOverride != null ? Number(phaseOverride) : null;
  let plan = planOverride != null ? Number(planOverride) : null;
  let phase_dir = null;

  if (raw) {
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      for (const line of fmMatch[1].split('\n')) {
        const [k, ...rest] = line.split(':');
        const val = rest.join(':').trim();
        if (k.trim() === 'current_phase' && phase == null) phase = isNaN(Number(val)) ? null : Number(val);
        if (k.trim() === 'current_plan' && plan == null) plan = isNaN(Number(val)) ? null : Number(val);
      }
    }
  }

  if (phase != null) {
    const phaseInfo = findPhaseInternal(cwd, String(phase));
    if (phaseInfo) phase_dir = phaseInfo.directory;
  }

  return { phase, plan, phase_dir };
}

function readPendingGates(cwd) {
  const gatesDir = path.join(cwd, '.planning', 'gates');
  const pending = [];
  try {
    const files = fs.readdirSync(gatesDir).filter(f => f.endsWith('-pending.json'));
    const now = Date.now();
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(gatesDir, f), 'utf-8'));
        const blockedMs = new Date(data.blocked_at).getTime();
        const age_seconds = Math.floor((now - blockedMs) / 1000);
        pending.push({ key: data.key, blocked_at: data.blocked_at, age_seconds, stale: age_seconds > 3600 });
      } catch {}
    }
  } catch {}
  return pending;
}

function readLastTaskEntry(cwd, phase, plan) {
  if (phase == null || plan == null) return null;
  const phaseInfo = findPhaseInternal(cwd, String(phase));
  if (!phaseInfo) return null;
  const logFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-TASK-LOG.jsonl`);
  const raw = safeReadFile(logFile);
  if (!raw) return null;
  const lines = raw.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

function checkpointPresent(cwd, phase) {
  if (phase == null) return false;
  const phaseInfo = findPhaseInternal(cwd, String(phase));
  if (!phaseInfo) return false;
  return fs.existsSync(path.join(cwd, phaseInfo.directory, 'CHECKPOINT.md'));
}

// ─── Per-workflow builders ────────────────────────────────────────────────────

function buildExecutePlan(cwd, options) {
  const warnings = [];
  const git = readGitState(cwd);
  const pointer = readPlanPointer(cwd, options.phase, options.plan);
  const pending_gates = readPendingGates(cwd);
  const last_task = readLastTaskEntry(cwd, pointer.phase, pointer.plan);
  const checkpoint_present = checkpointPresent(cwd, pointer.phase);

  // Run full integrity audit so `coherent` is a verified invariant, not just a field presence check.
  const integrity = runVerifyIntegrity(cwd, {
    phase: pointer.phase != null ? String(pointer.phase) : undefined,
    plan: pointer.plan != null ? String(pointer.plan) : undefined,
  });

  if (git.head === 'unknown') warnings.push({ message: 'git HEAD could not be resolved — repo may be in a broken state', severity: 'stop' });
  if (pointer.phase == null) warnings.push({ message: 'current_phase not set in STATE.md — pass --phase to override', severity: 'ignorable' });
  // Fold any stop-the-line integrity warnings that aren't already surfaces as errors
  for (const w of integrity.warnings) {
    if (w.severity === 'stop') warnings.push(w);
  }

  const coherent = integrity.coherent && git.head !== 'unknown' && pointer.phase != null;

  return { schema_version: 2, workflow: 'execute-plan', git, pointer, pending_gates, last_task, checkpoint_present, integrity, coherent, warnings };
}

function buildVerifyWork(cwd, options) {
  const warnings = [];
  const git = readGitState(cwd);
  const pointer = readPlanPointer(cwd, options.phase, options.plan);

  let summary_exists = false;
  let verification_exists = false;

  if (pointer.phase_dir) {
    const plan = pointer.plan != null ? pointer.plan : 1;
    summary_exists = fs.existsSync(path.join(cwd, pointer.phase_dir, `${pointer.phase}-${plan}-SUMMARY.md`));
    verification_exists = fs.existsSync(path.join(cwd, pointer.phase_dir, 'VERIFICATION.md'));
  } else {
    warnings.push({ message: 'phase directory not found — cannot check summary/verification artifacts', severity: 'ignorable' });
  }

  if (!summary_exists) warnings.push({ message: 'SUMMARY.md not found for current phase/plan', severity: 'stop' });

  return { schema_version: 1, workflow: 'verify-work', git, pointer, summary_exists, verification_exists, warnings };
}

function buildPlanPhase(cwd) {
  const warnings = [];
  const git = readGitState(cwd);

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const roadmap_exists = fs.existsSync(roadmapPath);

  // Determine next incomplete phase from roadmap
  let next_phase = null;
  if (roadmap_exists) {
    const raw = safeReadFile(roadmapPath) || '';
    const phaseMatches = [...raw.matchAll(/^\|\s*(\d+(?:\.\d+)?)\s*\|[^|]+\|\s*(?:pending|not started)/gim)];
    if (phaseMatches.length > 0) next_phase = Number(phaseMatches[0][1]);
  }

  // Check if RESEARCH.md exists for next_phase
  let research_exists = false;
  if (next_phase != null) {
    const phaseInfo = findPhaseInternal(cwd, String(next_phase));
    if (phaseInfo) {
      research_exists = fs.existsSync(path.join(cwd, phaseInfo.directory, `${next_phase}-RESEARCH.md`));
    }
  }

  if (!roadmap_exists) warnings.push({ message: 'ROADMAP.md not found — cannot determine next phase', severity: 'stop' });
  if (next_phase == null && roadmap_exists) warnings.push({ message: 'no pending phases found in ROADMAP.md', severity: 'ignorable' });

  return { schema_version: 1, workflow: 'plan-phase', git, next_phase, roadmap_exists, research_exists, warnings };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Reads one or more context artifacts and outputs them as a markdown bundle.
 */
function cmdContextRead(cwd, ids, options = {}) {
  if (!ids || ids.length === 0) {
    error('At least one artifact ID is required');
  }

  const artifacts = ids.map(id => contextStore.get(cwd, id)).filter(Boolean);
  
  if (artifacts.length === 0) {
    error('No matching artifacts found for the provided IDs');
  }

  const bundle = artifacts.map(a => {
    return `---
id: ${a.id}
source: ${a.source_uri}
normalized_at: ${a.normalized_at}
---

${a.content_markdown}`;
  }).join('\n\n---\n\n');

  process.stdout.write(bundle + '\n');
}

/**
 * Normalizes a file into a context artifact and stores it.
 */
function cmdContextNormalize(cwd, sourceUri, contentPath, options = {}) {
  if (!sourceUri) error('--source required');
  if (!contentPath) error('--file required');

  const fullPath = path.resolve(cwd, contentPath);
  if (!fs.existsSync(fullPath)) {
    error(`File not found: ${contentPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');
  const id = contextArtifact.generateArtifactId(sourceUri, contentHash);

  const artifact = {
    id,
    source_uri: sourceUri,
    type: options.type || 'internal',
    content_markdown: content,
    content_hash: contentHash,
    normalized_at: new Date().toISOString(),
    provenance: {
      producer: options.producer || 'internal-normalizer',
      producer_version: '1.0.0',
      parameters_hash: null
    }
  };

  try {
    const saved = contextStore.put(cwd, artifact);
    output({ id: saved.id }, options.raw, 'stored');
  } catch (err) {
    error(`Failed to store artifact: ${err.message}`);
  }
}

function cmdContextBuild(cwd, workflow, options, raw) {
  if (!workflow) error('--workflow required (execute-plan | verify-work | plan-phase)');

  const schema = SCHEMAS[workflow];
  if (!schema) error(`Unknown workflow: "${workflow}". Known workflows: ${Object.keys(SCHEMAS).join(', ')}`);

  let snapshot;
  try {
    switch (workflow) {
      case 'execute-plan': snapshot = buildExecutePlan(cwd, options || {}); break;
      case 'verify-work':  snapshot = buildVerifyWork(cwd, options || {});  break;
      case 'plan-phase':   snapshot = buildPlanPhase(cwd);                  break;
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: 'context build failed', details: err.message }, null, 2));
    process.exit(1);
  }

  const result = schema.safeParse(snapshot);
  if (!result.success) {
    process.stdout.write(JSON.stringify({
      error: 'context snapshot failed schema validation',
      workflow,
      issues: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    }, null, 2));
    process.exit(1);
  }

  output(result.data, raw, result.data.coherent === false ? 'incoherent' : 'ok');
}

module.exports = { 
  cmdContextBuild,
  cmdContextRead,
  cmdContextNormalize
};
