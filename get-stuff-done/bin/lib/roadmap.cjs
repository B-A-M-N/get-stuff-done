/**
 * Roadmap — Roadmap parsing and update operations
 */

const fs = require('fs');
const path = require('path');
const { escapeRegex, normalizePhaseName, safeWriteFile, output, error, findPhaseInternal, stripShippedMilestones, replaceInCurrentMilestone, safeFs, safeGit } = require('./core.cjs');

function cmdRoadmapGetPhase(cwd, phaseNum, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!safeFs.existsSync(roadmapPath)) {
    output({ found: false, error: 'ROADMAP.md not found' }, raw, '');
    return;
  }

  try {
    const content = stripShippedMilestones(safeFs.readFileSync(roadmapPath, 'utf-8'));

    // Escape special regex chars in phase number, handle decimal
    const escapedPhase = escapeRegex(phaseNum);

    // Match "## Phase X:", "### Phase X:", or "#### Phase X:" with optional name
    const phasePattern = new RegExp(
      `#{2,4}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`,
      'i'
    );
    const headerMatch = content.match(phasePattern);

    if (!headerMatch) {
      // Fallback: check if phase exists in summary list but missing detail section
      const checklistPattern = new RegExp(
        `-\\s*\\[[ x]\\]\\s*\\*\\*Phase\\s+${escapedPhase}:\\s*([^*]+)\\*\\*`,
        'i'
      );
      const checklistMatch = content.match(checklistPattern);

      if (checklistMatch) {
        // Phase exists in summary but missing detail section - malformed ROADMAP
        output({
          found: false,
          phase_number: phaseNum,
          phase_name: checklistMatch[1].trim(),
          error: 'malformed_roadmap',
          message: `Phase ${phaseNum} exists in summary list but missing "### Phase ${phaseNum}:" detail section. ROADMAP.md needs both formats.`
        }, raw, '');
        return;
      }

      output({ found: false, phase_number: phaseNum }, raw, '');
      return;
    }

    const phaseName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;

    // Find the end of this section (next ## or ### phase header, or end of file)
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+\d/i);
    const sectionEnd = nextHeaderMatch
      ? headerIndex + nextHeaderMatch.index
      : content.length;

    const section = content.slice(headerIndex, sectionEnd).trim();

    // Extract goal if present (supports both **Goal:** and **Goal**: formats)
    const goalMatch = section.match(/\*\*Goal(?::\*\*|\*\*:)\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    // Extract success criteria as structured array
    const criteriaMatch = section.match(/\*\*Success Criteria\*\*[^\n]*:\s*\n((?:\s*\d+\.\s*[^\n]+\n?)+)/i);
    const success_criteria = criteriaMatch
      ? criteriaMatch[1].trim().split('\n').map(line => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
      : [];

    output(
      {
        found: true,
        phase_number: phaseNum,
        phase_name: phaseName,
        goal,
        success_criteria,
        section,
      },
      raw,
      section
    );
  } catch (e) {
    error('Failed to read ROADMAP.md: ' + e.message);
  }
}

/**
 * Parse ROADMAP.md and return structured data.
 * Pure function - does not call output() or process.exit().
 */
