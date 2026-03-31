#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { TruthAuditor } = require('../packages/gsd-tools/src/audit/TruthAuditor');

function formatList(items) {
  return items.length > 0 ? items.join('<br>') : '-';
}

function buildMarkdown(audit, durationMs) {
  const successRate = audit.total_requirements === 0
    ? 0
    : Math.round((audit.proven / audit.total_requirements) * 1000) / 10;

  return [
    '# Phase 52 Truth Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Duration: ${durationMs.toFixed(2)}ms`,
    '',
    '## Summary',
    '',
    `- Total requirements: ${audit.total_requirements}`,
    `- Proven: ${audit.proven}`,
    `- Unproven: ${audit.unproven}`,
    `- Success rate: ${successRate}%`,
    '',
    '## Requirement Status',
    '',
    '| Requirement | Status | Source | Implementation | Tests | Traces | Enforcement |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...audit.requirements.map((item) => `| ${item.id} | ${item.status} | ${item.source} | ${formatList(item.evidence.implementation)} | ${formatList(item.evidence.test)} | ${formatList(item.evidence.trace)} | ${item.evidence.enforcement} |`),
    '',
    '## Evidence Quality Notes',
    '',
    '- Mapping is explicit and requirement-bound; the auditor does not infer ownership from prose alone.',
    '- A requirement is only PROVEN when implementation, tests, and hard enforcement markers are all present.',
    '- Requirements marked `needs-clarification` are excluded from proof until clarified.',
    '',
    '## Enforcement Findings',
    '',
    ...(audit.failures.length === 0
      ? ['All requirements have non-bypassable enforcement evidence.']
      : audit.failures.map((failure) => `- ${failure.id}: missing ${failure.missing.join(', ')}${failure.evidence.enforcement_missing.length ? ` (${failure.evidence.enforcement_missing.join('; ')})` : ''}`)),
    '',
  ].join('\n');
}

function main() {
  const verbose = process.argv.includes('--verbose');
  const started = performance.now();
  const auditor = new TruthAuditor({ rootDir: process.cwd() });
  const audit = auditor.generateAudit();
  const durationMs = performance.now() - started;

  const auditDir = path.join(process.cwd(), '.planning', 'audit');
  const jsonPath = path.join(auditDir, 'truth_audit.json');
  const mdPath = path.join(auditDir, '52-TRUTH-AUDIT.md');

  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(audit, null, 2));
  fs.writeFileSync(mdPath, `${buildMarkdown(audit, durationMs)}\n`, 'utf8');

  if (verbose) {
    console.log(JSON.stringify(audit, null, 2));
  }

  if (audit.unproven > 0) {
    console.error(`Truth audit failed with ${audit.unproven} unproven requirement(s).`);
    process.exit(1);
  }

  console.log(`Truth audit passed: ${audit.proven}/${audit.total_requirements} proven in ${durationMs.toFixed(2)}ms.`);
}

main();
