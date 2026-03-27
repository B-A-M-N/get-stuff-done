const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  CATALOG_PATH,
  buildCatalog,
  buildSurfaceEntries,
  collectProbeResults,
} = require('./drift-catalog.cjs');
const {
  buildAffectedTruths,
  buildPredictedEffect,
  classifyCatalogEntries,
  classifyConfidence,
  inferDriftType,
} = require('./drift-classifier.cjs');

const REPORT_PATH = '.planning/drift/latest-report.json';
const DEFAULT_STALE_MS = 60 * 60 * 1000;

function stableStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function loadFixtureOptions() {
  const fixturePath = process.env.GSD_DRIFT_TEST_FIXTURE;
  if (!fixturePath) return {};
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
}

function resolveOptions(options = {}) {
  return { ...loadFixtureOptions(), ...options };
}

function loadBaselineCatalog(cwd, options = {}) {
  if (options.catalog) return options.catalog;
  return buildCatalog(cwd, options);
}

function loadRuntimeEntries(cwd, options = {}) {
  if (Array.isArray(options.runtimeEntries)) return options.runtimeEntries;
  const probes = options.probes || collectProbeResults(cwd, options);
  const entries = classifyCatalogEntries(buildSurfaceEntries(cwd, probes));
  return entries.concat(Array.isArray(options.discoveredSurfaces) ? options.discoveredSurfaces : []);
}

function toFinding(entry, overrides = {}) {
  const severity = overrides.severity || entry.severity || 'MINOR';
  const activityStatus = overrides.activity_status || entry.activity_status || 'active';
  return {
    id: overrides.id || entry.id,
    requirement_id: entry.requirement_id || null,
    claim: entry.claim || null,
    surface_category: entry.surface_category || 'runtime_surface',
    drift_type: overrides.drift_type || entry.drift_type || inferDriftType(entry),
    surface_state: overrides.surface_state || 'active_drift',
    activity_status: activityStatus,
    severity,
    confidence: overrides.confidence || classifyConfidence(entry),
    evidence: Array.isArray(entry.evidence) ? entry.evidence : [],
    implementation: entry.implementation || { paths: [] },
    notes: overrides.notes || entry.notes || null,
    observed_drift: overrides.observed_drift ?? entry.observed_drift ?? true,
    historical: activityStatus === 'historical',
    affects_current_truth: activityStatus !== 'historical',
    predicted_effect: buildPredictedEffect({ severity, activity_status: activityStatus }),
    affected: buildAffectedTruths({ severity, activity_status: activityStatus }),
  };
}

function summarizeSurfaces(surfaces) {
  const summary = {
    active: 0,
    healthy: 0,
    historical: 0,
    critical: 0,
    major: 0,
    minor: 0,
    missing_surface: 0,
    untracked_surface: 0,
    insufficient_evidence: 0,
    degraded_state: 0,
  };

  for (const surface of surfaces) {
    if (surface.activity_status === 'active') {
      summary.active += 1;
      if (surface.severity === 'CRITICAL') summary.critical += 1;
      else if (surface.severity === 'MAJOR') summary.major += 1;
      else summary.minor += 1;
    } else if (surface.activity_status === 'historical') {
      summary.historical += 1;
    } else {
      summary.healthy += 1;
    }

    if (surface.surface_state === 'missing_surface'
      || surface.surface_state === 'untracked_surface'
      || surface.surface_state === 'insufficient_evidence'
      || surface.surface_state === 'degraded_state') {
      summary[surface.surface_state] += 1;
    }
  }

  return summary;
}

function hasBlockingDrift(report) {
  return (report.findings || []).some((finding) => (
    finding.activity_status === 'active' && finding.severity === 'CRITICAL'
  ));
}

function getHighestActiveSeverity(report) {
  if (!report || !Array.isArray(report.findings)) return null;
  if (report.findings.some((finding) => finding.activity_status === 'active' && finding.severity === 'CRITICAL')) {
    return 'CRITICAL';
  }
  if (report.findings.some((finding) => finding.activity_status === 'active' && finding.severity === 'MAJOR')) {
    return 'MAJOR';
  }
  if (report.findings.some((finding) => finding.activity_status === 'active' && finding.severity === 'MINOR')) {
    return 'MINOR';
  }
  return null;
}

