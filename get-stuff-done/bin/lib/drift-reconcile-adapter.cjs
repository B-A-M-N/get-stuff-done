const crypto = require('crypto');
const { REPORT_PATH, readLatestReport } = require('./drift-engine.cjs');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function inferTargetPhase(finding) {
  const id = String(finding.id || '');
  const match = id.match(/^phase(\d+(?:\.\d+)?)/i);
  return match ? match[1] : null;
}

function adaptDriftReport(report, options = {}) {
  if (!report || report.schema !== 'gsd_drift_report') {
    throw new Error('Phase 74 requires a valid Phase 73 drift report');
  }

  return {
    source_report: options.source_report || REPORT_PATH,
    source_report_hash: sha256(JSON.stringify(report)),
    generated_at: report.generated_at || null,
    summary: report.summary || {},
    normalized_drift: (report.findings || []).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      drift_type: finding.drift_type,
      target_phase: inferTargetPhase(finding),
      activity_status: finding.activity_status,
      historical: finding.activity_status === 'historical' || finding.historical === true,
      affected: finding.affected || {},
      predicted_effect: finding.predicted_effect || {},
      evidence: Array.isArray(finding.evidence) ? finding.evidence.map((item) => item.ref || item) : [],
      claim: finding.claim || null,
    })),
  };
}

function loadAdaptedReport(cwd) {
  const report = readLatestReport(cwd);
  if (!report) {
    throw new Error('No drift report available to reconcile');
  }
  return adaptDriftReport(report, { source_report: REPORT_PATH });
}

module.exports = {
  REPORT_PATH,
  adaptDriftReport,
  loadAdaptedReport,
};
