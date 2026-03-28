const fs = require('fs');
const path = require('path');
const {
  comparePhaseNum,
  findPhaseInternal,
  getRoadmapPhaseInternal,
  normalizePhaseName,
  safeWriteFile,
  toPosixPath,
} = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const verify = require('./verify.cjs');

const DRIFT_REPORT_PATH = '.planning/drift/latest-report.json';
const RECONCILIATION_PATH = '.planning/drift/latest-reconciliation.json';
const DEGRADED_STATE_PATH = '.planning/health/latest-degraded-state.json';

function toRelative(cwd, filePath) {
  return toPosixPath(path.relative(cwd, filePath));
}

function readJsonIfExists(cwd, relPath) {
  const fullPath = path.join(cwd, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

function getPhaseDirectory(cwd, phase) {
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo?.directory) {
    throw new Error(`Phase ${phase} not found`);
  }
  return {
    phaseInfo,
    phaseDir: path.join(cwd, phaseInfo.directory),
  };
}

function listPhaseArtifacts(cwd, phase) {
  const { phaseInfo, phaseDir } = getPhaseDirectory(cwd, phase);
  const files = fs.readdirSync(phaseDir).sort();
  const normalizedPhase = normalizePhaseName(phaseInfo.phase_number || phase);
  const verificationFile = files.find((file) => file === `${normalizedPhase}-VERIFICATION.md` || file.endsWith('-VERIFICATION.md')) || null;
  return {
    phaseInfo,
    phaseDir,
    plans: files.filter((file) => file.endsWith('-PLAN.md') || file === 'PLAN.md'),
    summaries: files.filter((file) => file.endsWith('-SUMMARY.md') || file === 'SUMMARY.md'),
    verification: verificationFile,
  };
}

function parseRequirementIds(section = '') {
  const match = section.match(/\*\*Requirements:\*\*\s*([^\n]+)/i);
  if (!match) return [];
  return match[1]
    .replace(/[\[\]]/g, '')
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseRequirementDescriptions(cwd) {
  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  if (!fs.existsSync(reqPath)) return {};
  const lines = fs.readFileSync(reqPath, 'utf-8').split('\n');
  const map = {};
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9-]+):\s*(.+?)\s*\|\s*source:/);
    if (match) {
      map[match[1]] = match[2].trim();
    }
  }
  return map;
}

function extractSummaryOutcomes(cwd, phaseDir, summaryFiles) {
  const outcomes = [];
  const supporting = [];
  for (const file of summaryFiles) {
    const fullPath = path.join(phaseDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const fm = extractFrontmatter(content);
    const relPath = toRelative(cwd, fullPath);
    supporting.push(relPath);
    if (Array.isArray(fm.provides)) {
      for (const entry of fm.provides) {
        outcomes.push({
          id: null,
          description: String(entry).trim(),
          supporting_artifacts: [relPath],
        });
      }
    }
  }
  return { outcomes, supporting };
}

function inferPhaseFromPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const match = normalized.match(/\/phases\/(\d+[A-Z]?(?:\.\d+)*)-/i);
  return match ? normalizePhaseName(match[1]) : null;
}

function driftSurfaceMatchesPhase(surface, phaseNum, phaseInfo) {
  const normalizedPhase = normalizePhaseName(phaseNum);
  if (normalizePhaseName(surface?.target_phase || '') === normalizedPhase) return true;
  if (normalizePhaseName(surface?.affected?.phase || '') === normalizedPhase) return true;
  if (new RegExp(`phase[_-]?${normalizedPhase}(?:\\b|-)`, 'i').test(String(surface?.id || ''))) return true;
  const paths = Array.isArray(surface?.implementation?.paths) ? surface.implementation.paths : [];
  return paths.some((candidate) => String(candidate).replace(/\\/g, '/').includes(`/${phaseInfo.phase_name ? `${normalizedPhase}-${phaseInfo.phase_name}` : normalizedPhase}`));
}