function parseRoadmap(cwd) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!safeFs.existsSync(roadmapPath)) {
    return {
      milestones: [],
      phases: [],
      phase_count: 0,
      completed_phases: 0,
      total_plans: 0,
      total_summaries: 0,
      progress_percent: 0,
      current_phase: null,
      next_phase: null,
      missing_phase_details: null,
      error: 'ROADMAP.md not found'
    };
  }

  const rawContent = safeFs.readFileSync(roadmapPath, 'utf-8');
  const content = stripShippedMilestones(rawContent);
  const phasesDir = path.join(cwd, '.planning', 'phases');

  // Extract all phase headings: ## Phase N: Name or ### Phase N: Name
  const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
  const phases = [];
  let match;

  while ((match = phasePattern.exec(content)) !== null) {
    const phaseNum = match[1];
    const phaseName = match[2].replace(/\(INSERTED\)/i, '').trim();

    // Extract goal from the section
    const sectionStart = match.index;
    const restOfContent = content.slice(sectionStart);
    const nextHeader = restOfContent.match(/\n#{2,4}\s+Phase\s+\d/i);
    const sectionEnd = nextHeader ? sectionStart + nextHeader.index : content.length;
    const section = content.slice(sectionStart, sectionEnd);

    const goalMatch = section.match(/\*\*Goal(?::\*\*|\*\*:)\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    const dependsMatch = section.match(/\*\*Depends on(?::\*\*|\*\*:)\s*([^\n]+)/i);
    const depends_on = dependsMatch ? dependsMatch[1].trim() : null;

    // Check completion on disk
    const normalized = normalizePhaseName(phaseNum);
    let diskStatus = 'no_directory';
    let planCount = 0;
    let summaryCount = 0;
    let hasContext = false;
    let hasResearch = false;

    try {
      const entries = safeFs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      const dirMatch = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);

      if (dirMatch) {
        const phaseFiles = safeFs.readdirSync(path.join(phasesDir, dirMatch));
        planCount = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
        summaryCount = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
        hasContext = phaseFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
        hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

        if (summaryCount >= planCount && planCount > 0) diskStatus = 'complete';
        else if (summaryCount > 0) diskStatus = 'partial';
        else if (planCount > 0) diskStatus = 'planned';
        else if (hasResearch) diskStatus = 'researched';
        else if (hasContext) diskStatus = 'discussed';
        else diskStatus = 'empty';
      }
    } catch {}

    // Check ROADMAP checkbox status
    const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Phase\\s+${escapeRegex(phaseNum)}[:\\s]`, 'i');
    const checkboxMatch = content.match(checkboxPattern);
    const roadmapComplete = checkboxMatch ? checkboxMatch[1] === 'x' : false;

    // If roadmap marks phase complete, trust that over disk file structure.
    if (roadmapComplete && diskStatus !== 'complete') {
      diskStatus = 'complete';
    }

    phases.push({
      number: phaseNum,
      name: phaseName,
      goal,
      depends_on,
      plan_count: planCount,
      summary_count: summaryCount,
      has_context: hasContext,
      has_research: hasResearch,
      disk_status: diskStatus,
      roadmap_complete: roadmapComplete,
    });
  }

  // Extract milestone info
  const milestones = [];
  const milestonePattern = /##\s*(.*v(\d+\.\d+)[^(\n]*)/gi;
  let mMatch;
  while ((mMatch = milestonePattern.exec(content)) !== null) {
    milestones.push({
      heading: mMatch[1].trim(),
      version: 'v' + mMatch[2],
    });
  }

  // Find current and next phase
  const currentPhase = phases.find(p => p.disk_status === 'planned' || p.disk_status === 'partial') || null;
  const nextPhase = phases.find(p => p.disk_status === 'empty' || p.disk_status === 'no_directory' || p.disk_status === 'discussed' || p.disk_status === 'researched') || null;

  // Aggregated stats
  const totalPlans = phases.reduce((sum, p) => sum + p.plan_count, 0);
  const totalSummaries = phases.reduce((sum, p) => sum + p.summary_count, 0);
  const completedPhases = phases.filter(p => p.disk_status === 'complete').length;

  // Detect phases in summary list without detail sections (malformed ROADMAP)
  const checklistPattern = /-\s*\[[ x]\]\s*\*\*Phase\s+(\d+[A-Z]?(?:\.\d+)*)/gi;
  const checklistPhases = new Set();
  let checklistMatch;
  while ((checklistMatch = checklistPattern.exec(content)) !== null) {
    checklistPhases.add(checklistMatch[1]);
  }
  const detailPhases = new Set(phases.map(p => p.number));
  const missingDetails = [...checklistPhases].filter(p => !detailPhases.has(p));

  return {
    milestones,
    phases,
    phase_count: phases.length,
    completed_phases: completedPhases,
    total_plans: totalPlans,
    total_summaries: totalSummaries,
    progress_percent: totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0,
    current_phase: currentPhase ? currentPhase.number : null,
    next_phase: nextPhase ? nextPhase.number : null,
    missing_phase_details: missingDetails.length > 0 ? missingDetails : null,
  };
}

function cmdRoadmapAnalyze(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!safeFs.existsSync(roadmapPath)) {
    output({ error: 'ROADMAP.md not found', milestones: [], phases: [], current_phase: null }, raw);
    return;
  }

  const result = parseRoadmap(cwd);
  output(result, raw);
}

async function cmdRoadmapSync(cwd, options, raw) {
  const roadmapPlaneSync = require('./roadmap-plane-sync.cjs');
  try {
    const result = await roadmapPlaneSync.syncFullRoadmap(cwd, {
      dryRun: options && options['dry-run'],
      force: options && options.force
    });
    output(result, raw);
  } catch (err) {
    output({ synced: false, reason: err.message, error: true }, raw);
  }
}

function cmdRoadmapUpdatePlanProgress(cwd, phaseNum, options, raw) {
  if (!phaseNum) {
    error('phase number required for roadmap update-plan-progress');
  }
  if (!options || !options.plan) {
    error('--plan required for roadmap update-plan-progress');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  const phaseInfo = findPhaseInternal(cwd, phaseNum);
  if (!phaseInfo) {
    error(`Phase ${phaseNum} not found`);
  }

  const planCount = phaseInfo.plans.length;
  const summaryCount = phaseInfo.summaries.length;

  if (planCount === 0) {
    output({ updated: false, reason: 'No plans found', plan_count: 0, summary_count: 0 }, raw, 'no plans');
    return;
  }

  const isComplete = summaryCount >= planCount;
  const status = isComplete ? 'Complete' : summaryCount > 0 ? 'In Progress' : 'Planned';
  const today = new Date().toISOString().split('T')[0];

  if (!safeFs.existsSync(roadmapPath)) {
    output({ updated: false, reason: 'ROADMAP.md not found', plan_count: planCount, summary_count: summaryCount }, raw, 'no roadmap');
    return;
  }

  let roadmapContent = safeFs.readFileSync(roadmapPath, 'utf-8');
  const phaseEscaped = escapeRegex(phaseNum);

  // Progress table row: update Plans column (summaries/plans) and Status column
  const tablePattern = new RegExp(
    `(\\|\\s*${phaseEscaped}\\.?\\s[^|]*\\|)[^|]*(\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)`,
    'i'
  );
  const dateField = isComplete ? ` ${today} ` : '  ';
  roadmapContent = replaceInCurrentMilestone(
    roadmapContent, tablePattern,
    `$1 ${summaryCount}/${planCount} $2 ${status.padEnd(11)}$3${dateField}$4`
  );

  // Update plan count in phase detail section
  const planCountPattern = new RegExp(
    `(#{2,4}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?\\*\\*Plans:\\*\\*\\s*)[^\\n]+`,
    'i'
  );
  const planCountText = isComplete
    ? `${summaryCount}/${planCount} plans complete`
    : `${summaryCount}/${planCount} plans executed`;
  roadmapContent = replaceInCurrentMilestone(roadmapContent, planCountPattern, `$1${planCountText}`);

  // If complete: check checkbox
  if (isComplete) {
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${phaseEscaped}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = replaceInCurrentMilestone(roadmapContent, checkboxPattern, `$1x$2 (completed ${today})`);
  }

  safeWriteFile(roadmapPath, roadmapContent, { phase: phaseNum, plan: options.plan, wave: options.wave || '1' });

  if (process.env.PLANE_SYNC_ENABLED !== 'false') {
    const roadmapPlaneSync = require('./roadmap-plane-sync.cjs');
    roadmapPlaneSync.notifyRoadmapChange(cwd, roadmapPath).catch((err) => {
      console.warn('[roadmap] Plane sync failed (roadmap may be out of sync with Plane):', err.message);
      // Fire-and-forget: don't block the main workflow, but log for visibility
    });
  }

  output({
    updated: true,
    phase: phaseNum,
    plan_count: planCount,
    summary_count: summaryCount,
    status,
    complete: isComplete,
  }, raw, `${summaryCount}/${planCount} ${status}`);
}

function applyPhaseReconciliationStatus(cwd, phaseNum, status, options = {}) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!safeFs.existsSync(roadmapPath)) {
    throw new Error('ROADMAP.md not found');
  }

  let roadmapContent = safeFs.readFileSync(roadmapPath, 'utf-8');
  const phaseEscaped = escapeRegex(phaseNum);
  const sectionPattern = new RegExp(`(#{2,4}\\s*Phase\\s+${phaseEscaped}:\\s*[^\\n]+\\n)([\\s\\S]*?)(?=\\n#{2,4}\\s*Phase\\s+\\d|$)`, 'i');
  const match = roadmapContent.match(sectionPattern);
  if (!match) {
    return {
      updated: false,
      path: '.planning/ROADMAP.md',
      phase: phaseNum,
      status,
      reason: 'phase_not_found',
    };
  }

  const header = match[1];
  let body = match[2];
  const statusLine = `**Reconciliation Status:** ${status}`;
  if (/\*\*Reconciliation Status:\*\*/i.test(body)) {
    body = body.replace(/(\*\*Reconciliation Status:\*\*\s*)([^\n]+)/i, `$1${status}`);
  } else if (/\*\*Plans:\*\*/i.test(body)) {
    body = body.replace(/(\*\*Plans:\*\*[^\n]*\n)/i, `$1${statusLine}\n`);
  } else {
    body = `${statusLine}\n` + body;
  }

  const replacement = `${header}${body}`;
  roadmapContent = roadmapContent.replace(sectionPattern, replacement);
  safeWriteFile(roadmapPath, roadmapContent, {
    phase: String(phaseNum),
    plan: options.plan || '01',
    wave: options.wave || '1',
  });

  return {
    updated: true,
    path: '.planning/ROADMAP.md',
    phase: phaseNum,
    status,
  };
}

module.exports = {
  applyPhaseReconciliationStatus,
  parseRoadmap,
  cmdRoadmapGetPhase,
  cmdRoadmapAnalyze,
  cmdRoadmapUpdatePlanProgress,
  cmdRoadmapSync,
};
