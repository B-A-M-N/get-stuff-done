function normalizeList(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (!normalized) return null;
  if (!['VALID', 'CONDITIONAL', 'INVALID'].includes(normalized)) {
    throw new Error('retro verification statuses must be VALID, CONDITIONAL, or INVALID');
  }
  return normalized;
}

function joinEvidence(evidence, fallback) {
  const normalized = normalizeList(evidence);
  if (normalized.length > 0) return normalized.join(', ');
  return fallback;
}

function buildGapText(gaps) {
  const normalized = normalizeList(gaps);
  return normalized.length > 0 ? normalized.join(' ; ') : '-';
}

function deriveRowStatus(row = {}) {
  const explicitStatus = normalizeStatus(row.status);
  if (explicitStatus) return explicitStatus;

  const directEvidence = normalizeList(row.direct_evidence);
  const gaps = normalizeList(row.gaps);

  if (directEvidence.length > 0 && gaps.length === 0) return 'VALID';
  if (gaps.length > 0) return 'CONDITIONAL';
  return 'INVALID';
}

function deriveOverallStatus(requirementRows, antiPatterns) {
  const statuses = requirementRows.map((row) => row.status);
  const classifications = (Array.isArray(antiPatterns) ? antiPatterns : [])
    .map((entry) => String(entry.classification || '').trim().toLowerCase());

  if (statuses.includes('INVALID') || classifications.includes('blocker')) {
    return 'INVALID';
  }
  if (statuses.includes('CONDITIONAL') || classifications.includes('degrader')) {
    return 'CONDITIONAL';
  }
  return 'VALID';
}

