/**
 * Drift Classifier — deterministic Phase 70 classification helpers
 */

function inferDriftType(entry) {
  if (entry.drift_type) return entry.drift_type;

  switch (entry.surface_category) {
    case 'planning_artifact':
      return 'spec_drift';
    case 'runtime_surface':
    case 'cli_operator':
    case 'installed_runtime':
      return 'execution_drift';
    case 'verification_surface':
      return 'verification_drift';
    case 'memory_boundary':
      return 'implementation_drift';
    case 'degraded_mode':
      return 'execution_drift';
    case 'historical_structural':
      return 'verification_drift';
    default:
      return 'implementation_drift';
  }
}

function normalizeLevel(value, fallback = 'low') {
  return value === 'high' ? 'high' : fallback;
}

function classifySeverity({ impact, exploitability, false_truth_perception = false }) {
  if (false_truth_perception) return 'CRITICAL';

  const normalizedImpact = normalizeLevel(impact);
  const normalizedExploitability = normalizeLevel(exploitability);

  if (normalizedImpact === 'high' && normalizedExploitability === 'high') return 'CRITICAL';
  if (normalizedImpact === 'high' || normalizedExploitability === 'high') return 'MAJOR';
  return 'MINOR';
}

function classifyActivity(entry) {
  if (entry.historical === true) return 'historical';
  if (entry.affects_current_truth === false) return 'historical';
  if (entry.observed_drift === true) return 'active';
  return 'healthy';
}

function classifyMemoryTrustBoundary(entry) {
  const detail = entry.memory_boundary_state || entry.boundary_state || null;
  if (detail === 'trusted' || detail === 'degraded' || detail === 'disabled') {
    return detail;
  }
  return null;
}

function validateEntryShape(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Catalog entry must be an object');
  }
  if (!entry.requirement_id) {
    throw new Error('Catalog entry missing requirement_id');
  }
  if (!entry.claim) {
    throw new Error('Catalog entry missing claim');
  }
  if (!entry.implementation || !Array.isArray(entry.implementation.paths) || entry.implementation.paths.length === 0) {
    throw new Error('Catalog entry missing implementation.paths');
  }
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    throw new Error('Catalog entry missing evidence');
  }
}

function classifyEntry(entry) {
  validateEntryShape(entry);

  const driftType = inferDriftType(entry);
  const activityStatus = classifyActivity(entry);
  const severity = activityStatus === 'healthy'
    ? 'MINOR'
    : classifySeverity({
    impact: entry.impact,
    exploitability: entry.exploitability,
    false_truth_perception: entry.false_truth_perception,
  });

  return {
    ...entry,
    drift_type: driftType,
    activity_status: activityStatus,
    severity,
    blocking: activityStatus === 'active',
    memory_boundary_state: classifyMemoryTrustBoundary(entry),
  };
}

function classifyCatalogEntries(entries) {
  return (entries || []).map(classifyEntry);
}

function groupEntries(entries) {
  const grouped = {
    active: [],
    historical: [],
    healthy: [],
  };

  for (const entry of entries || []) {
    if (entry.activity_status === 'active') grouped.active.push(entry);
    else if (entry.activity_status === 'historical') grouped.historical.push(entry);
    else grouped.healthy.push(entry);
  }

  return grouped;
}

module.exports = {
  classifyActivity,
  classifyCatalogEntries,
  classifyEntry,
  classifyMemoryTrustBoundary,
  classifySeverity,
  groupEntries,
  inferDriftType,
  validateEntryShape,
};