function loadVerificationState(cwd, verificationPath) {
  if (!verificationPath) {
    return {
      exists: false,
      valid_contract: false,
      final_status: null,
      result: null,
    };
  }

  const result = verify.evaluateVerificationArtifact(cwd, verificationPath);
  const fullPath = path.isAbsolute(verificationPath) ? verificationPath : path.join(cwd, verificationPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  return {
    exists: true,
    valid_contract: result.valid,
    final_status: String(fm.status || '').trim() || null,
    result,
  };
}

function collectDriftEffects(cwd, phaseNum, phaseInfo) {
  const report = readJsonIfExists(cwd, DRIFT_REPORT_PATH);
  if (!report?.surfaces) {
    return {
      report_path: null,
      effects: [],
      highest_severity: null,
    };
  }

  const relevant = report.surfaces.filter((surface) => driftSurfaceMatchesPhase(surface, phaseNum, phaseInfo));
  const effects = relevant
    .filter((surface) => surface.observed_drift || surface.activity_status === 'active')
    .map((surface) => ({
      id: surface.id || null,
      type: surface.drift_type || null,
      severity: surface.severity || null,
      source: DRIFT_REPORT_PATH,
      description: surface.claim || surface.notes || 'Active drift affects this phase.',
    }));

  const severityOrder = { MINOR: 1, MAJOR: 2, CRITICAL: 3 };
  const highest = effects.reduce((acc, effect) => {
    if (!effect.severity) return acc;
    if (!acc || severityOrder[effect.severity] > severityOrder[acc]) return effect.severity;
    return acc;
  }, null);

  return {
    report_path: DRIFT_REPORT_PATH,
    effects,
    highest_severity: highest,
  };
}

function collectReconciliationEffects(cwd, phaseNum) {
  const artifact = readJsonIfExists(cwd, RECONCILIATION_PATH);
  if (!artifact) {
    return {
      path: null,
      effects: [],
      reverification_required: [],
      highest_phase_status: null,
      highest_verification_status: null,
    };
  }

  const target = `phase_${normalizePhaseName(phaseNum)}`;
  const effects = (artifact.applied_changes || []).filter((entry) => entry.target === target).map((entry) => ({
    source: RECONCILIATION_PATH,
    surface: entry.surface,
    severity: entry.severity || null,
    applied_status: entry.to || null,
    reason: entry.reason || null,
    evidence: Array.isArray(entry.evidence) ? entry.evidence : [],
  }));
  const reverificationRequired = (artifact.reverification_required || []).filter((entry) => entry.target === target);

  const highestBySurface = (surface) => {
    const order = { VALID: 1, CONDITIONAL: 2, INVALID: 3 };
    return effects
      .filter((entry) => entry.surface === surface)
      .reduce((acc, entry) => {
        if (!entry.applied_status) return acc;
        if (!acc || order[entry.applied_status] > order[acc]) return entry.applied_status;
        return acc;
      }, null);
  };

  return {
    path: RECONCILIATION_PATH,
    effects,
    reverification_required: reverificationRequired,
    highest_phase_status: highestBySurface('phase_status'),
    highest_verification_status: highestBySurface('verification_status'),
  };
}

function collectDegradedEffects(cwd) {
  const artifact = readJsonIfExists(cwd, DEGRADED_STATE_PATH);
  if (!artifact) {
    return {
      path: null,
      aggregate_state: null,
      caveats: [],
    };
  }

  const caveats = [];
  if (artifact.aggregate_state && artifact.aggregate_state !== 'HEALTHY') {
    caveats.push({
      type: 'degraded_state_caveat',
      description: `Current degraded truth posture is ${artifact.aggregate_state}.`,
      source: DEGRADED_STATE_PATH,
      state: artifact.aggregate_state,
    });
  }
  for (const blocked of artifact.blocked_workflows || []) {
    caveats.push({
      type: 'workflow_block',
      description: `${blocked.workflow} blocked by ${blocked.subsystem}: ${blocked.reason}`,
      source: DEGRADED_STATE_PATH,
      state: artifact.aggregate_state,
    });
  }

  return {
    path: DEGRADED_STATE_PATH,
    aggregate_state: artifact.aggregate_state || null,
    caveats,
  };
}

function shouldUseStrictMode(phaseNum, options = {}) {
  if (typeof options.strict === 'boolean') return options.strict;
  return comparePhaseNum(String(phaseNum), '78') >= 0;
}

function deriveStatus(inputs, gaps, options = {}) {
  const strict = shouldUseStrictMode(inputs.phase, options);
  const invalidReasons = [];
  const conditionalReasons = [];

  if (!inputs.verification.exists) {
    const reason = 'Verification artifact is missing.';
    if (strict) invalidReasons.push(reason);
    else conditionalReasons.push(reason);
  } else {
    if (!inputs.verification.valid_contract) {
      const reason = 'Verification artifact does not satisfy the evidence-first verification contract.';
      if (strict) invalidReasons.push(reason);
      else conditionalReasons.push(reason);
    }
    if (inputs.verification.final_status === 'INVALID') {
      invalidReasons.push('Phase verification artifact reports INVALID.');
    } else if (inputs.verification.final_status === 'CONDITIONAL') {
      conditionalReasons.push('Phase verification artifact reports CONDITIONAL.');
    }
  }

  if (inputs.summary_count === 0) {
    const reason = 'No summary artifacts exist for this phase.';
    if (strict) invalidReasons.push(reason);
    else conditionalReasons.push(reason);
  } else if (inputs.summary_count < inputs.plan_count) {
    invalidReasons.push(`Summary coverage is incomplete (${inputs.summary_count}/${inputs.plan_count}).`);
  }

  if (inputs.reconciliation.highest_phase_status === 'INVALID' || inputs.reconciliation.highest_verification_status === 'INVALID') {
    invalidReasons.push('Applied reconciliation downgrades this phase to INVALID.');
  } else if (inputs.reconciliation.highest_phase_status === 'CONDITIONAL' || inputs.reconciliation.highest_verification_status === 'CONDITIONAL') {
    conditionalReasons.push('Applied reconciliation downgrades this phase to CONDITIONAL.');
  }

  if (inputs.drift.highest_severity === 'CRITICAL') {
    invalidReasons.push('Active CRITICAL drift affects this phase.');
  } else if (inputs.drift.highest_severity === 'MAJOR') {
    conditionalReasons.push('Active MAJOR drift affects this phase.');
  }

  if (inputs.degraded.aggregate_state === 'UNSAFE') {
    conditionalReasons.push('Current degraded truth posture is UNSAFE.');
  } else if (inputs.degraded.aggregate_state === 'DEGRADED') {
    conditionalReasons.push('Current degraded truth posture is DEGRADED.');
  }

  for (const gap of gaps) {
    if (gap.type === 'missing_required_evidence' || gap.type === 'broken_proof_chain') {
      invalidReasons.push(gap.description);
    } else {
      conditionalReasons.push(gap.description);
    }
  }

  if (invalidReasons.length > 0) {
    return {
      final_status: 'INVALID',
      status_reason: Array.from(new Set(invalidReasons)),
    };
  }
  if (conditionalReasons.length > 0) {
    return {
      final_status: 'CONDITIONAL',
      status_reason: Array.from(new Set(conditionalReasons)),
    };
  }
  return {
    final_status: 'VALID',
    status_reason: ['All claimed outcomes are backed and no unresolved gaps or downgrades remain.'],
  };
}

function validatePhaseTruth(truth) {
  const errors = [];
  if (!truth.phase) errors.push('phase is required');
  if (!truth.title) errors.push('title is required');
  if (!truth.generated_at) errors.push('generated_at is required');
  if (!truth.inputs || typeof truth.inputs !== 'object') errors.push('inputs object is required');
  if (!Array.isArray(truth.claimed_outcomes)) errors.push('claimed_outcomes must be an array');
  if (!Array.isArray(truth.observable_evidence)) errors.push('observable_evidence must be an array');
  if (!Array.isArray(truth.gaps)) errors.push('gaps must be an array');
  if (!Array.isArray(truth.drift_effects)) errors.push('drift_effects must be an array');
  if (!Array.isArray(truth.reconciliation_effects)) errors.push('reconciliation_effects must be an array');
  if (!Array.isArray(truth.status_reason)) errors.push('status_reason must be an array');
  if (!['VALID', 'CONDITIONAL', 'INVALID'].includes(truth.final_status)) {
    errors.push('final_status must be VALID, CONDITIONAL, or INVALID');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

function renderScalar(value) {
  if (value == null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}

function renderYaml(value, indent = 0) {
  const prefix = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${prefix}[]`;
    return value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (entries.length === 0) return `${prefix}- {}`;
        const [firstKey, firstValue] = entries[0];
        const firstLine = typeof firstValue === 'object' && firstValue !== null
          ? `${prefix}- ${firstKey}:\n${renderYaml(firstValue, indent + 4)}`
          : `${prefix}- ${firstKey}: ${renderScalar(firstValue)}`;
        const rest = entries.slice(1).map(([key, nestedValue]) => {
          if (nestedValue && typeof nestedValue === 'object') {
            return `${' '.repeat(indent + 2)}${key}:\n${renderYaml(nestedValue, indent + 4)}`;
          }
          return `${' '.repeat(indent + 2)}${key}: ${renderScalar(nestedValue)}`;
        });
        return [firstLine, ...rest].join('\n');
      }
      return `${prefix}- ${renderScalar(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${prefix}{}`;
    return entries.map(([key, nestedValue]) => {
      if (nestedValue && typeof nestedValue === 'object') {
        return `${prefix}${key}:\n${renderYaml(nestedValue, indent + 2)}`;
      }
      return `${prefix}${key}: ${renderScalar(nestedValue)}`;
    }).join('\n');
  }
  return `${prefix}${renderScalar(value)}`;
}

function renderMarkdown(truth) {
  const lines = [
    `# Phase ${truth.phase}: ${truth.title} — Truth`,
    '',
    `**Generated:** ${truth.generated_at}`,
    `**Final Status:** ${truth.final_status}`,
    '',
    '## Status Reasons',
  ];

  for (const reason of truth.status_reason) {
    lines.push(`- ${reason}`);
  }

  lines.push('', '## Inputs');
  lines.push(`- Verification: ${truth.inputs.verification || 'None'}`);
  lines.push(`- Summaries: ${truth.inputs.summaries.length > 0 ? truth.inputs.summaries.join(', ') : 'None'}`);
  lines.push(`- Drift reports: ${truth.inputs.drift_reports.length > 0 ? truth.inputs.drift_reports.join(', ') : 'None'}`);
  lines.push(`- Reconciliation: ${truth.inputs.reconciliation.length > 0 ? truth.inputs.reconciliation.join(', ') : 'None'}`);
  lines.push(`- Degraded state: ${truth.inputs.degraded_state.length > 0 ? truth.inputs.degraded_state.join(', ') : 'None'}`);

  lines.push('', '## Claimed Outcomes');
  for (const outcome of truth.claimed_outcomes) {
    const label = outcome.id ? `\`${outcome.id}\` — ` : '';
    lines.push(`- ${label}${outcome.description}`);
  }
  if (truth.claimed_outcomes.length === 0) lines.push('- None');

  lines.push('', '## Observable Evidence');
  for (const evidence of truth.observable_evidence) {
    lines.push(`- ${evidence.type}: ${evidence.ref}`);
  }
  if (truth.observable_evidence.length === 0) lines.push('- None');

  lines.push('', '## Gaps');
  for (const gap of truth.gaps) {
    lines.push(`- ${gap.type}: ${gap.description}`);
  }
  if (truth.gaps.length === 0) lines.push('- None');

  lines.push('', '## Drift Effects');
  for (const effect of truth.drift_effects) {
    lines.push(`- ${effect.severity || 'UNKNOWN'} ${effect.type || 'drift'}: ${effect.description}`);
  }
  if (truth.drift_effects.length === 0) lines.push('- None');

  lines.push('', '## Reconciliation Effects');
  for (const effect of truth.reconciliation_effects) {
    lines.push(`- ${effect.surface}: ${effect.applied_status || 'n/a'} (${effect.reason || 'no reason'})`);
  }
  if (truth.reconciliation_effects.length === 0) lines.push('- None');

  return lines.join('\n') + '\n';
}

function derivePhaseTruth(cwd, phase, options = {}) {
  const { phaseInfo, phaseDir, plans, summaries, verification } = listPhaseArtifacts(cwd, phase);
  const roadmapPhase = getRoadmapPhaseInternal(cwd, phaseInfo.phase_number) || {};
  const requirementDescriptions = parseRequirementDescriptions(cwd);
  const summaryOutcomeData = extractSummaryOutcomes(cwd, phaseDir, summaries);
  const verificationPath = verification ? path.join(phaseDir, verification) : null;
  const verificationState = loadVerificationState(cwd, verificationPath ? toRelative(cwd, verificationPath) : null);
  const drift = collectDriftEffects(cwd, phaseInfo.phase_number, phaseInfo);
  const reconciliation = collectReconciliationEffects(cwd, phaseInfo.phase_number);
  const degraded = collectDegradedEffects(cwd);
  const strict = shouldUseStrictMode(phaseInfo.phase_number, options);

  const requirementIds = parseRequirementIds(roadmapPhase.section || '');
  const claimedOutcomes = requirementIds.map((requirementId) => ({
    id: requirementId,
    description: requirementDescriptions[requirementId] || roadmapPhase.goal || `Phase ${phaseInfo.phase_number} truth outcome`,
    supporting_artifacts: [
      ...summaryOutcomeData.supporting,
      ...(verificationPath ? [toRelative(cwd, verificationPath)] : []),
    ].filter(Boolean),
  }));

  if (claimedOutcomes.length === 0 && roadmapPhase.goal) {
    claimedOutcomes.push({
      id: null,
      description: roadmapPhase.goal,
      supporting_artifacts: summaryOutcomeData.supporting,
    });
  }
  for (const outcome of summaryOutcomeData.outcomes) {
    claimedOutcomes.push(outcome);
  }

  const observableEvidence = [
    ...summaries.map((file) => ({ type: 'file', ref: toRelative(cwd, path.join(phaseDir, file)) })),
    ...(verificationPath ? [{ type: 'file', ref: toRelative(cwd, verificationPath) }] : []),
    { type: 'command', ref: `phase-truth generate ${normalizePhaseName(phaseInfo.phase_number)}` },
  ];

  const gaps = [];
  if (!verificationState.exists) {
    gaps.push({ type: 'verification_gap', description: 'Verification artifact is missing.' });
  } else if (!verificationState.valid_contract) {
    gaps.push({
      type: 'verification_gap',
      description: `Verification artifact failed contract validation: ${(verificationState.result.errors || []).join('; ')}`,
    });
  }
  if (summaries.length === 0) {
    gaps.push({ type: 'missing_required_evidence', description: 'No summary artifacts exist for this phase.' });
  } else if (summaries.length < plans.length) {
    gaps.push({
      type: 'broken_proof_chain',
      description: `Summary coverage is incomplete (${summaries.length}/${plans.length}).`,
    });
  }
  for (const change of reconciliation.reverification_required) {
    gaps.push({
      type: 'reverification_required',
      description: change.reason || 'Reverification is required for this phase.',
    });
  }
  for (const caveat of degraded.caveats) {
    gaps.push({
      type: caveat.type,
      description: caveat.description,
    });
  }

  const status = deriveStatus({
    phase: phaseInfo.phase_number,
    verification: verificationState,
    summary_count: summaries.length,
    plan_count: plans.length,
    reconciliation,
    drift,
    degraded,
  }, gaps, { strict });

  const truth = {
    phase: normalizePhaseName(phaseInfo.phase_number),
    title: roadmapPhase.phase_name || phaseInfo.phase_name || 'Unnamed Phase',
    generated_at: options.now || new Date().toISOString(),
    strict,
    inputs: {
      verification: verificationPath ? toRelative(cwd, verificationPath) : null,
      summaries: summaries.map((file) => toRelative(cwd, path.join(phaseDir, file))),
      drift_reports: drift.report_path ? [drift.report_path] : [],
      reconciliation: reconciliation.path ? [reconciliation.path] : [],
      degraded_state: degraded.path ? [degraded.path] : [],
    },
    claimed_outcomes: claimedOutcomes,
    observable_evidence: observableEvidence,
    gaps,
    drift_effects: drift.effects,
    reconciliation_effects: reconciliation.effects,
    escalations: (verificationState.result?.warnings || []).map((warning) => ({
      required: false,
      description: warning,
    })),
    final_status: status.final_status,
    status_reason: status.status_reason,
  };

  const validation = validatePhaseTruth(truth);
  if (!validation.valid) {
    throw new Error(`Phase truth validation failed: ${validation.errors.join('; ')}`);
  }
  return truth;
}

function writePhaseTruth(cwd, phase, options = {}) {
  const { phaseInfo, phaseDir } = getPhaseDirectory(cwd, phase);
  const truth = derivePhaseTruth(cwd, phaseInfo.phase_number, options);
  const normalizedPhase = normalizePhaseName(phaseInfo.phase_number);
  const yamlPath = path.join(phaseDir, `${normalizedPhase}-TRUTH.yaml`);
  const markdownPath = path.join(phaseDir, `${normalizedPhase}-TRUTH.md`);
  safeWriteFile(yamlPath, renderYaml(truth) + '\n');
  safeWriteFile(markdownPath, renderMarkdown(truth));
  return {
    phase: normalizedPhase,
    title: truth.title,
    final_status: truth.final_status,
    strict: truth.strict,
    machine_artifact: toRelative(cwd, yamlPath),
    markdown_artifact: toRelative(cwd, markdownPath),
    truth,
  };
}

function triggerPhaseTruthGeneration(cwd, phase, options = {}) {
  if (!phase) {
    return { generated: false, reason: 'phase_unresolved' };
  }
  try {
    const result = writePhaseTruth(cwd, phase, options);
    return {
      generated: true,
      source: options.source || null,
      ...result,
    };
  } catch (error) {
    return {
      generated: false,
      phase: normalizePhaseName(phase),
      source: options.source || null,
      error: error.message,
    };
  }
}

module.exports = {
  DEGRADED_STATE_PATH,
  DRIFT_REPORT_PATH,
  RECONCILIATION_PATH,
  derivePhaseTruth,
  inferPhaseFromPath,
  renderMarkdown,
  renderYaml,
  triggerPhaseTruthGeneration,
  validatePhaseTruth,
  writePhaseTruth,
};
