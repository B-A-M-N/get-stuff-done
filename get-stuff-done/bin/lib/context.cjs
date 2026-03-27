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
const { output, error, safeReadFile, safeWriteFile, execGit, findPhaseInternal, safeFs, safeGit } = require('./core.cjs');
const { runVerifyIntegrity } = require('./verify.cjs');
const contextStore = require('./context-store.cjs');
const contextArtifact = require('./context-artifact.cjs');
const schemaRegistry = require('./schema-registry.cjs');
const secondBrain = require('./second-brain.cjs');
const openBrain = require('./open-brain.cjs');
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

const MemoryEntrySchema = z.object({
  memory_kind: z.string(),
  title: z.string(),
  body_markdown: z.string(),
  source_ref: z.string().nullable(),
  created_at: z.string().nullable(),
  importance: z.number(),
  phase: z.string().nullable(),
  plan: z.string().nullable(),
});

const MemoryPackSchema = z.object({
  available: z.boolean(),
  blocked: z.boolean(),
  reason: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  total_entries: z.number().int().nonnegative(),
  recent_decisions: z.array(MemoryEntrySchema),
  prior_summaries: z.array(MemoryEntrySchema),
  known_pitfalls: z.array(MemoryEntrySchema),
  unresolved_blockers: z.array(MemoryEntrySchema),
  backend_state: z.unknown().optional(),
});

const OpenBrainRecallEntrySchema = z.object({
  id: z.union([z.string(), z.number()]).transform((value) => String(value)),
  title: z.string(),
  body_markdown: z.string(),
  source_uri: z.string().nullable(),
  project_scope: z.string().nullable(),
  ranking: z.object({
    score: z.number(),
    similarity: z.number().optional(),
    recency: z.number().optional(),
    reuse: z.number().optional(),
    feedback: z.number().optional(),
    project_scope_match: z.number().optional(),
    importance: z.number().optional(),
  }),
});

