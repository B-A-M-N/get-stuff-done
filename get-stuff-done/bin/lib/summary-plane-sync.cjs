const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { safeFs, logWarn, findPhaseInternal, toPosixPath } = require('./core.cjs');
const planeClient = require('./plane-client.cjs');
const { findIssueByCustomField } = require('./roadmap-plane-sync.cjs');

function toList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

async function notifySummaryWrite(cwd, phase, plan) {
  if (!planeClient.apiKey || !planeClient.projectId) {
    return { synced: false, skipped: 'plane_not_configured' };
  }

  try {
    const phaseInfo = findPhaseInternal(cwd, phase);
    if (!phaseInfo) {
      throw new Error(`Phase ${phase} not found`);
    }

    const phaseId = String(phase).padStart(2, '0');
    const planId = String(plan).padStart(2, '0');
    const summaryFileName = `${phaseId}-${planId}-SUMMARY.md`;
    const summaryPath = path.join(cwd, phaseInfo.directory, summaryFileName);
    if (!safeFs.existsSync(summaryPath)) {
      throw new Error(`Summary file not found: ${summaryPath}`);
    }

    const content = safeFs.readFileSync(summaryPath, 'utf-8');
    const frontmatter = extractFrontmatter(content);
    if (Object.keys(frontmatter).length === 0) {
      throw new Error('Missing frontmatter in summary');
    }

    const issue = await findIssueByCustomField('gsd_plan_id', `${phaseId}-${planId}`, { dryRun: false });
    if (!issue) {
      logWarn('Summary comment: no Plane issue found for plan', { plan: `${phaseId}-${planId}` });
      return { synced: false, skipped: 'plan_issue_not_found' };
    }

    const issueId = issue.id || issue.data?.id;
    if (!issueId) {
      logWarn('Summary comment: issue missing ID', { plan: `${phaseId}-${planId}` });
      return { synced: false, skipped: 'issue_missing_id' };
    }

    const provides = toList(frontmatter.provides).join(', ') || 'none';
    const requirements = toList(frontmatter['requirements-completed'] || frontmatter.requirements_completed).join(', ') || 'none';
    const artifactPath = toPosixPath(path.relative(cwd, summaryPath));
    const lines = [
      '**Phase summary**',
      '',
      `- **Phase:** ${phase}`,
      `- **Plan:** ${phaseId}-${planId}`,
      `- **Subsystem:** ${frontmatter.subsystem || 'N/A'}`,
      `- **Provides:** ${provides}`,
      `- **Duration:** ${frontmatter.duration || 'unknown'}`,
      `- **Completed:** ${frontmatter.completed || 'unknown'}`,
      `- **Requirements:** ${requirements}`,
      '',
      `*Artifact: \`${artifactPath}\`*`,
    ];

    await planeClient.addComment(issueId, lines.join('\n'));
    return { synced: true, issueId, artifactPath };
  } catch (err) {
    logWarn('Summary comment failed', { phase, plan, error: err.message });
    return { synced: false, skipped: 'error', error: err.message };
  }
}

module.exports = { notifySummaryWrite };
