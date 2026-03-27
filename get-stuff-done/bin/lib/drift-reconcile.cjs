const fs = require('fs');
const path = require('path');
const { parseStateSnapshot, applyReconciliationState } = require('./state.cjs');
const { applyPhaseReconciliationStatus, parseRoadmap } = require('./roadmap.cjs');
const { REPORT_PATH, loadAdaptedReport } = require('./drift-reconcile-adapter.cjs');

const RECONCILIATION_PATH = '.planning/drift/latest-reconciliation.json';

const SEVERITY_ORDER = {
  MINOR: 1,
  MAJOR: 2,
  CRITICAL: 3,
};

const MATRIX = {
  CRITICAL: {
    verification_status: 'INVALID',
    phase_status: 'INVALID',
    roadmap_status: 'BLOCKED',
    operator_health: 'UNHEALTHY',
  },
  MAJOR: {
    verification_status: 'CONDITIONAL',
    phase_status: 'CONDITIONAL',
    roadmap_status: 'AT_RISK',
    operator_health: 'DEGRADED',
  },
  MINOR: {
    verification_status: 'VALID',
    phase_status: 'VALID',
    roadmap_status: 'INFO',
    operator_health: 'HEALTHY_WITH_WARNINGS',
  },
};

function normalizeSeverity(value) {
  return SEVERITY_ORDER[value] ? value : 'MINOR';
}

function maxSeverity(a, b) {
  return SEVERITY_ORDER[normalizeSeverity(a)] >= SEVERITY_ORDER[normalizeSeverity(b)] ? normalizeSeverity(a) : normalizeSeverity(b);
}

function readStateSnapshot(cwd) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) {
    return {};
  }
  return parseStateSnapshot(fs.readFileSync(statePath, 'utf-8'));
}

function currentPhaseFromState(cwd) {
  const snapshot = readStateSnapshot(cwd);
  return snapshot.current_phase ? String(snapshot.current_phase) : null;
}

function buildChange(surface, target, severity, drift, fromValue = 'UNSET') {
  return {
    severity,
    surface,
    target,
    from: fromValue,
    to: MATRIX[severity][surface],
    reason: drift.drift_type || 'drift_detected',
    evidence: drift.evidence || [],
  };
}

function evaluateReconciliation(normalized, options = {}) {
  const timestamp = options.now || new Date().toISOString();
  const fallbackPhase = options.current_phase || null;
  const appliedByKey = new Map();
  const unchanged = [];
  const reverificationRequired = [];

  for (const drift of normalized.normalized_drift || []) {
    if (drift.historical) {
      unchanged.push({
        surface: 'historical_drift',
        reason: 'historical_only_drift',
        target: drift.target_phase ? `phase_${drift.target_phase}` : drift.id,
      });
      continue;
    }

    const severity = normalizeSeverity(drift.severity);
    const targetPhase = drift.target_phase || fallbackPhase || 'unknown';
    const phaseTarget = `phase_${targetPhase}`;

    for (const surface of ['verification_status', 'phase_status', 'roadmap_status', 'operator_health']) {
      const key = `${surface}:${phaseTarget}`;
      const existing = appliedByKey.get(key);
      if (!existing || SEVERITY_ORDER[severity] > SEVERITY_ORDER[existing.severity]) {
        appliedByKey.set(key, buildChange(surface, phaseTarget, severity, drift));
      }
    }

    if (severity === 'CRITICAL' || severity === 'MAJOR') {
      reverificationRequired.push({
        target: phaseTarget,
        reason: `${drift.drift_type || 'drift'} invalidated or downgraded trusted truth`,
      });
    }
  }

  const appliedChanges = Array.from(appliedByKey.values());
  return {
    timestamp,
    source_report: normalized.source_report || REPORT_PATH,
    source_report_hash: normalized.source_report_hash || null,
    applied_changes: appliedChanges,
    unchanged,
    reverification_required: reverificationRequired,
    summary: {
      critical: normalized.summary?.critical || 0,
      major: normalized.summary?.major || 0,
      minor: normalized.summary?.minor || 0,
    },
  };
}

function writeLatestReconciliation(cwd, decision) {
  const targetPath = path.join(cwd, RECONCILIATION_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(decision, null, 2) + '\n', 'utf-8');
  return {
    path: RECONCILIATION_PATH,
    decision,
  };
}

function applyReconciliation(cwd, decision, options = {}) {
  const currentPhase = currentPhaseFromState(cwd);
  const highest = decision.applied_changes.reduce((acc, item) => maxSeverity(acc, item.severity), 'MINOR');
  const stateMarkers = {
    drift_present: decision.applied_changes.length > 0,
    highest_severity: decision.applied_changes.length > 0 ? highest : 'NONE',
    verification_status: decision.applied_changes.find((item) => item.surface === 'verification_status')?.to || 'VALID',
    phase_status: decision.applied_changes.find((item) => item.surface === 'phase_status')?.to || 'VALID',
    roadmap_status: decision.applied_changes.find((item) => item.surface === 'roadmap_status')?.to || 'INFO',
    operator_health: decision.applied_changes.find((item) => item.surface === 'operator_health')?.to || 'HEALTHY_WITH_WARNINGS',
    requires_reverification: decision.reverification_required.length > 0,
    reverification_reason: decision.reverification_required.map((item) => item.reason).join('; ') || 'none',
    source_report: decision.source_report,
    timestamp: decision.timestamp,
  };

  const stateResult = applyReconciliationState(cwd, stateMarkers);
  const roadmap = parseRoadmap(cwd);
  const touchedPhases = Array.from(new Set(
    decision.applied_changes
      .filter((item) => item.surface === 'roadmap_status')
      .map((item) => item.target.replace(/^phase_/, ''))
  ));

  const roadmapResults = touchedPhases.map((phaseNum) => {
    const status = decision.applied_changes.find((item) => item.surface === 'roadmap_status' && item.target === `phase_${phaseNum}`)?.to;
    if (!roadmap.phases.some((phase) => phase.number === phaseNum)) {
      return {
        updated: false,
        path: '.planning/ROADMAP.md',
        phase: phaseNum,
        status,
        reason: 'phase_not_found',
      };
    }
    return applyPhaseReconciliationStatus(cwd, phaseNum, status, options);
  });

  const persisted = writeLatestReconciliation(cwd, decision);
  return {
    ...persisted,
    state: stateResult,
    roadmap: roadmapResults,
    current_phase: currentPhase,
  };
}

function previewReconciliation(cwd, options = {}) {
  const normalized = options.normalized || loadAdaptedReport(cwd);
  return evaluateReconciliation(normalized, {
    ...options,
    current_phase: options.current_phase || currentPhaseFromState(cwd),
  });
}

module.exports = {
  MATRIX,
  RECONCILIATION_PATH,
  applyReconciliation,
  evaluateReconciliation,
  previewReconciliation,
  writeLatestReconciliation,
};
