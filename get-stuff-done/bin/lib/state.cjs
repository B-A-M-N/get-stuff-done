/**
 * State — STATE.md operations and progression engine
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { escapeRegex, loadConfig, getMilestoneInfo, getMilestonePhaseFilter, normalizeMd, output, error, safeReadFile, getActiveRequirementsPath } = require('./core.cjs');
const { extractFrontmatter, reconstructFrontmatter } = require('./frontmatter.cjs');

function cmdStateLoad(cwd, raw) {
  const config = loadConfig(cwd);
  const planningDir = path.join(cwd, '.planning');

  const statePath = path.join(planningDir, 'STATE.md');
  const stateRaw = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf-8') : '';

  const configExists = fs.existsSync(path.join(planningDir, 'config.json'));
  const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
  const stateExists = stateRaw.length > 0;

  const result = {
    config,
    state_raw: stateRaw,
    state_exists: stateExists,
    roadmap_exists: roadmapExists,
    config_exists: configExists,
    config_warning: config._load_error || null,
  };

  // For --raw, output a condensed key=value format
  if (raw) {
    const c = config;
    const lines = [
      `model_profile=${c.model_profile}`,
      `commit_docs=${c.commit_docs}`,
      `branching_strategy=${c.branching_strategy}`,
      `phase_branch_template=${c.phase_branch_template}`,
      `milestone_branch_template=${c.milestone_branch_template}`,
      `parallelization=${c.parallelization}`,
      `research=${c.research}`,
      `plan_checker=${c.plan_checker}`,
      `verifier=${c.verifier}`,
      `config_exists=${configExists}`,
      `roadmap_exists=${roadmapExists}`,
      `state_exists=${stateExists}`,
      `config_warning=${config._load_error || ''}`,
    ];
    process.stdout.write(lines.join('\n') + '\n');
    process.exit(0);
  }

  output(result);
}

function cmdStateGet(cwd, section, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    if (!fs.existsSync(statePath)) {
      error('STATE.md not found or access denied');
    }
    const content = fs.readFileSync(statePath, 'utf-8');

    if (!section) {
      output({ content }, raw, content);
      return;
    }

    // Try to find markdown section or field
    const fieldEscaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Check for **field:** value (bold format)
    const boldPattern = new RegExp(`\\*\\*${fieldEscaped}:\\*\\*\\s*(.*)`, 'i');
    const boldMatch = content.match(boldPattern);
    if (boldMatch) {
      output({ [section]: boldMatch[1].trim() }, raw, boldMatch[1].trim());
      return;
    }

    // Check for field: value (plain format)
    const plainPattern = new RegExp(`^${fieldEscaped}:\\s*(.*)`, 'im');
    const plainMatch = content.match(plainPattern);
    if (plainMatch) {
      output({ [section]: plainMatch[1].trim() }, raw, plainMatch[1].trim());
      return;
    }

    // Check for ## Section
    const sectionPattern = new RegExp(`##\\s*${fieldEscaped}\\s*\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const sectionMatch = content.match(sectionPattern);
    if (sectionMatch) {
      output({ [section]: sectionMatch[1].trim() }, raw, sectionMatch[1].trim());
      return;
    }

    output({ error: `Section or field "${section}" not found` }, raw, '');
  } catch {
    error('STATE.md not found');
  }
}

function readTextArgOrFile(cwd, value, filePath, label) {
  if (!filePath) return value;

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  try {
    return fs.readFileSync(resolvedPath, 'utf-8').trimEnd();
  } catch {
    throw new Error(`${label} file not found: ${filePath}`);
  }
}

function cmdStatePatch(cwd, patches, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const results = { updated: [], failed: [] };

    for (const [field, value] of Object.entries(patches)) {
      const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Try **Field:** bold format first, then plain Field: format
      const boldPattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');
      const plainPattern = new RegExp(`(^${fieldEscaped}:\\s*)(.*)`, 'im');

      if (boldPattern.test(content)) {
        content = content.replace(boldPattern, (_match, prefix) => `${prefix}${value}`);
        results.updated.push(field);
      } else if (plainPattern.test(content)) {
        content = content.replace(plainPattern, (_match, prefix) => `${prefix}${value}`);
        results.updated.push(field);
      } else {
        results.failed.push(field);
      }
    }

    if (results.updated.length > 0) {
      writeStateMd(statePath, content, cwd);
    }

    output(results, raw, results.updated.length > 0 ? 'true' : 'false');
  } catch {
    error('STATE.md not found');
  }
}

function cmdStateUpdate(cwd, field, value) {
  if (!field || value === undefined) {
    error('field and value required for state update');
  }

  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Try **Field:** bold format first, then plain Field: format
    const boldPattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');
    const plainPattern = new RegExp(`(^${fieldEscaped}:\\s*)(.*)`, 'im');
    if (boldPattern.test(content)) {
      content = content.replace(boldPattern, (_match, prefix) => `${prefix}${value}`);
      writeStateMd(statePath, content, cwd);
      output({ updated: true });
    } else if (plainPattern.test(content)) {
      content = content.replace(plainPattern, (_match, prefix) => `${prefix}${value}`);
      writeStateMd(statePath, content, cwd);
      output({ updated: true });
    } else {
      output({ updated: false, reason: `Field "${field}" not found in STATE.md` });
    }
  } catch {
    output({ updated: false, reason: 'STATE.md not found' });
  }
}

// ─── State Progression Engine ────────────────────────────────────────────────

function stateExtractField(content, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Try **Field:** bold format first
  const boldPattern = new RegExp(`\\*\\*${escaped}:\\*\\*[ \\t]*(.*)`, 'i');
  const boldMatch = content.match(boldPattern);
  if (boldMatch) return boldMatch[1].trim() || null;
  // Fall back to plain Field: format
  const plainPattern = new RegExp(`^${escaped}:[ \\t]*(.*)`, 'im');
  const plainMatch = content.match(plainPattern);
  return plainMatch ? (plainMatch[1].trim() || null) : null;
}

function stateReplaceField(content, fieldName, newValue) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Try **Field:** bold format first, then plain Field: format
  const boldPattern = new RegExp(`(\\*\\*${escaped}:\\*\\*[ \\t]*)(.*)`, 'i');
  if (boldPattern.test(content)) {
    return content.replace(boldPattern, (_match, prefix) => `${prefix}${newValue}`);
  }
  const plainPattern = new RegExp(`(^${escaped}:[ \\t]*)(.*)`, 'im');
  if (plainPattern.test(content)) {
    return content.replace(plainPattern, (_match, prefix) => `${prefix}${newValue}`);
  }
  return null;
}

function cmdStateAdvancePlan(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const currentPlan = parseInt(stateExtractField(content, 'Current Plan'), 10);
  const totalPlans = parseInt(stateExtractField(content, 'Total Plans in Phase'), 10);
  const today = new Date().toISOString().split('T')[0];

  if (isNaN(currentPlan) || isNaN(totalPlans)) {
    output({ error: 'Cannot parse Current Plan or Total Plans in Phase from STATE.md' }, raw);
    return;
  }

  if (currentPlan >= totalPlans) {
    content = stateReplaceField(content, 'Status', 'Phase complete — ready for verification') || content;
    content = stateReplaceField(content, 'Last Activity', today) || content;
    writeStateMd(statePath, content, cwd);
    output({ advanced: false, reason: 'last_plan', current_plan: currentPlan, total_plans: totalPlans, status: 'ready_for_verification' }, raw, 'false');
  } else {
    const newPlan = currentPlan + 1;
    content = stateReplaceField(content, 'Current Plan', String(newPlan)) || content;
    content = stateReplaceField(content, 'Status', 'Ready to execute') || content;
    content = stateReplaceField(content, 'Last Activity', today) || content;
    writeStateMd(statePath, content, cwd);
    output({ advanced: true, previous_plan: currentPlan, current_plan: newPlan, total_plans: totalPlans }, raw, 'true');
  }
}

function cmdStateRecordMetric(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const { phase, plan, duration, tasks, files } = options;

  if (!phase || !plan || !duration) {
    output({ error: 'phase, plan, and duration required' }, raw);
    return;
  }

  // Find Performance Metrics section and its table
  const metricsPattern = /(##\s*Performance Metrics[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n)([\s\S]*?)(?=\n##|\n$|$)/i;
  const metricsMatch = content.match(metricsPattern);

  if (metricsMatch) {
    let tableBody = metricsMatch[2].trimEnd();
    const newRow = `| Phase ${phase} P${plan} | ${duration} | ${tasks || '-'} tasks | ${files || '-'} files |`;

    if (tableBody.trim() === '' || tableBody.includes('None yet')) {
      tableBody = newRow;
    } else {
      tableBody = tableBody + '\n' + newRow;
    }

    content = content.replace(metricsPattern, (_match, header) => `${header}${tableBody}\n`);
    writeStateMd(statePath, content, cwd);
    output({ recorded: true, phase, plan, duration }, raw, 'true');
  } else {
    output({ recorded: false, reason: 'Performance Metrics section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateUpdateProgress(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');

  // Count summaries across current milestone phases only
  const phasesDir = path.join(cwd, '.planning', 'phases');
  let totalPlans = 0;
  let totalSummaries = 0;

  if (fs.existsSync(phasesDir)) {
    const isDirInMilestone = getMilestonePhaseFilter(cwd);
    const phaseDirs = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name)
      .filter(isDirInMilestone);
    for (const dir of phaseDirs) {
      const files = fs.readdirSync(path.join(phasesDir, dir));
      totalPlans += files.filter(f => f.match(/-PLAN\.md$/i)).length;
      totalSummaries += files.filter(f => f.match(/-SUMMARY\.md$/i)).length;
    }
  }

  const percent = totalPlans > 0 ? Math.min(100, Math.round(totalSummaries / totalPlans * 100)) : 0;
  const barWidth = 10;
  const filled = Math.round(percent / 100 * barWidth);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
  const progressStr = `[${bar}] ${percent}%`;

  // Try **Progress:** bold format first, then plain Progress: format
  const boldProgressPattern = /(\*\*Progress:\*\*\s*).*/i;
  const plainProgressPattern = /^(Progress:\s*).*/im;
  if (boldProgressPattern.test(content)) {
    content = content.replace(boldProgressPattern, (_match, prefix) => `${prefix}${progressStr}`);
    writeStateMd(statePath, content, cwd);
    output({ updated: true, percent, completed: totalSummaries, total: totalPlans, bar: progressStr }, raw, progressStr);
  } else if (plainProgressPattern.test(content)) {
    content = content.replace(plainProgressPattern, (_match, prefix) => `${prefix}${progressStr}`);
    writeStateMd(statePath, content, cwd);
    output({ updated: true, percent, completed: totalSummaries, total: totalPlans, bar: progressStr }, raw, progressStr);
  } else {
    output({ updated: false, reason: 'Progress field not found in STATE.md' }, raw, 'false');
  }
}

function computeHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
  }
  return hash >>> 0; // ensure unsigned 32-bit integer
}

function cmdStateAddDecision(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  const { phase, summary, summary_file, rationale, rationale_file } = options;
  let summaryText = null;
  let rationaleText = '';

  try {
    summaryText = readTextArgOrFile(cwd, summary, summary_file, 'summary');
    rationaleText = readTextArgOrFile(cwd, rationale || '', rationale_file, 'rationale');
  } catch (err) {
    output({ added: false, reason: err.message }, raw, 'false');
    return;
  }

  if (!summaryText) { output({ error: 'summary required' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const entry = `- [Phase ${phase || '?'}]: ${summaryText}${rationaleText ? ` — ${rationaleText}` : ''}`;

  // Find Decisions section (various heading patterns)
  const sectionPattern = /(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    let sectionBody = match[2];
    // Remove placeholders
    sectionBody = sectionBody.replace(/None yet\.?\s*\n?/gi, '').replace(/No decisions yet\.?\s*\n?/gi, '');
    sectionBody = sectionBody.trimEnd();

    // Decision Deduplication: Use hash-based comparison (case-insensitive)
    const normalizedEntry = entry.trim().toLowerCase();
    const newHash = computeHash(normalizedEntry);
    const existingEntries = sectionBody.split('\n').filter(line => line.trim().startsWith('- '));
    const existingHashes = new Set();
    for (const existing of existingEntries) {
      const norm = existing.trim().toLowerCase();
      existingHashes.add(computeHash(norm));
    }
    const isDuplicate = existingHashes.has(newHash);

    if (isDuplicate) {
      output({ added: false, reason: 'duplicate decision — already recorded' }, raw, 'false');
      return;
    }

    // Append the new entry (now that we know it's not a duplicate)
    sectionBody = sectionBody + (sectionBody ? '\n' : '') + entry + '\n';

    content = content.replace(sectionPattern, (_match, header) => `${header}${sectionBody}`);
    writeStateMd(statePath, content, cwd);
    output({ added: true, decision: entry }, raw, 'true');
  } else {
    output({ added: false, reason: 'Decisions section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateAddBlocker(cwd, text, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }
  const blockerOptions = typeof text === 'object' && text !== null ? text : { text };
  let blockerText = null;

  try {
    blockerText = readTextArgOrFile(cwd, blockerOptions.text, blockerOptions.text_file, 'blocker');
  } catch (err) {
    output({ added: false, reason: err.message }, raw, 'false');
    return;
  }

  if (!blockerText) { output({ error: 'text required' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const entry = `- ${blockerText}`;

  const sectionPattern = /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    let sectionBody = match[2];
    sectionBody = sectionBody.replace(/None\.?\s*\n?/gi, '').replace(/None yet\.?\s*\n?/gi, '');
    sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';
    content = content.replace(sectionPattern, (_match, header) => `${header}${sectionBody}`);
    writeStateMd(statePath, content, cwd);
    output({ added: true, blocker: blockerText }, raw, 'true');
  } else {
    output({ added: false, reason: 'Blockers section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateResolveBlocker(cwd, text, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }
  if (!text) { output({ error: 'text required' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');

  const sectionPattern = /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    const sectionBody = match[2];
    const lines = sectionBody.split('\n');
    const filtered = lines.filter(line => {
      if (!line.startsWith('- ')) return true;
      return !line.toLowerCase().includes(text.toLowerCase());
    });

    let newBody = filtered.join('\n');
    // If section is now empty, add placeholder
    if (!newBody.trim() || !newBody.includes('- ')) {
      newBody = 'None\n';
    }

    content = content.replace(sectionPattern, (_match, header) => `${header}${newBody}`);
    writeStateMd(statePath, content, cwd);
    output({ resolved: true, blocker: text }, raw, 'true');
  } else {
    output({ resolved: false, reason: 'Blockers section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateRecordSession(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const now = new Date().toISOString();
  const updated = [];

  // Update Last session / Last Date
  let result = stateReplaceField(content, 'Last session', now);
  if (result) { content = result; updated.push('Last session'); }
  result = stateReplaceField(content, 'Last Date', now);
  if (result) { content = result; updated.push('Last Date'); }

  // Update Stopped at
  if (options.stopped_at) {
    result = stateReplaceField(content, 'Stopped At', options.stopped_at);
    if (!result) result = stateReplaceField(content, 'Stopped at', options.stopped_at);
    if (result) { content = result; updated.push('Stopped At'); }
  }

  // Update Resume file
  const resumeFile = options.resume_file || 'None';
  result = stateReplaceField(content, 'Resume File', resumeFile);
  if (!result) result = stateReplaceField(content, 'Resume file', resumeFile);
  if (result) { content = result; updated.push('Resume File'); }

  if (options.clarification_status) {
    result = stateReplaceField(content, 'Clarification Status', options.clarification_status);
    if (result) { content = result; updated.push('Clarification Status'); }
  }

  if (options.clarification_rounds !== null && options.clarification_rounds !== undefined) {
    result = stateReplaceField(content, 'Clarification Rounds', String(options.clarification_rounds));
    if (result) { content = result; updated.push('Clarification Rounds'); }
  }

  if (options.last_clarification_reason) {
    result = stateReplaceField(content, 'Last Clarification Reason', options.last_clarification_reason);
    if (result) { content = result; updated.push('Last Clarification Reason'); }
  }

  if (options.resume_requires_user_input !== null && options.resume_requires_user_input !== undefined) {
    const normalized = String(options.resume_requires_user_input).toLowerCase() === 'true' ? 'true' : 'false';
    result = stateReplaceField(content, 'Resume Requires User Input', normalized);
    if (result) { content = result; updated.push('Resume Requires User Input'); }
  }

  if (updated.length > 0) {
    writeStateMd(statePath, content, cwd);
    output({ recorded: true, updated }, raw, 'true');
  } else {
    output({ recorded: false, reason: 'No session fields found in STATE.md' }, raw, 'false');
  }
}

function parseStateSnapshot(content) {
  // Extract basic fields
  const currentPhase = stateExtractField(content, 'Current Phase');
  const currentPhaseName = stateExtractField(content, 'Current Phase Name');
  const totalPhasesRaw = stateExtractField(content, 'Total Phases');
  const currentPlan = stateExtractField(content, 'Current Plan');
  const totalPlansRaw = stateExtractField(content, 'Total Plans in Phase');
  const status = stateExtractField(content, 'Status');
  const progressRaw = stateExtractField(content, 'Progress');
  const lastActivity = stateExtractField(content, 'Last Activity');
  const lastActivityDesc = stateExtractField(content, 'Last Activity Description');
  const pausedAt = stateExtractField(content, 'Paused At');
  const clarificationStatus = stateExtractField(content, 'Clarification Status');
  const clarificationRoundsRaw = stateExtractField(content, 'Clarification Rounds');
  const lastClarificationReason = stateExtractField(content, 'Last Clarification Reason');
  const resumeRequiresUserInputRaw = stateExtractField(content, 'Resume Requires User Input');

  // Parse numeric fields
  const totalPhases = totalPhasesRaw ? parseInt(totalPhasesRaw, 10) : null;
  const totalPlansInPhase = totalPlansRaw ? parseInt(totalPlansRaw, 10) : null;
  const progressPercent = progressRaw ? parseInt(progressRaw.replace('%', ''), 10) : null;
  const clarificationRounds = clarificationRoundsRaw ? parseInt(clarificationRoundsRaw, 10) : null;

  // Extract decisions (table or list)
  const decisions = [];
  const decisionsSectionMatch = content.match(/##\s*Decisions.*?\n([\s\S]*?)(?=\n##|\n$|$)/i);
  if (decisionsSectionMatch) {
    const sectionBody = decisionsSectionMatch[1].trim();
    if (sectionBody.includes('|')) {
      const rows = sectionBody.split('\n').filter(r => r.includes('|'));
      for (const row of rows) {
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
        // Skip header and separator
        if (cells[0].toLowerCase() === 'phase' || cells[0].startsWith('---')) continue;
        
        if (cells.length >= 2) {
          decisions.push({
            phase: cells[0],
            summary: cells[1],
            rationale: cells[2] || '',
          });
        }
      }
    } else {
      const items = sectionBody.match(/^-\s+\[Phase\s+([^\]]+)\]:\s+(.+)$/gm) || [];
      for (const item of items) {
        const m = item.match(/^-\s+\[Phase\s+([^\]]+)\]:\s+([^\u2014]+)(?:\s+\u2014\s+(.+))?$/);
        if (m) {
          decisions.push({
            phase: m[1],
            summary: m[2].trim(),
            rationale: m[3] ? m[3].trim() : '',
          });
        }
      }
    }
  }

  // Extract blockers list
  const blockers = [];
  const blockersMatch = content.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (blockersMatch) {
    const blockersSection = blockersMatch[1];
    const items = blockersSection.match(/^-\s+(.+)$/gm) || [];
    for (const item of items) {
      blockers.push(item.replace(/^-\s+/, '').trim());
    }
  }

  // Extract session info
  const session = {
    last_date: null,
    stopped_at: null,
    resume_file: null,
  };

  const clarification = {
    status: clarificationStatus,
    rounds: clarificationRounds,
    last_reason: lastClarificationReason,
    resume_requires_user_input: resumeRequiresUserInputRaw ? resumeRequiresUserInputRaw.toLowerCase() === 'true' : null,
  };

  const sessionMatch = content.match(/##\s*Session\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (sessionMatch) {
    const sessionSection = sessionMatch[1];
    const lastDateMatch = sessionSection.match(/\*\*Last Date:\*\*\s*(.+)/i)
      || sessionSection.match(/^Last Date:\s*(.+)/im);
    const stoppedAtMatch = sessionSection.match(/\*\*Stopped At:\*\*\s*(.+)/i)
      || sessionSection.match(/^Stopped At:\s*(.+)/im);
    const resumeFileMatch = sessionSection.match(/\*\*Resume File:\*\*\s*(.+)/i)
      || sessionSection.match(/^Resume File:\s*(.+)/im);

    if (lastDateMatch) session.last_date = lastDateMatch[1].trim();
    if (stoppedAtMatch) session.stopped_at = stoppedAtMatch[1].trim();
    if (resumeFileMatch) session.resume_file = resumeFileMatch[1].trim();
  }

  return {
    current_phase: currentPhase,
    current_phase_name: currentPhaseName,
    total_phases: totalPhases,
    current_plan: currentPlan,
    total_plans_in_phase: totalPlansInPhase,
    status,
    progress_percent: progressPercent,
    last_activity: lastActivity,
    last_activity_desc: lastActivityDesc,
    decisions,
    blockers,
    paused_at: pausedAt,
    clarification_status: clarificationStatus,
    clarification_rounds: clarificationRounds,
    last_clarification_reason: lastClarificationReason,
    resume_requires_user_input: clarification.resume_requires_user_input,
    clarification,
    session,
  };
}

function cmdStateSnapshot(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');

  if (!fs.existsSync(statePath)) {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }

  const content = fs.readFileSync(statePath, 'utf-8');
  const result = parseStateSnapshot(content);

  output(result, raw);
}

/**
 * Harvest ambient project context from STATE, PROJECT, REQUIREMENTS, and phase CONTEXT files.
 * Used to enrich ITL seeds before clarification escalation.
 */
function harvestAmbientContext(cwd, phaseNumber) {
  const planningDir = path.join(cwd, '.planning');
  const context = {
    decisions: [],
    project_goals: [],
    constraints: [],
    active_requirements: [],
    phase_decisions: [],
    truncated: false,
  };

  const MAX_ITEMS = 20;
  const MAX_DECISIONS = 30;

  // 1. STATE.md Decisions
  const statePath = path.join(planningDir, 'STATE.md');
  if (fs.existsSync(statePath)) {
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    const snapshot = parseStateSnapshot(stateContent);
    const allDecisions = snapshot.decisions || [];
    if (allDecisions.length > MAX_DECISIONS) {
      context.decisions = allDecisions.slice(-MAX_DECISIONS); // Keep newest
      context.truncated = true;
    } else {
      context.decisions = allDecisions;
    }
  }

  // 2. PROJECT.md Goals & Constraints
  const projectPath = path.join(planningDir, 'PROJECT.md');
  if (fs.existsSync(projectPath)) {
    const projectContent = fs.readFileSync(projectPath, 'utf-8');
    const goalsMatch = projectContent.match(/##\s*Goals\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (goalsMatch) {
      const allGoals = goalsMatch[1].match(/^-\s+(.+)$/gm)?.map(s => s.replace(/^-\s+/, '').trim()) || [];
      if (allGoals.length > MAX_ITEMS) {
        context.project_goals = allGoals.slice(0, MAX_ITEMS);
        context.truncated = true;
      } else {
        context.project_goals = allGoals;
      }
    }
    const constraintsMatch = projectContent.match(/##\s*(?:Constraints|Non-negotiables)\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (constraintsMatch) {
      const allConstraints = constraintsMatch[1].match(/^-\s+(.+)$/gm)?.map(s => s.replace(/^-\s+/, '').trim()) || [];
      if (allConstraints.length > MAX_ITEMS) {
        context.constraints = allConstraints.slice(0, MAX_ITEMS);
        context.truncated = true;
      } else {
        context.constraints = allConstraints;
      }
    }
  }

  // 3. REQUIREMENTS.md Active Requirements (distributed truth model)
  const reqPath = getActiveRequirementsPath(cwd);
  if (reqPath) {
    const reqContent = fs.readFileSync(reqPath, 'utf-8');
    const activeMatch = reqContent.match(/##\s*v[\d.]+\s+Requirements\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (activeMatch) {
      const allReqs = activeMatch[1].match(/^-\s+\[ \]\s+\*\*([A-Z0-9-]+)\*\*:\s*(.+)$/gm)?.map(s => {
        const m = s.match(/^\s*-\s+\[ \]\s+\*\*([A-Z0-9-]+)\*\*:\s*(.+)$/);
        return m ? { id: m[1], text: m[2].trim() } : null;
      }).filter(Boolean) || [];

      if (allReqs.length > MAX_ITEMS) {
        context.active_requirements = allReqs.slice(0, MAX_ITEMS);
        context.truncated = true;
      } else {
        context.active_requirements = allReqs;
      }
    }
  }

  // 4. Phase-specific CONTEXT.md
  if (phaseNumber) {
    const paddedPhase = String(phaseNumber).padStart(2, '0');
    const phasesDir = path.join(planningDir, 'phases');
    if (fs.existsSync(phasesDir)) {
      const phaseDir = fs.readdirSync(phasesDir).find(d => d.startsWith(paddedPhase));
      if (phaseDir) {
        const phaseContextPath = path.join(phasesDir, phaseDir, 'CONTEXT.md');
        if (fs.existsSync(phaseContextPath)) {
          const phaseContent = fs.readFileSync(phaseContextPath, 'utf-8');
          const decisionsMatch = phaseContent.match(/##\s*Decisions\s*\n([\s\S]*?)(?=\n##|$)/i);
          if (decisionsMatch) {
            const allPhaseDecisions = decisionsMatch[1].match(/^-\s+(.+)$/gm)?.map(s => s.replace(/^-\s+/, '').trim()) || [];
            if (allPhaseDecisions.length > MAX_ITEMS) {
              context.phase_decisions = allPhaseDecisions.slice(-MAX_ITEMS);
              context.truncated = true;
            } else {
              context.phase_decisions = allPhaseDecisions;
            }
          }
        }
      }
    }
  }

  return context;
}

// ─── State Assert — Pre-condition Validation ───────────────────────────────────

/**
 * cmdStateAssert — Verify project state meets workflow pre-conditions
 *
 * Used at workflow start to ensure required files exist and project is in a
 * valid state before proceeding. Exits 1 on failure (hard stop).
 *
 * Output: JSON with {passed, errors[], warnings[], checks{}}
 */
function cmdStateAssert(cwd, raw) {
  const planningDir = path.join(cwd, '.planning');
  const statePath = path.join(planningDir, 'STATE.md');
  const configPath = path.join(planningDir, 'config.json');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const projectPath = path.join(cwd, 'PROJECT.md');

  const errors = [];
  const warnings = [];

  // Check PROJECT.md exists at project root
  const projectExists = fs.existsSync(projectPath);
  if (!projectExists) {
    errors.push('PROJECT.md not found at project root — run init to create');
  }

  // Check STATE.md exists and is parseable
  let stateExists = false;
  let statePaused = false;
  try {
    const stateContent = safeReadFile(statePath);
    if (stateContent) {
      stateExists = true;
      const fm = extractFrontmatter(stateContent);
      if (!fm) {
        errors.push('STATE.md exists but has invalid or missing frontmatter');
      } else {
        // Check for paused state
        const status = (fm.status || '').toLowerCase();
        const state = (fm.state || '').toLowerCase();
        if (status.includes('paused') || state === 'paused') {
          errors.push('Project is PAUSED — resume or unpause before proceeding');
          statePaused = true;
        }

        // Check for blocked clarification status
        const clarificationStatus = (fm.clarification_status || '').toLowerCase();
        if (clarificationStatus === 'blocked') {
          errors.push('Project has clarification_status: blocked — resolve with /gsd:resume-project');
        }
      }
    } else {
      errors.push('STATE.md not found or empty — run plan-phase to initialize');
    }
  } catch (err) {
    errors.push(`Failed to read STATE.md: ${err.message}`);
  }

  // Check config.json exists
  const configExists = fs.existsSync(configPath);
  if (!configExists) {
    errors.push('Config file .planning/config.json not found — run init or config setup');
  }

  // Check roadmap exists (some workflows need it)
  const roadmapExists = fs.existsSync(roadmapPath);
  if (!roadmapExists) {
    warnings.push('ROADMAP.md not found — phase-based workflows require it');
  }

  // Check for orphaned checkpoints from previous interrupted runs
  const checkpointPath = path.join(planningDir, 'CHECKPOINT.md');
  const orphanedCheckpoint = fs.existsSync(checkpointPath);
  if (orphanedCheckpoint) {
    warnings.push('Orphaned checkpoint found — previous run stopped at a gate; review CHECKPOINT.md');
  }

  // Check for phase checkpoints awaiting response
  const phasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(phasesDir)) {
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const phaseDirs = entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
      for (const phaseDir of phaseDirs) {
        const phaseCheckpointPath = path.join(phasesDir, phaseDir, 'CHECKPOINT.md');
        if (fs.existsSync(phaseCheckpointPath)) {
          const checkpointContent = safeReadFile(phaseCheckpointPath);
          if (checkpointContent) {
            const fm = extractFrontmatter(checkpointContent);
            if (fm && (fm.status || '').toLowerCase() === 'awaiting-response') {
              errors.push(`Checkpoint in ${phaseDir} requires user response — resolve with /gsd:resume-project`);
            }
          }
        }
      }
    } catch (err) {
      warnings.push(`Could not scan phase directories: ${err.message}`);
    }
  }

  const passed = errors.length === 0;
  const result = {
    passed,
    errors,
    warnings,
    checks: {
      state_exists: stateExists,
      state_paused: statePaused,
      config_exists: configExists,
      roadmap_exists: roadmapExists,
      orphaned_checkpoint: orphanedCheckpoint,
      project_exists: projectExists,
    },
  };

  // Output result manually and exit with appropriate code
  if (raw) {
    process.stdout.write(passed ? 'passed' : 'failed');
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
  process.exit(passed ? 0 : 1);
}

// ─── Live Verification ─────────────────────────────────────────────────────
/**
 * cmdStateVerify — Comprehensive project state verification
 *
 * Performs live integrity checks: state validity, file existence, git status,
 * decision/blocker section health, and phase consistency.
 * Output: JSON with {passed, errors[], warnings[], details{}}.
 */
function cmdStateVerify(cwd, raw) {
  const errors = [];
  const warnings = [];
  const details = {};

  const planningDir = path.join(cwd, '.planning');
  const statePath = path.join(planningDir, 'STATE.md');
  const configPath = path.join(planningDir, 'config.json');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const checkpointPath = path.join(planningDir, 'CHECKPOINT.md');

  // Check STATE.md exists and parseable
  let stateContent = '';
  try {
    stateContent = fs.readFileSync(statePath, 'utf-8');
    details.state_exists = true;
  } catch (e) {
    errors.push('STATE.md not found');
    details.state_exists = false;
  }

  // If state exists, validate frontmatter
  if (stateContent) {
    const fm = extractFrontmatter(stateContent);
    if (!fm) {
      errors.push('STATE.md has invalid frontmatter');
    } else {
      const status = (fm.status || '').toLowerCase();
      if (status.includes('paused')) {
        warnings.push('Project is PAUSED');
      }
    }
  }

  // Config exists
  details.config_exists = fs.existsSync(configPath);
  if (!details.config_exists) errors.push('config.json missing');

  // Roadmap exists (warning if missing)
  details.roadmap_exists = fs.existsSync(roadmapPath);
  if (!details.roadmap_exists) warnings.push('ROADMAP.md missing');

  // Orphaned checkpoint
  details.orphaned_checkpoint = fs.existsSync(checkpointPath);
  if (details.orphaned_checkpoint) warnings.push('Orphaned CHECKPOINT.md found');

  // Parse STATE to extract phase info and verify plan directories
  if (stateContent) {
    // Extract phase entries from STATE (e.g., "Active Phases:" or "## Active Phases")
    const phaseSectionMatch = stateContent.match(/##\s*Active Phases\s*\n([\s\S]*?)(?=\n##|\n#|$)/);
    if (phaseSectionMatch) {
      const phaseLines = phaseSectionMatch[1].split('\n').filter(l => l.trim().startsWith('- '));
      details.phase_checks = [];
      phaseLines.forEach(line => {
        const phaseMatch = line.match(/Phase\s*(\d+)/i);
        if (phaseMatch) {
          const phaseNum = phaseMatch[1];
          const phaseDir = path.join(planningDir, `phase-${phaseNum}`);
          const exists = fs.existsSync(phaseDir);
          details.phase_checks.push({ phase: phaseNum, dir_exists: exists });
          if (!exists) errors.push(`Phase ${phaseNum} directory missing`);
        }
      });
    }

    // Check Decisions section for placeholder text
    const decisionsMatch = stateContent.match(/###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n([\s\S]*?)(?=\n###?|\n##[^#]|$)/i);
    if (decisionsMatch) {
      const decisionsBody = decisionsMatch[1].trim();
      if (!decisionsBody || decisionsBody === 'None yet.' || decisionsBody === 'No decisions yet.' || decisionsBody.toLowerCase().includes('none yet') || decisionsBody.toLowerCase().includes('no decisions yet')) {
        warnings.push('Decisions section contains placeholder text');
      }
      details.decisions_line_count = decisionsBody.split('\n').filter(l => l.trim()).length;
    }

    // Check Blockers section for count
    const blockersMatch = stateContent.match(/###?\s*(?:Blockers|Open Blockers|Blocked)\s*\n([\s\S]*?)(?=\n###?|\n##[^#]|$)/i);
    if (blockersMatch) {
      const blockersBody = blockersMatch[1];
      const blockerLines = blockersBody.split('\n').filter(l => l.trim().startsWith('- '));
      details.blockers_count = blockerLines.length;
    }
  }

  // Git status check (warn if uncommitted changes to planning files)
  try {
    const gitStatus = execSync('git status --porcelain .planning', { cwd, encoding: 'utf-8' });
    if (gitStatus.trim()) {
      warnings.push('Uncommitted changes in .planning/ directory');
    }
    details.git_status_clean = !gitStatus.trim();
  } catch (e) {
    warnings.push('Could not check git status: ' + e.message);
    details.git_status_clean = null;
  }

  const passed = errors.length === 0;
  const result = { passed, errors, warnings, details };
  output(result, raw, passed ? 'passed' : 'failed');
}

function cmdStateHarvestContext(cwd, phaseNumber, raw) {
  const result = harvestAmbientContext(cwd, phaseNumber);
  output(result, raw, JSON.stringify(result, null, 2));
}

// ─── State Frontmatter Sync ──────────────────────────────────────────────────

/**
 * Extract machine-readable fields from STATE.md markdown body and build
 * a YAML frontmatter object. Allows hooks and scripts to read state
 * reliably via `state json` instead of fragile regex parsing.
 */
function buildStateFrontmatter(bodyContent, cwd) {
  const currentPhase = stateExtractField(bodyContent, 'Current Phase');
  const currentPhaseName = stateExtractField(bodyContent, 'Current Phase Name');
  const currentPlan = stateExtractField(bodyContent, 'Current Plan');
  const totalPhasesRaw = stateExtractField(bodyContent, 'Total Phases');
  const totalPlansRaw = stateExtractField(bodyContent, 'Total Plans in Phase');
  const status = stateExtractField(bodyContent, 'Status');
  const progressRaw = stateExtractField(bodyContent, 'Progress');
  const lastActivity = stateExtractField(bodyContent, 'Last Activity');
  const stoppedAt = stateExtractField(bodyContent, 'Stopped At') || stateExtractField(bodyContent, 'Stopped at');
  const pausedAt = stateExtractField(bodyContent, 'Paused At');
  const clarificationStatus = stateExtractField(bodyContent, 'Clarification Status');
  const clarificationRoundsRaw = stateExtractField(bodyContent, 'Clarification Rounds');
  const lastClarificationReason = stateExtractField(bodyContent, 'Last Clarification Reason');
  const resumeRequiresUserInputRaw = stateExtractField(bodyContent, 'Resume Requires User Input');
  const checkpointStatus = stateExtractField(bodyContent, 'Checkpoint Status');
  const checkpointPath = stateExtractField(bodyContent, 'Checkpoint Path');

  let milestone = null;
  let milestoneName = null;
  if (cwd) {
    try {
      const info = getMilestoneInfo(cwd);
      milestone = info.version;
      milestoneName = info.name;
    } catch {}
  }

  let totalPhases = totalPhasesRaw ? parseInt(totalPhasesRaw, 10) : null;
  let completedPhases = null;
  let totalPlans = totalPlansRaw ? parseInt(totalPlansRaw, 10) : null;
  let completedPlans = null;

  if (cwd) {
    try {
      const phasesDir = path.join(cwd, '.planning', 'phases');
      if (fs.existsSync(phasesDir)) {
        const isDirInMilestone = getMilestonePhaseFilter(cwd);
        const phaseDirs = fs.readdirSync(phasesDir, { withFileTypes: true })
          .filter(e => e.isDirectory()).map(e => e.name)
          .filter(isDirInMilestone);
        let diskTotalPlans = 0;
        let diskTotalSummaries = 0;
        let diskCompletedPhases = 0;

        for (const dir of phaseDirs) {
          const files = fs.readdirSync(path.join(phasesDir, dir));
          const plans = files.filter(f => f.match(/-PLAN\.md$/i)).length;
          const summaries = files.filter(f => f.match(/-SUMMARY\.md$/i)).length;
          diskTotalPlans += plans;
          diskTotalSummaries += summaries;
          if (plans > 0 && summaries >= plans) diskCompletedPhases++;
        }
        totalPhases = isDirInMilestone.phaseCount > 0
          ? Math.max(phaseDirs.length, isDirInMilestone.phaseCount)
          : phaseDirs.length;
        completedPhases = diskCompletedPhases;
        totalPlans = diskTotalPlans;
        completedPlans = diskTotalSummaries;
      }
    } catch {}
  }

  let progressPercent = null;
  if (progressRaw) {
    const pctMatch = progressRaw.match(/(\d+)%/);
    if (pctMatch) progressPercent = parseInt(pctMatch[1], 10);
  }

  let clarificationRounds = null;
  if (clarificationRoundsRaw) {
    const rounds = parseInt(clarificationRoundsRaw, 10);
    if (!isNaN(rounds)) clarificationRounds = rounds;
  }

  let resumeRequiresUserInput = null;
  if (resumeRequiresUserInputRaw) {
    const normalized = resumeRequiresUserInputRaw.toLowerCase();
    if (normalized === 'true') resumeRequiresUserInput = true;
    if (normalized === 'false') resumeRequiresUserInput = false;
  }

  // Normalize status to one of: planning, discussing, executing, verifying, paused, completed, unknown
  let normalizedStatus = status || 'unknown';
  const statusLower = (status || '').toLowerCase();
  if (statusLower.includes('paused') || statusLower.includes('stopped') || pausedAt) {
    normalizedStatus = 'paused';
  } else if (statusLower.includes('executing') || statusLower.includes('in progress')) {
    normalizedStatus = 'executing';
  } else if (statusLower.includes('planning') || statusLower.includes('ready to plan')) {
    normalizedStatus = 'planning';
  } else if (statusLower.includes('discussing')) {
    normalizedStatus = 'discussing';
  } else if (statusLower.includes('verif')) {
    normalizedStatus = 'verifying';
  } else if (statusLower.includes('complete') || statusLower.includes('done')) {
    normalizedStatus = 'completed';
  } else if (statusLower.includes('ready to execute')) {
    normalizedStatus = 'executing';
  }

  const fm = { gsd_state_version: '1.0' };

  if (milestone) fm.milestone = milestone;
  if (milestoneName) fm.milestone_name = milestoneName;
  if (currentPhase) fm.current_phase = currentPhase;
  if (currentPhaseName) fm.current_phase_name = currentPhaseName;
  if (currentPlan) fm.current_plan = currentPlan;
  fm.status = normalizedStatus;
  if (stoppedAt) fm.stopped_at = stoppedAt;
  if (pausedAt) fm.paused_at = pausedAt;
  if (clarificationStatus) fm.clarification_status = clarificationStatus;
  if (clarificationRounds !== null) fm.clarification_rounds = clarificationRounds;
  if (lastClarificationReason) fm.last_clarification_reason = lastClarificationReason;
  if (resumeRequiresUserInput !== null) fm.resume_requires_user_input = resumeRequiresUserInput;
  if (checkpointStatus) fm.checkpoint_status = checkpointStatus;
  if (checkpointPath) fm.checkpoint_path = checkpointPath;
  fm.last_updated = new Date().toISOString();
  if (lastActivity) fm.last_activity = lastActivity;

  const progress = {};
  if (totalPhases !== null) progress.total_phases = totalPhases;
  if (completedPhases !== null) progress.completed_phases = completedPhases;
  if (totalPlans !== null) progress.total_plans = totalPlans;
  if (completedPlans !== null) progress.completed_plans = completedPlans;
  if (progressPercent !== null) progress.percent = progressPercent;
  if (Object.keys(progress).length > 0) fm.progress = progress;

  return fm;
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

function syncStateFrontmatter(content, cwd) {
  const body = stripFrontmatter(content);
  const fm = buildStateFrontmatter(body, cwd);
  const yamlStr = reconstructFrontmatter(fm);
  return `---\n${yamlStr}\n---\n\n${body}`;
}

/**
 * Write STATE.md with synchronized YAML frontmatter.
 * All STATE.md writes should use this instead of raw writeFileSync.
 */
function writeStateMd(statePath, content, cwd) {
  const synced = syncStateFrontmatter(content, cwd);
  fs.writeFileSync(statePath, normalizeMd(synced), 'utf-8');
}

function upsertSection(content, heading, body) {
  const sectionPattern = new RegExp(`\\n##\\s*${heading}\\s*\\n[\\s\\S]*?(?=\\n##|$)`, 'i');
  const sectionText = `\n## ${heading}\n\n${body.trim()}\n`;
  if (sectionPattern.test(content)) {
    return content.replace(sectionPattern, sectionText);
  }
  return content.replace(/\s*$/, '') + '\n' + sectionText;
}

function applyReconciliationState(cwd, markers = {}) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) {
    throw new Error('STATE.md not found');
  }

  const content = fs.readFileSync(statePath, 'utf-8');
  const lines = [
    `**Drift Present:** ${markers.drift_present ? 'true' : 'false'}`,
    `**Highest Drift Severity:** ${markers.highest_severity || 'NONE'}`,
    `**Verification Status:** ${markers.verification_status || 'UNKNOWN'}`,
    `**Phase Status:** ${markers.phase_status || 'UNKNOWN'}`,
    `**Roadmap Status:** ${markers.roadmap_status || 'UNKNOWN'}`,
    `**Operator Health:** ${markers.operator_health || 'UNKNOWN'}`,
    `**Requires Reverification:** ${markers.requires_reverification ? 'true' : 'false'}`,
    `**Reverification Reason:** ${markers.reverification_reason || 'none'}`,
    `**Source Report:** ${markers.source_report || 'unknown'}`,
    `**Reconciled At:** ${markers.timestamp || new Date().toISOString()}`,
  ];
  const next = upsertSection(content, 'Reconciliation Status', lines.join('\n'));
  writeStateMd(statePath, next, cwd);
  return {
    updated: true,
    path: '.planning/STATE.md',
    markers,
  };
}

function cmdStateJson(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) {
    output({ error: 'STATE.md not found' }, raw, 'STATE.md not found');
    return;
  }

  const content = fs.readFileSync(statePath, 'utf-8');
  const fm = extractFrontmatter(content);

  if (!fm || Object.keys(fm).length === 0) {
    const body = stripFrontmatter(content);
    const built = buildStateFrontmatter(body, cwd);
    output(built, raw, JSON.stringify(built, null, 2));
    return;
  }

  output(fm, raw, JSON.stringify(fm, null, 2));
}

function cmdStateCheckpoint(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const updated = [];

  // Both replacements happen before the single writeStateMd call — atomicity guarantee
  const statusValue = options.status || '';
  let result = stateReplaceField(content, 'Checkpoint Status', statusValue);
  if (result) { content = result; updated.push('Checkpoint Status'); }

  const pathValue = options.checkpointPath || '';
  result = stateReplaceField(content, 'Checkpoint Path', pathValue);
  if (result) { content = result; updated.push('Checkpoint Path'); }

  if (updated.length > 0) {
    writeStateMd(statePath, content, cwd);
  }

  output(
    { updated, checkpoint_status: options.status || null, checkpoint_path: options.checkpointPath || null },
    raw,
    updated.length > 0 ? 'true' : 'false'
  );
}

/**
 * Update STATE.md when a new phase begins execution.
 * Updates body text fields (Current focus, Status, Last Activity, Current Position)
 * and synchronizes frontmatter via writeStateMd.
 * Fixes: #1102 (plan counts), #1103 (status/last_activity), #1104 (body text).
 */
function cmdStateBeginPhase(cwd, phaseNumber, phaseName, planCount, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }

  let content = fs.readFileSync(statePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  const updated = [];

  // Update Status field
  const statusValue = `Executing Phase ${phaseNumber}`;
  let result = stateReplaceField(content, 'Status', statusValue);
  if (result) { content = result; updated.push('Status'); }

  // Update Last Activity
  result = stateReplaceField(content, 'Last Activity', today);
  if (result) { content = result; updated.push('Last Activity'); }

  // Update Last Activity Description if it exists
  const activityDesc = `Phase ${phaseNumber} execution started`;
  result = stateReplaceField(content, 'Last Activity Description', activityDesc);
  if (result) { content = result; updated.push('Last Activity Description'); }

  // Update Current Phase
  result = stateReplaceField(content, 'Current Phase', String(phaseNumber));
  if (result) { content = result; updated.push('Current Phase'); }

  // Update Current Phase Name
  if (phaseName) {
    result = stateReplaceField(content, 'Current Phase Name', phaseName);
    if (result) { content = result; updated.push('Current Phase Name'); }
  }

  // Update Current Plan to 1 (starting from the first plan)
  result = stateReplaceField(content, 'Current Plan', '1');
  if (result) { content = result; updated.push('Current Plan'); }

  // Update Total Plans in Phase
  if (planCount) {
    result = stateReplaceField(content, 'Total Plans in Phase', String(planCount));
    if (result) { content = result; updated.push('Total Plans in Phase'); }
  }

  // Update **Current focus:** body text line (#1104)
  const focusLabel = phaseName ? `Phase ${phaseNumber} — ${phaseName}` : `Phase ${phaseNumber}`;
  const focusPattern = /(\*\*Current focus:\*\*\s*).*/i;
  if (focusPattern.test(content)) {
    content = content.replace(focusPattern, (_match, prefix) => `${prefix}${focusLabel}`);
    updated.push('Current focus');
  }

  // Update ## Current Position section (#1104)
  const positionPattern = /(##\s*Current Position\s*\n)([\s\S]*?)(?=\n##|$)/i;
  const positionMatch = content.match(positionPattern);
  if (positionMatch) {
    const newPosition = `Phase: ${phaseNumber}${phaseName ? ` (${phaseName})` : ''} — EXECUTING\nPlan: 1 of ${planCount || '?'}\n`;
    content = content.replace(positionPattern, (_match, header) => `${header}${newPosition}`);
    updated.push('Current Position');
  }

  if (updated.length > 0) {
    writeStateMd(statePath, content, cwd);
  }

  output({ updated, phase: phaseNumber, phase_name: phaseName || null, plan_count: planCount || null }, raw, updated.length > 0 ? 'true' : 'false');
}

// ─── State Pause / Resume ─────────────────────────────────────────────────────

/**
 * getCurrentPhase — Determine the current phase number from STATE.md or ROADMAP.md
 *
 * Returns phase number as string (e.g., "51") or null if not found.
 */
function getCurrentPhase(cwd) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const content = safeReadFile(statePath);
  if (!content) return null;

  // Try frontmatter current_phase
  const fm = extractFrontmatter(content);
  if (fm.current_phase) {
    return String(fm.current_phase);
  }

  // Try extracting "Phase: N" from body (e.g., "Phase: 51 (name) — EXECUTING")
  const phaseMatch = content.match(/^Phase:\s*(\d+)/m);
  if (phaseMatch) {
    return phaseMatch[1];
  }

  // Try "Current Phase:" field (bold or plain)
  const currentPhase = stateExtractField(content, 'Current Phase');
  if (currentPhase) {
    const numMatch = currentPhase.match(/\d+/);
    if (numMatch) return numMatch[0];
  }

  return null;
}

/**
 * cmdStatePause — Pause project execution
 *
 * Sets STATE.md status to "paused" with optional reason. Workflows check this
 * status and will halt before starting new work.
 */
function cmdStatePause(cwd, reason, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const content = safeReadFile(statePath);
  if (!content) error('STATE.md not found — cannot pause');

  const now = new Date().toISOString();
  const phase = getCurrentPhase(cwd) || null;

  // Create state snippet: first 500 chars of body (after frontmatter)
  const fmMatch = content.match(/^---\r?\n[\s\S]+?\r?\n---/);
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;
  const state_snippet = body.substring(0, 500);

  // Write .continue-here
  const continuePath = path.join(cwd, '.continue-here');
  const continueData = { phase, reason: reason || '', timestamp: now, state_snippet };
  try {
    fs.writeFileSync(continuePath, JSON.stringify(continueData, null, 2), 'utf-8');
  } catch (err) {
    error('Failed to write .continue-here: ' + err.message);
  }

  // Update frontmatter: set status='paused', paused_at=now
  let fm = extractFrontmatter(content);
  fm.status = 'paused';
  fm.paused_at = now;
  let newContent = spliceFrontmatter(content, fm);

  // Write updated STATE.md
  writeStateMd(statePath, newContent, cwd);

  // Clear auto-chain flag in config
  const configPath = path.join(cwd, '.planning', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      let cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!cfg.workflow) cfg.workflow = {};
      cfg.workflow._auto_chain_active = false;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (e) {
      // Ignore config errors, but proceed
    }
  }

  output({ paused: true, reason, paused_at: now, phase, continue_file: continuePath }, raw, 'paused');
}

/**
 * cmdStateResume — Resume execution after pause
 *
 * Clears "paused" status from STATE.md and removes Paused section.
 */
function cmdStateResume(cwd, options = {}, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const content = safeReadFile(statePath);
  if (!content) error('STATE.md not found — cannot resume');

  const continuePath = path.join(cwd, '.continue-here');
  let context = null;
  if (fs.existsSync(continuePath)) {
    try {
      context = JSON.parse(fs.readFileSync(continuePath, 'utf-8'));
    } catch (e) {
      // ignore parse errors
    }
  }

  const result = { resumed: true };
  if (context) {
    result.context = context;
  }

  // Remove paused status from frontmatter
  const fm = extractFrontmatter(content);
  let hadStatus = 'status' in fm;
  let hadPausedAt = 'paused_at' in fm;
  delete fm.status;
  delete fm.paused_at;
  let newContent = spliceFrontmatter(content, fm);

  // Remove any Paused At: lines and ## Paused section from body (cleanup)
  const pausedAtPattern = /^Paused At:.*$/im;
  if (pausedAtPattern.test(newContent)) {
    newContent = newContent.replace(pausedAtPattern, '');
    hadPausedAt = true;
  }
  const pauseSectionPattern = /\n## Paused\n[\s\S]*?(?=\n##|\n#|\Z)/;
  if (pauseSectionPattern.test(newContent)) {
    newContent = newContent.replace(pauseSectionPattern, '');
  }

  if (hadStatus || hadPausedAt) {
    writeStateMd(statePath, newContent, cwd);
  }

  // Clear .continue-here if --clear flag and file existed
  if (options.clear && fs.existsSync(continuePath)) {
    try {
      fs.unlinkSync(continuePath);
      result.cleared_continue = true;
    } catch (e) {}
  }

  if (!hadStatus && !hadPausedAt) {
    result.resumed = false;
    result.reason = 'not paused';
  }

  output(result, raw, JSON.stringify(result));
}

/**
 * parsePerformanceMetrics — Extract performance metrics from STATE.md content
 */
function parsePerformanceMetrics(content) {
  const result = { by_phase: [], plan_entries: [] };

  // Find the Performance Metrics section
  const sectionMatch = content.match(/##\s*Performance Metrics\s*\n([\s\S]*?)(?=\n##|\n#|$)/);
  if (!sectionMatch) return result;
  const section = sectionMatch[1];

  // Parse By Phase table
  const lines = section.split('\n');
  let inTable = false;
  for (let line of lines) {
    // Detect table header
    if (line.includes('| Phase') && line.includes('| Plans') && line.includes('| Total') && line.includes('Avg/Plan')) {
      inTable = true;
      continue;
    }
    if (inTable) {
      const trimmed = line.trim();
      // End of table when line is empty or starts with non-table content
      if (trimmed === '' || !trimmed.startsWith('|')) {
        inTable = false;
        continue;
      }
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 4) {
        const phase = parseInt(cells[0], 10);
        const plans = parseInt(cells[1], 10);
        const total = cells[2];
        const avg = cells[3];
        if (!isNaN(phase) && !isNaN(plans)) {
          result.by_phase.push({ phase, plans, total, avg });
        }
      }
    }
  }

  // Parse individual plan metric lines: | Phase 39 P01 | 15min | 3 tasks | 2 files |
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && /Phase\s+\d+\s+P\d+/i.test(trimmed)) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 4) {
        const phase_plan = cells[0];
        const duration = cells[1];
        const tasksStr = cells[2];
        const filesStr = cells[3];
        const tasksMatch = tasksStr.match(/(\d+)/);
        const filesMatch = filesStr.match(/(\d+)/);
        const tasks = tasksMatch ? parseInt(tasksMatch[1], 10) : null;
        const files = filesMatch ? parseInt(filesMatch[1], 10) : null;
        result.plan_entries.push({ phase_plan, duration, tasks, files });
      }
    }
  }

  return result;
}

/**
 * cmdStateGetMetrics — Get parsed performance metrics from STATE.md
 */
function cmdStateGetMetrics(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const content = safeReadFile(statePath) || '';
  if (!content) {
    output({ by_phase: [], plan_entries: [] }, raw, '{}');
    return;
  }

  const metrics = parsePerformanceMetrics(content);
  let { by_phase, plan_entries } = metrics;

  // Filter by phase if provided
  if (options.phase) {
    const phaseNum = parseInt(options.phase, 10);
    if (!isNaN(phaseNum)) {
      by_phase = by_phase.filter(p => p.phase === phaseNum);
      plan_entries = plan_entries.filter(e => {
        const text = e.phase_plan.toLowerCase();
        return text.includes(`phase ${phaseNum}`) || text.includes(`phase${phaseNum}`);
      });
    }
  }

  // Filter by plan if provided
  if (options.plan) {
    const planStr = options.plan.toString();
    plan_entries = plan_entries.filter(e => {
      const text = e.phase_plan.toLowerCase();
      return text.includes(`p${planStr}`) || text.includes(`p0${planStr}`) || text.includes(planStr);
    });
  }

  const result = { by_phase, plan_entries };
  output(result, raw, JSON.stringify(result));
}

module.exports = {
  stateExtractField,
  stateReplaceField,
  harvestAmbientContext,
  writeStateMd,
  cmdStateLoad,
  cmdStateGet,
  cmdStatePatch,
  cmdStateUpdate,
  cmdStateAdvancePlan,
  cmdStateRecordMetric,
  cmdStateUpdateProgress,
  cmdStateAddDecision,
  cmdStateAddBlocker,
  cmdStateResolveBlocker,
  cmdStateRecordSession,
  cmdStateSnapshot,
  cmdStateJson,
  cmdStateBeginPhase,
  cmdStateCheckpoint,
  cmdStateAssert,
  cmdStateVerify,   // new: live verification
  cmdStatePause,    // new
  cmdStateResume,   // new
  parsePerformanceMetrics,
  cmdStateGetMetrics,
  cmdStateHarvestContext,
  parseStateSnapshot,
  buildStateFrontmatter,
  applyReconciliationState,
};