function buildDriftAnalysis(requirementRows, truthGaps, antiPatterns) {
  const entries = [];
  const gapDescriptions = normalizeList(
    (Array.isArray(truthGaps) ? truthGaps : []).map((gap) => gap.description || gap)
  );

  requirementRows.forEach((row) => {
    if (row.status !== 'VALID') {
      entries.push({
        type: 'verification_drift',
        description: `${row.requirement} remains ${row.status} because ${buildGapText(row.gaps)}`,
      });
    }
  });

  gapDescriptions.forEach((description) => {
    entries.push({
      type: 'verification_drift',
      description,
    });
  });

  (Array.isArray(antiPatterns) ? antiPatterns : []).forEach((entry) => {
    const classification = String(entry.classification || '').trim().toLowerCase();
    if (!classification || classification === '-' || classification === 'historical_drift') return;
    entries.push({
      type: 'verification_drift',
      description: `${entry.file || 'artifact'} contains ${classification}: ${entry.pattern || entry.impact || 'unspecified issue'}`,
    });
  });

  if (entries.length === 0) return [];

  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.type}:${entry.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapRequirementRow(row = {}) {
  const status = deriveRowStatus(row);
  const directEvidence = normalizeList(row.direct_evidence);
  const summaryRefs = normalizeList(row.summary_refs);
  const gaps = normalizeList(row.gaps);

  return {
    requirement: String(row.requirement || '').trim(),
    description: String(row.description || '').trim(),
    status,
    evidence: joinEvidence(
      directEvidence,
      'runtime output: no direct evidence probe succeeded; summary references were treated as claim maps only'
    ),
    gap: buildGapText(gaps),
    direct_evidence: directEvidence,
    summary_refs: summaryRefs,
    gaps,
  };
}

function mapTruthRow(row = {}, index) {
  const directEvidence = normalizeList(row.direct_evidence);
  const gaps = normalizeList(row.gaps);
  const status = row.status ? normalizeStatus(row.status) : deriveRowStatus({
    direct_evidence: directEvidence,
    gaps,
  });

  return {
    index: index + 1,
    truth: String(row.truth || '').trim(),
    status,
    evidence: joinEvidence(
      directEvidence,
      'runtime output: no direct evidence probe succeeded; summary references were treated as claim maps only'
    ),
    summary_refs: normalizeList(row.summary_refs),
    gaps,
  };
}

function renderTable(headers, rows) {
  const header = `| ${headers.join(' | ')} |`;
  const divider = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.length > 0
    ? rows.map((row) => `| ${row.join(' | ')} |`).join('\n')
    : `| ${headers.map((value, index) => (index === 0 ? 'None' : '-')).join(' | ')} |`;
  return `${header}\n${divider}\n${body}`;
}

function buildRetroVerificationArtifact(input = {}) {
  const requirementRows = (Array.isArray(input.requirement_rows) ? input.requirement_rows : []).map(mapRequirementRow);
  const observableTruths = (Array.isArray(input.observable_truths) ? input.observable_truths : []).map(mapTruthRow);
  const antiPatterns = Array.isArray(input.anti_patterns) && input.anti_patterns.length > 0
    ? input.anti_patterns.map((entry) => ({
      file: String(entry.file || 'None').trim() || 'None',
      pattern: String(entry.pattern || '-').trim() || '-',
      classification: String(entry.classification || '-').trim() || '-',
      impact: String(entry.impact || '-').trim() || '-',
    }))
    : [{ file: 'None', pattern: '-', classification: '-', impact: '-' }];

  const finalStatus = deriveOverallStatus(requirementRows, antiPatterns);
  const driftAnalysis = buildDriftAnalysis(requirementRows, input.truth_gaps, antiPatterns);
  const validCount = requirementRows.filter((row) => row.status === 'VALID').length;
  const score = `${validCount}/${requirementRows.length || 0} requirements verified`;

  return {
    phase: input.phase,
    phase_number: input.phase_number,
    title: input.title,
    verified_at: input.verified_at,
    phase_goal: input.phase_goal,
    requirement_rows: requirementRows,
    observable_truths: observableTruths,
    required_artifacts: Array.isArray(input.required_artifacts) ? input.required_artifacts : [],
    key_links: Array.isArray(input.key_links) ? input.key_links : [],
    anti_patterns: antiPatterns,
    truth_gaps: Array.isArray(input.truth_gaps) ? input.truth_gaps : [],
    drift_analysis: driftAnalysis,
    final_status: {
      status: finalStatus,
      reason: input.final_reason || (
        finalStatus === 'VALID'
          ? 'Current direct evidence supports all in-scope requirement rows.'
          : finalStatus === 'CONDITIONAL'
            ? 'Current direct evidence is partial and explicit gaps remain visible.'
            : 'Current direct evidence disproves or cannot sustain one or more required outcomes.'
      ),
    },
    score,
    verifier: input.verifier || 'Codex',
    automated_checks: normalizeList(input.automated_checks),
    notes: normalizeList(input.notes),
    verification_approach: input.verification_approach || 'Evidence-first retroactive verification from current direct proof.',
  };
}

function renderRetroVerificationMarkdown(artifact) {
  const observableRows = artifact.observable_truths.map((row) => [
    String(row.index),
    row.truth,
    row.status,
    row.evidence,
  ]);
  const requiredArtifactRows = artifact.required_artifacts.map((entry) => [
    String(entry.artifact || entry.path || 'None'),
    String(entry.expected || entry.provides || '-'),
    String(entry.status || '-'),
    String(entry.details || '-'),
  ]);
  const keyLinkRows = artifact.key_links.map((entry) => [
    String(entry.from || '-'),
    String(entry.to || '-'),
    String(entry.via || '-'),
    String(entry.status || '-'),
    String(entry.details || '-'),
  ]);
  const requirementRows = artifact.requirement_rows.map((row) => [
    row.requirement,
    row.status,
    row.evidence,
    row.gap,
  ]);
  const antiPatternRows = artifact.anti_patterns.map((entry) => [
    entry.file,
    entry.pattern,
    entry.classification,
    entry.impact,
  ]);

  return [
    '---',
    `phase: ${artifact.phase}`,
    `verified: ${artifact.verified_at}`,
    `status: ${artifact.final_status.status}`,
    `score: ${artifact.score}`,
    '---',
    '',
    `# Phase ${artifact.phase_number}: ${artifact.title} Verification`,
    '',
    `**Phase Goal:** ${artifact.phase_goal}`,
    `**Verified:** ${artifact.verified_at}`,
    `**Status:** ${artifact.final_status.status}`,
    '',
    '## Observable Truths',
    '',
    renderTable(['#', 'Truth', 'Status', 'Evidence'], observableRows),
    '',
    '## Required Artifacts',
    '',
    renderTable(['Artifact', 'Expected', 'Status', 'Details'], requiredArtifactRows),
    '',
    '## Key Link Verification',
    '',
    renderTable(['From', 'To', 'Via', 'Status', 'Details'], keyLinkRows),
    '',
    '## Requirement Coverage',
    '',
    renderTable(['Requirement', 'Status', 'Evidence', 'Gap'], requirementRows),
    '',
    '## Anti-Pattern Scan',
    '',
    renderTable(['File', 'Pattern', 'Classification', 'Impact'], antiPatternRows),
    '',
    '## Drift Analysis',
    '',
    '```json',
    JSON.stringify(artifact.drift_analysis, null, 2),
    '```',
    '',
    '## Final Status',
    '',
    '```json',
    JSON.stringify(artifact.final_status, null, 2),
    '```',
    '',
    '## Verification Metadata',
    '',
    `- **Verification approach:** ${artifact.verification_approach}`,
    `- **Automated checks:** ${artifact.automated_checks.length > 0 ? artifact.automated_checks.join(', ') : 'None recorded in helper output'}`,
    `- **Human checks required:** 0`,
    `- **Verifier:** ${artifact.verifier}`,
    '',
    `*Verified: ${artifact.verified_at}*`,
    `*Verifier: ${artifact.verifier}*`,
  ].join('\n');
}

module.exports = {
  buildRetroVerificationArtifact,
  deriveRowStatus,
  deriveOverallStatus,
  renderRetroVerificationMarkdown,
};

// GSD-AUTHORITY: 80-01-1:1255ca43a02dc0632872ce356c1a44f5af96c74b0b9ff7897fa616f5f3c0e085
