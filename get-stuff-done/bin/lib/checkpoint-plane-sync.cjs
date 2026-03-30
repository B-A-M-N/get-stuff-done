const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { logWarn, toPosixPath, safeFs } = require('./core.cjs');
const planeClient = require('./plane-client.cjs');
const { findIssueByCustomField } = require('./roadmap-plane-sync.cjs');

function extractBlockedAt(content) {
  const match = content.match(/\*\*Blocked at:\*\*\s*(.+)/i);
  return match ? match[1].trim() : null;
}

async function notifyCheckpointWrite(phase, checkpointPath) {
  if (!planeClient.apiKey || !planeClient.projectId) {
    return { synced: false, skipped: 'plane_not_configured' };
  }

  try {
    const content = safeFs.readFileSync(checkpointPath, 'utf-8');
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter.type || !frontmatter.why_blocked || !frontmatter.what_is_uncertain) {
      throw new Error('Invalid checkpoint format');
    }

    const issue = await findIssueByCustomField('gsd_phase_number', String(phase), { dryRun: false });
    if (!issue) {
      logWarn('Checkpoint comment: no Plane issue found for phase', { phase });
      return { synced: false, skipped: 'phase_issue_not_found' };
    }

    const issueId = issue.id || issue.data?.id;
    if (!issueId) {
      logWarn('Checkpoint comment: issue missing ID', { phase });
      return { synced: false, skipped: 'issue_missing_id' };
    }

    const blockedAt = extractBlockedAt(content);
    const artifactPath = toPosixPath(path.relative(process.cwd(), checkpointPath));
    const lines = [
      '**Checkpoint artifact**',
      '',
      `- **Type:** ${frontmatter.type}`,
      blockedAt ? `- **Blocked at:** ${blockedAt}` : null,
      `- **Why blocked:** ${frontmatter.why_blocked}`,
      `- **What is uncertain:** ${frontmatter.what_is_uncertain}`,
      frontmatter.choices ? `- **Choices:** ${frontmatter.choices}` : null,
      `- **Resume condition:** ${frontmatter.resume_condition || 'User provides explicit confirmation'}`,
      '',
      `*Artifact: \`${artifactPath}\`*`,
    ].filter(Boolean);

    await planeClient.addComment(issueId, lines.join('\n'));
    return { synced: true, issueId, artifactPath };
  } catch (err) {
    logWarn('Checkpoint comment failed', { phase, error: err.message });
    return { synced: false, skipped: 'error', error: err.message };
  }
}

module.exports = { notifyCheckpointWrite };
