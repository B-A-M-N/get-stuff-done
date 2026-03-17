/**
 * ITL Summary — deterministic summary renderer for interpreted narrative.
 */

function renderSection(title, items) {
  if (!items || items.length === 0) {
    return `## ${title}\n- None identified`;
  }

  return `## ${title}\n` + items.map(item => `- ${item}`).join('\n');
}

function renderInterpretationSummary(interpretation, ambiguity, options = {}) {
  const route = options.route_override || (interpretation.route_hint === 'new-project' ? '/dostuff:new-project' : '/dostuff:quick');
  const lines = [
    '# Intent Interpretation Summary',
    '',
    `**Suggested route:** ${route}`,
    `**Project initialized:** ${interpretation.project_initialized ? 'Yes' : 'No'}`,
    `**Ambiguity:** ${ambiguity.severity} (confidence ${ambiguity.confidence})`,
    '',
    renderSection('Goals', interpretation.goals),
    '',
    renderSection('Constraints', interpretation.constraints),
    '',
    renderSection('Preferences', interpretation.preferences),
    '',
    renderSection('Anti-Requirements', interpretation.anti_requirements),
    '',
    renderSection('Success Criteria', interpretation.success_criteria),
    '',
    renderSection('Risks', interpretation.risks),
    '',
    renderSection('Unknowns', interpretation.unknowns),
    '',
    renderSection('Assumptions', interpretation.assumptions),
  ];

  if (ambiguity.findings.length > 0) {
    lines.push('', '## Ambiguity Findings');
    for (const finding of ambiguity.findings) {
      lines.push(`- [${finding.severity}] ${finding.message}`);
    }
  }

  return lines.join('\n').trim() + '\n';
}

module.exports = {
  renderInterpretationSummary,
};