const OpenBrainRecallPackSchema = z.object({
  available: z.boolean(),
  blocked: z.boolean(),
  reason: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  total_entries: z.number().int().nonnegative(),
  total_candidates: z.number().int().nonnegative(),
  entries: z.array(OpenBrainRecallEntrySchema),
  recall_event: z.object({ id: z.union([z.string(), z.number()]).transform((value) => String(value)) }).nullable().optional(),
  backend_state: z.unknown().optional(),
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

const IntentFingerprintSchema = z.object({
  hash: z.string(),
  ts: z.string(),
  plan_ref: z.string(),
});

const SCHEMAS = {
  'execute-plan': z.object({
    schema_version: z.literal(4),
    workflow: z.literal('execute-plan'),
    git: GitStateSchema,
    pointer: PlanPointerSchema,
    memory_pack: MemoryPackSchema,
    open_brain_recall: OpenBrainRecallPackSchema,
    pending_gates: z.array(GateSummarySchema),
    last_task: TaskEntrySchema,
    checkpoint_present: z.boolean(),
    integrity: IntegrityResultSchema,
    coherent: z.boolean(),
    warnings: z.array(WarningSchema),
    fingerprint: IntentFingerprintSchema.optional(),
    baseline_active: z.boolean().default(false),
    firecrawl_parity: z.boolean().default(false),
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
    schema_version: z.literal(3),
    workflow: z.literal('plan-phase'),
    git: GitStateSchema,
    next_phase: z.number().nullable(),
    roadmap_exists: z.boolean(),
    research_exists: z.boolean(),
    memory_pack: MemoryPackSchema,
    open_brain_recall: OpenBrainRecallPackSchema,
    warnings: z.array(WarningSchema),
    firecrawl_parity: z.boolean().default(false),
  }),
};

// ─── Shared readers ───────────────────────────────────────────────────────────

function readGitState(cwd) {
  const headResult = safeGit.exec(cwd, ['rev-parse', '--short', 'HEAD']);
  const branchResult = safeGit.exec(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const statusResult = safeGit.exec(cwd, ['status', '--porcelain']);
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
        if (k.trim() === 'current_plan' && plan == null) {
          if (!isNaN(Number(val))) {
            plan = Number(val);
          } else {
            const phasePlanMatch = val.match(/(\d+)-(\d+)/);
            if (phasePlanMatch) {
              if (phase == null) phase = Number(phasePlanMatch[1]);
              plan = Number(phasePlanMatch[2]);
            }
          }
        }
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
    const files = safeFs.readdirSync(gatesDir).filter(f => f.endsWith('-pending.json'));
    const now = Date.now();
    for (const f of files) {
      try {
        const data = JSON.parse(safeFs.readFileSync(path.join(gatesDir, f), 'utf-8'));
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
  const planId = formatMemoryPlan(plan);
  const logFile = path.join(cwd, phaseInfo.directory, `${phase}-${planId}-TASK-LOG.jsonl`);
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
  return safeFs.existsSync(path.join(cwd, phaseInfo.directory, 'CHECKPOINT.md'));
}

function formatMemoryPhase(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function formatMemoryPlan(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value).padStart(2, '0');
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return value.padStart(2, '0');
  }
  return String(value);
}

function sanitizeMemoryEntry(entry = {}) {
  return {
    memory_kind: String(entry.memory_kind || 'unknown'),
    title: String(entry.title || ''),
    body_markdown: String(entry.body_markdown || ''),
    source_ref: entry.source_ref || null,
    created_at: entry.created_at || null,
    importance: Number.isFinite(Number(entry.importance)) ? Number(entry.importance) : 3,
    phase: formatMemoryPhase(entry.phase),
    plan: formatMemoryPlan(entry.plan),
  };
}

function buildOpenBrainQuery({ workflow, pointer = {} } = {}) {
  const segments = [];
  if (pointer.phase != null) segments.push(`Phase ${pointer.phase}`);
  if (pointer.plan != null) segments.push(`plan ${formatMemoryPlan(pointer.plan)}`);

  if (workflow === 'execute-plan') {
    segments.push('execution workflow context');
  } else if (workflow === 'plan-phase') {
    segments.push('planning workflow context');
  } else {
    segments.push('workflow context');
  }

  segments.push('Open Brain recall');
  return segments.join(' ');
}

function sanitizeOpenBrainRecallEntry(entry = {}) {
  return {
    id: String(entry.id ?? ''),
    title: String(entry.title || ''),
    body_markdown: String(entry.body_markdown || ''),
    source_uri: entry.source_uri || null,
    project_scope: entry.project_scope || null,
    ranking: {
      score: Number(entry.ranking?.score || 0),
      similarity: Number(entry.ranking?.similarity || 0),
      recency: Number(entry.ranking?.recency || 0),
      reuse: Number(entry.ranking?.reuse || 0),
      feedback: Number(entry.ranking?.feedback || 0),
      project_scope_match: Number(entry.ranking?.project_scope_match || 0),
      importance: Number(entry.ranking?.importance || 0),
    },
  };
}

function buildOpenBrainRecallPackResult(result = {}, metadata = {}) {
  const boundedEntries = Array.isArray(result.selected)
    ? result.selected.slice(0, metadata.limit ?? 2).map((entry) => sanitizeOpenBrainRecallEntry(entry))
    : [];

  return {
    available: metadata.available !== false,
    blocked: Boolean(metadata.blocked),
    reason: metadata.reason || null,
    message: metadata.message || null,
    total_entries: boundedEntries.length,
    total_candidates: Number.isFinite(Number(result.total_candidates))
      ? Number(result.total_candidates)
      : boundedEntries.length,
    entries: boundedEntries,
    recall_event: result.recall_event ? { id: String(result.recall_event.id) } : null,
    backend_state: metadata.backend_state,
  };
}

async function buildOpenBrainRecallPack({ workflow, pointer = {}, recallReader, projectScope } = {}) {
  const phase = formatMemoryPhase(pointer.phase);
  const plan = workflow === 'execute-plan' ? formatMemoryPlan(pointer.plan) : null;
  const query = buildOpenBrainQuery({ workflow, pointer });
  const reader = recallReader || ((options) => openBrain.recallForWorkflow(options));

  try {
    const result = await reader({
      workflow,
      phase,
      plan,
      project_scope: projectScope || secondBrain.projectId,
      query,
      limit: 2,
    });

    if (!result || result.available === false || result.blocked) {
      return {
        open_brain_recall: buildOpenBrainRecallPackResult(
          { selected: [], total_candidates: 0, recall_event: null },
          {
            available: false,
            blocked: Boolean(result && result.blocked),
            reason: result && result.reason ? result.reason : 'unavailable',
            message: result && (result.message || result.detail) ? (result.message || result.detail) : 'Open Brain recall unavailable.',
            backend_state: result && result.backend_state ? result.backend_state : undefined,
            limit: 2,
          }
        ),
      };
    }

    return {
      open_brain_recall: buildOpenBrainRecallPackResult(result, {
        available: true,
        blocked: false,
        backend_state: result.backend_state,
        limit: 2,
      }),
    };
  } catch (err) {
    return {
      open_brain_recall: buildOpenBrainRecallPackResult(
        { selected: [], total_candidates: 0, recall_event: null },
        {
          available: false,
          blocked: false,
          reason: 'recall_error',
          message: err.message,
          backend_state: openBrain.checkAvailability().backend_state,
          limit: 2,
        }
      ),
    };
  }
}

function buildMemoryPack(items = [], metadata = {}) {
  const buckets = {
    recent_decisions: [],
    prior_summaries: [],
    known_pitfalls: [],
    unresolved_blockers: [],
  };
  const limits = {
    recent_decisions: 3,
    prior_summaries: 2,
    known_pitfalls: 2,
    unresolved_blockers: 1,
  };

  for (const rawEntry of items) {
    const entry = sanitizeMemoryEntry(rawEntry);
    let bucket = null;

    if (entry.memory_kind === 'decision') bucket = 'recent_decisions';
    else if (entry.memory_kind === 'summary') bucket = 'prior_summaries';
    else if (entry.memory_kind === 'pitfall') bucket = 'known_pitfalls';
    else if (entry.memory_kind === 'checkpoint') bucket = 'unresolved_blockers';

    if (!bucket) continue;
    if (buckets[bucket].length >= limits[bucket]) continue;
    buckets[bucket].push(entry);
  }

  const total_entries = Object.values(buckets).reduce((sum, entries) => sum + entries.length, 0);

  return {
    available: metadata.available !== false,
    blocked: Boolean(metadata.blocked),
    reason: metadata.reason || null,
    message: metadata.message || null,
    total_entries,
    backend_state: metadata.backend_state,
    ...buckets,
  };
}

async function loadWorkflowMemoryPack({ workflow, pointer = {}, memoryReader } = {}) {
  const phase = formatMemoryPhase(pointer.phase);
  const plan = workflow === 'execute-plan' ? formatMemoryPlan(pointer.plan) : null;

  if (!phase) {
    return {
      memory_pack: buildMemoryPack([], {
        available: false,
        blocked: false,
        reason: 'phase_unavailable',
        message: 'No phase pointer available for workflow memory.',
      }),
    };
  }

  const reader = memoryReader || ((filters) => secondBrain.readModelFacingMemory(filters));
  const result = await reader({
    project_id: secondBrain.projectId,
    phase,
    plan,
    limit: 12,
  });

  if (!result || result.available === false || result.blocked) {
    return {
      memory_pack: buildMemoryPack([], {
        available: false,
        blocked: Boolean(result && result.blocked),
        reason: result && result.reason ? result.reason : 'unavailable',
        message: result && result.message ? result.message : 'Workflow memory unavailable.',
        backend_state: result && result.backend_state ? result.backend_state : undefined,
      }),
    };
  }

  return {
    memory_pack: buildMemoryPack(result.items || [], {
      available: true,
      blocked: false,
      backend_state: result.backend_state,
    }),
  };
}

// ─── Per-workflow builders ────────────────────────────────────────────────────

async function ensureExternalParity(cwd, phase, plan) {
  const firecrawlClient = require('./firecrawl-client.cjs');
  const { normalizeFirecrawl } = require('./firecrawl-normalizer.cjs');
  const urls = new Set();

  if (phase != null) {
    const phaseInfo = findPhaseInternal(cwd, String(phase));
    if (phaseInfo) {
      const files = [
        path.join(cwd, phaseInfo.directory, `${phase}-RESEARCH.md`),
        plan != null ? path.join(cwd, phaseInfo.directory, `${phase}-${plan}-PLAN.md`) : null
      ].filter(Boolean);

      for (const f of files) {
        const content = safeReadFile(f);
        if (content) {
          const matches = content.match(/https?:\/\/[^\s)\]]+/g);
          if (matches) matches.forEach(u => urls.add(u));
        }
      }
    }
  }

  const results = [];
  for (const url of urls) {
    try {
      const existing = contextStore.findBySource(cwd, url);
      if (existing.length === 0) {
        // Look up approved schema for this URL's domain
        const schemaInfo = await schemaRegistry.lookup(url);
        if (!schemaInfo) {
          console.warn(`[ensureExternalParity] No registered schema for URL: ${url}; skipping`);
          continue;
        }
        // Use extract with the registered schema
        const extractResult = await firecrawlClient.extract(url, schemaInfo.schema);
        if (extractResult && extractResult.success) {
          const artifact = normalizeFirecrawl(extractResult);
          contextStore.put(cwd, artifact);
          results.push(artifact);
          // Mark schema as used (fire-and-forget)
          try {
            await schemaRegistry.markSchemaUsed(schemaInfo.domainPattern);
          } catch (e) {
            // ignore marking errors
          }
        }
      }
    } catch (e) {
      // Skip failed extractions
    }
  }
  return results.length > 0 || urls.size > 0;
}

async function ensureInternalParity(cwd) {
  const { normalizeInternal } = require('./internal-normalizer.cjs');
  const artifacts = await normalizeInternal(cwd);
  artifacts.forEach(a => contextStore.put(cwd, a));
}

async function buildExecutePlan(cwd, options) {
  await ensureInternalParity(cwd);
  const git = readGitState(cwd);
  const pointer = readPlanPointer(cwd, options.phase, options.plan);
  const firecrawl_parity = await ensureExternalParity(cwd, pointer.phase, pointer.plan);
  const { memory_pack } = await loadWorkflowMemoryPack({
    workflow: 'execute-plan',
    pointer,
  });
  const { open_brain_recall } = await buildOpenBrainRecallPack({
    workflow: 'execute-plan',
    pointer,
    recallReader: options.openBrainRecallReader,
    projectScope: secondBrain.projectId,
  });

  const warnings = [];
  const pending_gates = readPendingGates(cwd);
  const last_task = readLastTaskEntry(cwd, pointer.phase, pointer.plan);
  const checkpoint_present = checkpointPresent(cwd, pointer.phase);

  // HardLine: Intent Fingerprinting
  let fingerprint;
  if (pointer.phase != null && pointer.plan != null) {
    const phaseInfo = findPhaseInternal(cwd, String(pointer.phase));
    if (phaseInfo) {
      const planId = formatMemoryPlan(pointer.plan);
      const planPath = path.join(cwd, phaseInfo.directory, `${pointer.phase}-${planId}-PLAN.md`);
      const planContent = safeReadFile(planPath) || '';
      const stateContent = safeReadFile(path.join(cwd, '.planning', 'STATE.md')) || '';
      
      const combined = `plan:${planContent}\nstate:${stateContent}`;
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      
      fingerprint = {
        hash,
        ts: new Date().toISOString(),
        plan_ref: `${pointer.phase}-${planId}`,
      };

      // Persist current fingerprint for drift detection
      const fpPath = path.join(cwd, '.planning', 'current_intent_fingerprint.json');
      safeFs.mkdirSync(path.dirname(fpPath), { recursive: true });
      safeWriteFile(fpPath, JSON.stringify(fingerprint, null, 2), 'utf-8');
    }
  }

  // HardLine: Baseline Detection
  const baselinePath = path.join(cwd, '.planning', 'baseline_manifest.json');
  const baseline_active = safeFs.existsSync(baselinePath);

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

  return { schema_version: 4, workflow: 'execute-plan', git, pointer, memory_pack, open_brain_recall, pending_gates, last_task, checkpoint_present, integrity, coherent, warnings, fingerprint, baseline_active, firecrawl_parity };
}

async function buildVerifyWork(cwd, options) {
  await ensureInternalParity(cwd);
  const warnings = [];
  const git = readGitState(cwd);
  const pointer = readPlanPointer(cwd, options.phase, options.plan);

  let summary_exists = false;
  let verification_exists = false;

  if (pointer.phase_dir) {
    const plan = pointer.plan != null ? pointer.plan : 1;
    const planId = formatMemoryPlan(plan);
    summary_exists = safeFs.existsSync(path.join(cwd, pointer.phase_dir, `${pointer.phase}-${planId}-SUMMARY.md`));
    verification_exists = safeFs.existsSync(path.join(cwd, pointer.phase_dir, 'VERIFICATION.md'));
  } else {
    warnings.push({ message: 'phase directory not found — cannot check summary/verification artifacts', severity: 'ignorable' });
  }

  if (!summary_exists) warnings.push({ message: 'SUMMARY.md not found for current phase/plan', severity: 'stop' });

  return { schema_version: 1, workflow: 'verify-work', git, pointer, summary_exists, verification_exists, warnings };
}

async function buildPlanPhase(cwd, options = {}) {
  await ensureInternalParity(cwd);
  const git = readGitState(cwd);

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const roadmap_exists = safeFs.existsSync(roadmapPath);

  // Determine next incomplete phase from roadmap
  let next_phase = null;
  if (roadmap_exists) {
    const raw = safeReadFile(roadmapPath) || '';
    const phaseMatches = [...raw.matchAll(/^\|\s*(\d+(?:\.\d+)?)\s*\|[^|]+\|\s*(?:pending|not started)/gim)];
    if (phaseMatches.length > 0) next_phase = Number(phaseMatches[0][1]);
  }

  const firecrawl_parity = await ensureExternalParity(cwd, next_phase, null);
  const warnings = [];

  // Check if RESEARCH.md exists for next_phase
  let research_exists = false;
  if (next_phase != null) {
    const phaseInfo = findPhaseInternal(cwd, String(next_phase));
    if (phaseInfo) {
      research_exists = safeFs.existsSync(path.join(cwd, phaseInfo.directory, `${next_phase}-RESEARCH.md`));
    }
  }

  const { memory_pack } = await loadWorkflowMemoryPack({
    workflow: 'plan-phase',
    pointer: { phase: next_phase, plan: null },
  });
  const { open_brain_recall } = await buildOpenBrainRecallPack({
    workflow: 'plan-phase',
    pointer: { phase: next_phase, plan: null },
    recallReader: options.openBrainRecallReader,
    projectScope: secondBrain.projectId,
  });

  if (!roadmap_exists) warnings.push({ message: 'ROADMAP.md not found — cannot determine next phase', severity: 'stop' });
  if (next_phase == null && roadmap_exists) warnings.push({ message: 'no pending phases found in ROADMAP.md', severity: 'ignorable' });

  return { schema_version: 3, workflow: 'plan-phase', git, next_phase, roadmap_exists, research_exists, memory_pack, open_brain_recall, warnings, firecrawl_parity };
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
  if (!safeFs.existsSync(fullPath)) {
    error(`File not found: ${contentPath}`);
  }

  const content = safeFs.readFileSync(fullPath, 'utf8');
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

async function cmdContextBuild(cwd, workflow, options, raw) {
  if (!workflow) error('--workflow required (execute-plan | verify-work | plan-phase)');

  const schema = SCHEMAS[workflow];
  if (!schema) error(`Unknown workflow: "${workflow}". Known workflows: ${Object.keys(SCHEMAS).join(', ')}`);

  let snapshot;
  try {
    switch (workflow) {
      case 'execute-plan': snapshot = await buildExecutePlan(cwd, options || {}); break;
      case 'verify-work':  snapshot = await buildVerifyWork(cwd, options || {});  break;
      case 'plan-phase':   snapshot = await buildPlanPhase(cwd);                  break;
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
  cmdContextNormalize,
  ensureExternalParity,
  buildMemoryPack,
  buildOpenBrainRecallPack,
  loadWorkflowMemoryPack,
  buildExecutePlan,
  buildPlanPhase,
};