function scanDrift(cwd, options = {}) {
  const resolved = resolveOptions(options);
  const catalog = loadBaselineCatalog(cwd, resolved);
  const runtimeEntries = loadRuntimeEntries(cwd, resolved);
  const runtimeById = new Map(runtimeEntries.map((entry) => [entry.id, entry]));
  const surfaces = [];

  for (const baseline of catalog.entries || []) {
    const runtime = runtimeById.get(baseline.id);
    runtimeById.delete(baseline.id);

    if (!runtime) {
      surfaces.push(toFinding(baseline, {
        surface_state: 'missing_surface',
        activity_status: 'active',
        notes: `Expected baseline surface from ${CATALOG_PATH} was not observed in the current scan.`,
      }));
      continue;
    }

    if (runtime.observation_status === 'insufficient_evidence' || runtime.surface_state === 'insufficient_evidence') {
      surfaces.push(toFinding({ ...baseline, ...runtime }, {
        surface_state: 'insufficient_evidence',
        activity_status: 'active',
        severity: 'MINOR',
        confidence: 'low',
      }));
      continue;
    }

    if (runtime.observation_status === 'degraded_state' || runtime.surface_state === 'degraded_state') {
      surfaces.push(toFinding({ ...baseline, ...runtime }, {
        surface_state: 'degraded_state',
        activity_status: 'active',
        severity: runtime.severity === 'CRITICAL' ? 'CRITICAL' : 'MAJOR',
        confidence: 'medium',
      }));
      continue;
    }

    if (runtime.activity_status === 'historical') {
      surfaces.push(toFinding({ ...baseline, ...runtime }, {
        surface_state: 'historical',
        activity_status: 'historical',
      }));
      continue;
    }

    if (runtime.observed_drift === true || runtime.activity_status === 'active') {
      surfaces.push(toFinding({ ...baseline, ...runtime }, {
        surface_state: 'active_drift',
        activity_status: 'active',
      }));
      continue;
    }

    surfaces.push(toFinding({ ...baseline, ...runtime }, {
      surface_state: 'healthy',
      activity_status: 'healthy',
      observed_drift: false,
      severity: runtime.severity || baseline.severity || 'MINOR',
    }));
  }

  for (const runtime of runtimeById.values()) {
    surfaces.push(toFinding(runtime, {
      surface_state: 'untracked_surface',
      activity_status: runtime.activity_status === 'historical' ? 'historical' : 'active',
      severity: runtime.severity || 'MAJOR',
      notes: runtime.notes || 'Observed runtime truth surface is not represented in the Phase 70 baseline catalog.',
    }));
  }

  const findings = surfaces.filter((surface) => surface.surface_state !== 'healthy');
  return {
    schema: 'gsd_drift_report',
    generated_at: resolved.now || new Date().toISOString(),
    catalog_source: CATALOG_PATH,
    catalog_hash: catalog.catalog_hash || sha256(stableStringify(catalog.entries || [])),
    source_head: resolved.probes?.head || 'unknown',
    summary: summarizeSurfaces(surfaces),
    surfaces,
    findings,
  };
}

function writeLatestReport(cwd, report) {
  const targetPath = path.join(cwd, REPORT_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  return {
    path: REPORT_PATH,
    report,
  };
}

function readLatestReport(cwd) {
  const targetPath = path.join(cwd, REPORT_PATH);
  if (!fs.existsSync(targetPath)) return null;
  return JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
}

function getLatestReportState(cwd, options = {}) {
  const report = readLatestReport(cwd);
  if (!report) {
    return {
      status: 'missing',
      path: REPORT_PATH,
      detail: 'No drift report has been generated yet.',
      report: null,
    };
  }

  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const generatedAt = Date.parse(report.generated_at || '');
  const ageMs = Number.isFinite(generatedAt) ? Math.max(0, now - generatedAt) : Number.POSITIVE_INFINITY;
  const staleAfterMs = options.staleAfterMs || DEFAULT_STALE_MS;
  if (!Number.isFinite(generatedAt) || ageMs > staleAfterMs) {
    return {
      status: 'stale',
      path: REPORT_PATH,
      detail: 'Drift report is stale and should be refreshed with `drift scan`.',
      age_ms: Number.isFinite(ageMs) ? ageMs : null,
      report,
    };
  }

  return {
    status: 'ok',
    path: REPORT_PATH,
    detail: null,
    age_ms: ageMs,
    report,
  };
}

function getHealthSnapshot(cwd, options = {}) {
  const latest = getLatestReportState(cwd, options);
  if (latest.status === 'missing' || latest.status === 'stale') {
    return {
      status: latest.status,
      path: latest.path,
      detail: latest.detail,
      highest_severity: null,
      active_findings: 0,
    };
  }

  const highest = getHighestActiveSeverity(latest.report);
  const activeFindings = latest.report.summary?.active || 0;
  if (highest === 'CRITICAL' || highest === 'MAJOR') {
    return {
      status: 'degraded',
      path: REPORT_PATH,
      detail: `Active ${highest} drift is present in the latest report.`,
      highest_severity: highest,
      active_findings: activeFindings,
    };
  }

  return {
    status: 'ok',
    path: REPORT_PATH,
    detail: activeFindings > 0 ? 'Only minor active drift is present.' : 'No active drift detected in the latest report.',
    highest_severity: highest,
    active_findings: activeFindings,
  };
}

function renderStatus(stateOrReport, options = {}) {
  if (stateOrReport && stateOrReport.status && !stateOrReport.schema) {
    const lines = [
      `Drift status: ${stateOrReport.status}`,
      `Report: ${stateOrReport.path}`,
      stateOrReport.detail || '',
    ].filter(Boolean);
    return lines.join('\n') + '\n';
  }

  const report = stateOrReport;
  const full = Boolean(options.full);
  const active = (report.findings || []).filter((finding) => finding.activity_status === 'active');
  const historical = (report.findings || []).filter((finding) => finding.activity_status === 'historical');
  const highest = getHighestActiveSeverity(report) || 'none';
  const lines = [
    `Drift status: ${active.length > 0 ? 'degraded' : 'healthy'}`,
    `Highest active severity: ${highest}`,
    `Generated at: ${report.generated_at}`,
    `Report: ${REPORT_PATH}`,
    '',
    'Active findings:',
  ];

  if (active.length === 0) {
    lines.push('- none');
  } else {
    for (const finding of active) {
      lines.push(`- [${finding.severity}] ${finding.id} (${finding.surface_state}, ${finding.drift_type})`);
    }
  }

  if (full) {
    lines.push('', 'Historical findings:');
    if (historical.length === 0) {
      lines.push('- none');
    } else {
      for (const finding of historical) {
        lines.push(`- [${finding.severity}] ${finding.id} (${finding.surface_state}, ${finding.drift_type})`);
      }
    }
  } else if (historical.length > 0) {
    lines.push('', `Historical findings suppressed: ${historical.length} (use --full)`);
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  DEFAULT_STALE_MS,
  REPORT_PATH,
  getHealthSnapshot,
  getHighestActiveSeverity,
  getLatestReportState,
  hasBlockingDrift,
  readLatestReport,
  renderStatus,
  scanDrift,
  writeLatestReport,
};
