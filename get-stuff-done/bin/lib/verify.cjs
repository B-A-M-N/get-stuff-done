/**
 * Verify — Verification suite, consistency, and health validation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { safeReadFile, loadConfig, normalizePhaseName, execGit, findPhaseInternal, getRoadmapPhaseInternal, getMilestoneInfo, stripShippedMilestones, output, error } = require('./core.cjs');
const { extractFrontmatter, parseMustHavesBlock } = require('./frontmatter.cjs');
const { writeStateMd } = require('./state.cjs');
const { checkpointResponseSchema, executionSummarySchema } = require('./artifact-schema.cjs');

function extractSummaryReferencedPaths(content, frontmatter = {}) {
  const found = new Set();
  const contentWithoutCodeBlocks = String(content || '').replace(/```[\s\S]*?```/g, '');
  const keyFiles = frontmatter['key-files'];
  if (keyFiles && typeof keyFiles === 'object') {
    for (const bucket of ['created', 'modified']) {
      const values = keyFiles[bucket];
      if (Array.isArray(values)) {
        for (const value of values) {
          if (typeof value === 'string' && value.trim()) {
            found.add(value.trim());
          }
        }
      }
    }
  }

  const patterns = [
    /`([^`]+)`/g,
    /(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+)`?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(contentWithoutCodeBlocks)) !== null) {
      const candidate = match[1]?.trim();
      if (candidate && candidate.includes('/') && !candidate.startsWith('http')) {
        found.add(candidate);
      }
    }
  }

  return Array.from(found);
}

function summaryPathRequiresColdStart(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return [
    /(^|\/)(server|app|index|main)\.[^/]+$/,
    /(^|\/)(database|db|seed|seeds|migrations)(\/|$)/,
    /(^|\/)startup[^/]*$/,
    /(^|\/)docker-compose[^/]*$/,
    /(^|\/)dockerfile[^/]*$/,
  ].some(pattern => pattern.test(normalized));
}

function extractTaskCountFromSummary(content) {
  const match = content.match(/-\s+\*\*Tasks:\*\*\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function extractMarkdownSection(content, heading) {
  const headingRegex = new RegExp(`^\\s*##\\s*${heading}\\s*$`, 'im');
  const headingMatch = headingRegex.exec(content);
  if (!headingMatch) return null;

  const start = headingMatch.index + headingMatch[0].length;
  const remainder = content.slice(start);
  const nextHeadingMatch = /^\s*##\s+.+$/im.exec(remainder);
  const sectionBody = nextHeadingMatch
    ? remainder.slice(0, nextHeadingMatch.index)
    : remainder;
  return sectionBody;
}

function extractTaskCommitHashes(content) {
  const section = extractMarkdownSection(content, 'Task Commits');
  if (section === null) {
    return { sectionPresent: false, hashes: [] };
  }

  const hashes = [];
  const hashPattern = /\b([0-9a-f]{7,40})\b/g;
  let match;
  while ((match = hashPattern.exec(section)) !== null) {
    hashes.push(match[1]);
  }

  return { sectionPresent: true, hashes };
}

function extractStructuredProofIndex(content) {
  const section = extractMarkdownSection(content, 'Proof Index');
  if (section === null) {
    return { sectionPresent: false, entries: [], parse_error: null };
  }

  const blockMatch = section.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!blockMatch) {
    return { sectionPresent: true, entries: [], parse_error: 'missing fenced JSON block' };
  }

  try {
    const parsed = JSON.parse(blockMatch[1]);
    return {
      sectionPresent: true,
      entries: Array.isArray(parsed) ? parsed : [],
      parse_error: Array.isArray(parsed) ? null : 'proof index must be a JSON array',
    };
  } catch (err) {
    return { sectionPresent: true, entries: [], parse_error: err.message };
  }
}

function normalizeProofEntry(entry = {}) {
  return {
    task: entry.task != null ? Number(entry.task) : null,
    proof_mode: entry.proof_mode || 'commit',
    canonical_commit: entry.canonical_commit || entry.hash || null,
    files: Array.isArray(entry.files) ? entry.files.map(String) : [],
    verify: entry.verify || entry.verify_command || null,
    evidence: Array.isArray(entry.evidence) ? entry.evidence.map(String) : [],
    runtime_required: Boolean(entry.runtime_required),
    runtime_proof: Array.isArray(entry.runtime_proof) ? entry.runtime_proof.map(String) : [],
  };
}

function cmdVerifySummary(cwd, summaryPath, checkFileCount, raw) {
  if (!summaryPath) {
    error('summary-path required');
  }

  const fullPath = path.join(cwd, summaryPath);
  const checkCount = checkFileCount || 2;

  if (!fs.existsSync(fullPath)) {
    const result = {
      passed: false,
      checks: {
        summary_exists: false,
        files_created: { checked: 0, found: 0, missing: [] },
        commits_exist: false,
        task_commits: { required: false, declared_tasks: null, found: 0, unique: 0, section_present: false, invalid: [] },
        self_check: 'not_found',
        schema_valid: false,
      },
      errors: ['SUMMARY.md not found'],
    };
    output(result, raw, 'failed');
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  const errors = [];
  const warnings = [];

  const phaseNum = parseInt(fm.phase, 10);
  const isLegacy = !isNaN(phaseNum) && phaseNum < 15;

  const schemaResult = executionSummarySchema.safeParse(fm);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      const msg = `Schema error: ${issue.path.join('.')} - ${issue.message}`;
      if (isLegacy) {
        warnings.push(msg);
      } else {
        errors.push(msg);
      }
    }
  }

  const mentionedFiles = extractSummaryReferencedPaths(content, fm);
  const filesToCheck = mentionedFiles.slice(0, checkCount);
  const missing = [];
  for (const file of filesToCheck) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  const commitHashPattern = /\b[0-9a-f]{7,40}\b/g;
  const allHashes = Array.from(new Set(content.match(commitHashPattern) || []));
  const invalidHashes = [];
  for (const hash of allHashes) {
    const result = execGit(cwd, ['cat-file', '-t', hash]);
    if (!(result.exitCode === 0 && result.stdout.trim() === 'commit')) {
      invalidHashes.push(hash);
    }
  }
  const commitsExist = allHashes.length > 0 && invalidHashes.length === 0;

  const taskCommitInfo = extractTaskCommitHashes(content);
  const proofIndexInfo = extractStructuredProofIndex(content);
  const normalizedProofEntries = proofIndexInfo.entries.map(normalizeProofEntry);
  const uniqueTaskHashes = Array.from(new Set(taskCommitInfo.hashes));
  const invalidTaskHashes = uniqueTaskHashes.filter(hash => invalidHashes.includes(hash));
  const declaredTaskCount = extractTaskCountFromSummary(content);
  const taskCommitsRequired = !isLegacy;
  const structuredProofRequired = !isNaN(phaseNum) && phaseNum >= 71;

  let selfCheck = 'not_found';
  const selfCheckPattern = /##\s*(?:Self[- ]?Check|Verification|Quality Check)/i;
  if (selfCheckPattern.test(content)) {
    const passPattern = /(?:all\s+)?(?:pass|✓|✅|complete|succeeded)/i;
    const failPattern = /(?:fail|✗|❌|incomplete|blocked)/i;
    const checkSection = content.slice(content.search(selfCheckPattern));
    if (failPattern.test(checkSection)) {
      selfCheck = 'failed';
    } else if (passPattern.test(checkSection)) {
      selfCheck = 'passed';
    }
  }

  if (missing.length > 0) errors.push('Missing files: ' + missing.join(', '));
  if (allHashes.length > 0 && invalidHashes.length > 0) {
    errors.push('Referenced commit hashes not found in git history: ' + invalidHashes.join(', '));
  }
  if (selfCheck === 'failed') errors.push('Self-check section indicates failure');

  if (taskCommitsRequired && !taskCommitInfo.sectionPresent) {
    errors.push('Missing required ## Task Commits section');
  }
  if (taskCommitsRequired && uniqueTaskHashes.length === 0) {
    errors.push('Task commit section must reference at least one commit');
  }
  if (declaredTaskCount !== null && uniqueTaskHashes.length < declaredTaskCount) {
    errors.push(`Task commit coverage mismatch: declared ${declaredTaskCount}, found ${uniqueTaskHashes.length}`);
  }
  if (taskCommitInfo.hashes.length !== uniqueTaskHashes.length) {
    errors.push('Task commit hashes must be unique');
  }
  if (invalidTaskHashes.length > 0) {
    errors.push('Task commit hashes not found in git history: ' + invalidTaskHashes.join(', '));
  }

  if (structuredProofRequired && !proofIndexInfo.sectionPresent) {
    errors.push('Missing required ## Proof Index section');
  }
  if (proofIndexInfo.parse_error) {
    errors.push(`Proof Index parse error: ${proofIndexInfo.parse_error}`);
  }
  if (structuredProofRequired && normalizedProofEntries.length === 0) {
    errors.push('Proof Index must contain at least one structured proof entry');
  }

  const invalidProofHashes = [];
  const proofEntryErrors = [];
  for (const entry of normalizedProofEntries) {
    if (entry.task == null || Number.isNaN(entry.task)) {
      proofEntryErrors.push('Proof Index entry missing numeric task id');
    }
    if (!Array.isArray(entry.files) || entry.files.length === 0) {
      proofEntryErrors.push(`Proof Index task ${entry.task ?? '?'} missing files`);
    }
    if (!entry.verify) {
      proofEntryErrors.push(`Proof Index task ${entry.task ?? '?'} missing verify command`);
    }
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      proofEntryErrors.push(`Proof Index task ${entry.task ?? '?'} missing evidence`);
    }
    if (entry.proof_mode !== 'proof_only' && !entry.canonical_commit) {
      proofEntryErrors.push(`Proof Index task ${entry.task ?? '?'} missing canonical commit`);
    }
    if (entry.canonical_commit) {
      const result = execGit(cwd, ['cat-file', '-t', entry.canonical_commit]);
      if (!(result.exitCode === 0 && result.stdout.trim() === 'commit')) {
        invalidProofHashes.push(entry.canonical_commit);
      }
    }
    if (entry.runtime_required && (!Array.isArray(entry.runtime_proof) || entry.runtime_proof.length === 0)) {
      proofEntryErrors.push(`Proof Index task ${entry.task ?? '?'} missing runtime proof`);
    }
  }
  if (invalidProofHashes.length > 0) {
    errors.push('Proof Index canonical commits not found in git history: ' + invalidProofHashes.join(', '));
  }
  if (proofEntryErrors.length > 0) {
    errors.push(...proofEntryErrors);
  }

  const passed = errors.length === 0;

  const checks = {
    summary_exists: true,
    schema_valid: schemaResult.success,
    files_created: { checked: filesToCheck.length, found: filesToCheck.length - missing.length, missing },
    commits_exist: commitsExist,
    task_commits: {
      required: taskCommitsRequired,
      declared_tasks: declaredTaskCount,
      found: taskCommitInfo.hashes.length,
      unique: uniqueTaskHashes.length,
      section_present: taskCommitInfo.sectionPresent,
      invalid: invalidTaskHashes,
    },
    proof_index: {
      required: structuredProofRequired,
      section_present: proofIndexInfo.sectionPresent,
      parsed: !proofIndexInfo.parse_error,
      entries: normalizedProofEntries.length,
      invalid: invalidProofHashes,
    },
    self_check: selfCheck,
  };

  const result = { passed, checks, errors, warnings, legacy: isLegacy };
  output(result, raw, passed ? 'passed' : 'failed');
}

function cmdVerifyWorkColdStart(cwd, phase, raw) {
  if (!phase) {
    error('phase required');
  }

  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo?.directory) {
    output({
      found: false,
      phase,
      summary_files: [],
      needs_cold_start_smoke_test: false,
      cold_start_paths: [],
    }, raw, 'not_found');
    return;
  }

  const phaseDir = path.join(cwd, phaseInfo.directory);
  let files = [];
  try {
    files = fs.readdirSync(phaseDir).filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
  } catch {
    files = [];
  }

  const coldStartPaths = new Set();
  for (const fileName of files) {
    try {
      const content = fs.readFileSync(path.join(phaseDir, fileName), 'utf8');
      const frontmatter = extractFrontmatter(content);
      for (const candidate of extractSummaryReferencedPaths(content, frontmatter)) {
        if (summaryPathRequiresColdStart(candidate)) {
          coldStartPaths.add(candidate);
        }
      }
    } catch {}
  }

  output({
    found: true,
    phase: phaseInfo.phase_number,
    summary_files: files.map(fileName => path.posix.join(phaseInfo.directory.replace(/\\/g, '/'), fileName)),
    needs_cold_start_smoke_test: coldStartPaths.size > 0,
    cold_start_paths: Array.from(coldStartPaths).sort(),
  }, raw);
}


function cmdVerifyPlanStructure(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const fm = extractFrontmatter(content);
  const errors = [];
  const warnings = [];

  // Check required frontmatter fields
  const required = ['phase', 'plan', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'];
  for (const field of required) {
    if (fm[field] === undefined) errors.push(`Missing required frontmatter field: ${field}`);
  }

  // Parse and check task elements
  const taskPattern = /<task\b[^>]*>([\s\S]*?)<\/task>/g;
  const tasks = [];
  let taskMatch;
  while ((taskMatch = taskPattern.exec(content)) !== null) {
    const taskOpenTag = taskMatch[0].match(/^<task[^>]*>/)?.[0] || '<task>';
    const taskContent = taskMatch[1];
    const typeMatch = taskOpenTag.match(/type=["']([^"']+)["']/i);
    const taskType = typeMatch ? typeMatch[1].trim() : 'auto';
    const nameMatch = taskContent.match(/<name>([\s\S]*?)<\/name>/);
    const taskName = nameMatch ? nameMatch[1].trim() : 'unnamed';
    const hasFiles = /<files>/.test(taskContent);
    const hasAction = /<action>/.test(taskContent);
    const hasVerify = /<verify>/.test(taskContent);
    const hasDone = /<done>/.test(taskContent);

    if (!nameMatch) errors.push('Task missing <name> element');
    if (!hasAction) errors.push(`Task '${taskName}' missing <action>`);
    if (!hasVerify) warnings.push(`Task '${taskName}' missing <verify>`);
    if (!hasDone) warnings.push(`Task '${taskName}' missing <done>`);
    if (!hasFiles) warnings.push(`Task '${taskName}' missing <files>`);

    if (taskType === 'checkpoint:human-verify') {
      if (!/<what-built>[\s\S]*?<\/what-built>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <what-built>`);
      }
      if (!/<how-to-verify>[\s\S]*?<\/how-to-verify>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <how-to-verify>`);
      }
      if (!/<resume-signal>[\s\S]*?<\/resume-signal>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <resume-signal>`);
      }
    }

    if (taskType === 'checkpoint:decision') {
      if (!/<decision>[\s\S]*?<\/decision>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <decision>`);
      }
      if (!/<context>[\s\S]*?<\/context>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <context>`);
      }
      if (!/<options>[\s\S]*?<\/options>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <options>`);
      }
      if (!/<resume-signal>[\s\S]*?<\/resume-signal>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <resume-signal>`);
      }
    }

    if (taskType === 'checkpoint:human-action') {
      if (!/<instructions>[\s\S]*?<\/instructions>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <instructions>`);
      }
      if (!/<verification>[\s\S]*?<\/verification>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <verification>`);
      }
      if (!/<resume-signal>[\s\S]*?<\/resume-signal>/i.test(taskContent)) {
        errors.push(`Checkpoint task '${taskName}' missing <resume-signal>`);
      }
    }

    tasks.push({ name: taskName, type: taskType, hasFiles, hasAction, hasVerify, hasDone });
  }

  if (tasks.length === 0) warnings.push('No <task> elements found');

  // Wave/depends_on consistency
  if (fm.wave && parseInt(fm.wave) > 1 && (!fm.depends_on || (Array.isArray(fm.depends_on) && fm.depends_on.length === 0))) {
    warnings.push('Wave > 1 but depends_on is empty');
  }

  // Autonomous/checkpoint consistency
  const hasCheckpoints = /<task\s+type=["']?checkpoint/.test(content);
  if (hasCheckpoints && fm.autonomous !== 'false' && fm.autonomous !== false) {
    errors.push('Has checkpoint tasks but autonomous is not false');
  }

  output({
    valid: errors.length === 0,
    errors,
    warnings,
    task_count: tasks.length,
    tasks,
    frontmatter_fields: Object.keys(fm),
  }, raw, errors.length === 0 ? 'valid' : 'invalid');
}

function normalizeFrontmatterArray(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (value === undefined || value === null || value === false) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed === '[]') return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed.slice(1, -1).split(',').map(v => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
    return trimmed.split(',').map(v => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function getTagText(block, tagName) {
  const open = `<${tagName}>`;
  const close = `</${tagName}>`;
  const startIdx = block.indexOf(open);
  if (startIdx === -1) return '';
  const endIdx = block.indexOf(close, startIdx + open.length);
  if (endIdx === -1) return '';
  return block.slice(startIdx + open.length, endIdx).trim();
}

function splitXmlList(text) {
  if (!text) return [];
  return text
    .split(/\r?\n|,/)
    .map(line => line.replace(/^[\s*-]+/, '').replace(/`/g, '').trim())
    .filter(Boolean);
}

function hasExplicitPlanDirective(content, labels = []) {
  return labels.some(label => new RegExp(`^${label}:\s*.+$`, 'im').test(content));
}

function hasExplicitSection(content, headings = []) {
  return headings.some(heading => new RegExp(`^##\s+${heading}\s*$`, 'im').test(content));
}

function hasDeterministicRiskCoverage(content, tasks = []) {
  if (hasExplicitSection(content, ['Risks', 'Risk Coverage', 'Rollback', 'Fallback', 'Guardrails', 'Failure Modes'])) {
    return true;
  }
  if (hasExplicitPlanDirective(content, ['Risk', 'Rollback', 'Fallback', 'Guardrail', 'Failure Mode'])) {
    return true;
  }
  return tasks.some(task => /<risk>[\s\S]*?<\/risk>|<rollback>[\s\S]*?<\/rollback>|<fallback>[\s\S]*?<\/fallback>|<guardrail>[\s\S]*?<\/guardrail>/i.test(task.raw || ''));
}

function hasDeterministicAssumptionCarryForward(content, tasks = []) {
  if (hasExplicitSection(content, ['Assumptions', 'Open Questions', 'Deferred Work', 'Defer Notes', 'Unknowns'])) {
    return true;
  }
  if (hasExplicitPlanDirective(content, ['Assumption', 'Open Question', 'Deferred', 'Unknown'])) {
    return true;
  }
  return tasks.some(task => /<assumption>[\s\S]*?<\/assumption>|<open_question>[\s\S]*?<\/open_question>|<deferred>[\s\S]*?<\/deferred>|<unknown>[\s\S]*?<\/unknown>/i.test(task.raw || ''));
}

function parsePlanQualityTasks(content) {
  const tasks = [];
  const taskPattern = /<task\b[^>]*>([\s\S]*?)<\/task>/g;
  let taskMatch;
  while ((taskMatch = taskPattern.exec(content)) !== null) {
    const taskOpenTag = taskMatch[0].match(/^<task[^>]*>/)?.[0] || '<task>';
    const taskContent = taskMatch[1];
    const typeMatch = taskOpenTag.match(/type=["']([^"']+)["']/i);
    const taskType = typeMatch ? typeMatch[1].trim() : 'auto';
    const name = getTagText(taskContent, 'name') || 'unnamed';
    const files = splitXmlList(getTagText(taskContent, 'files'));
    const readFirst = splitXmlList(getTagText(taskContent, 'read_first'));
    const action = getTagText(taskContent, 'action');
    const verify = getTagText(taskContent, 'verify');
    const done = getTagText(taskContent, 'done');
    const acceptanceCriteria = splitXmlList(getTagText(taskContent, 'acceptance_criteria'));
    tasks.push({
      name,
      type: taskType,
      files,
      read_first: readFirst,
      acceptance_criteria: acceptanceCriteria,
      action,
      verify,
      done,
      raw: taskContent,
      hasFiles: files.length > 0,
      hasReadFirst: readFirst.length > 0,
      hasAcceptanceCriteria: acceptanceCriteria.length > 0,
      hasAction: !!action,
      hasVerify: !!verify,
      hasDone: !!done,
      isCheckpoint: taskType.startsWith('checkpoint:'),
    });
  }
  return tasks;
}

function extractPhaseRequirementIdsFromSection(section) {
  const reqMatch = section.match(/^\*\*Requirements\*\*:[^\S\n]*([^\n]*)$/m);
  if (!reqMatch) return [];
  return reqMatch[1].replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean).filter(id => id !== 'TBD');
}

function detectCycle(edges) {
  const visiting = new Set();
  const visited = new Set();

  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const dep of edges.get(node) || []) {
      if (visit(dep)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of edges.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

function buildPlanQualitySummary(status, issues, dimensionScores) {
  const blockers = issues.filter(issue => issue.severity === 'blocker').length;
  const warnings = issues.filter(issue => issue.severity !== 'blocker').length;
  const lowScores = Object.values(dimensionScores).filter(entry => entry.score < 3).length;
  if (status === 'blocked') return `Blocked: ${blockers} blocker(s), ${warnings} revision issue(s), ${lowScores} low-score dimension(s)`;
  if (status === 'revise') return `Revise: ${warnings} quality issue(s), ${lowScores} dimension(s) below threshold`;
  return 'Passed: plan quality thresholds met';
}

function extractBulletSection(content, heading) {
  const headingPattern = new RegExp(`^#{2,3}\\s+${heading}\\s*$`, 'im');
  const match = content.match(headingPattern);
  if (!match || match.index === undefined) return [];
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeadingMatch = rest.match(/\n#{2,3}\s+/);
  const block = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;
  return block
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean)
    .filter(line => !/^none\b/i.test(line));
}

function buildDomainContract(contextContent = '', researchContent = '') {
  const contract = {
    locked_decisions: extractTaggedBullets(contextContent, 'decisions'),
    unresolved_ambiguities: extractHeadingBullets(contextContent, 'Unresolved Ambiguities'),
    interpreted_assumptions: extractHeadingBullets(contextContent, 'Interpreted Assumptions'),
    open_questions: extractBulletSection(researchContent, 'Open Questions'),
    invariants: extractBulletSection(researchContent, 'Invariants'),
    allowed_state_transitions: extractBulletSection(researchContent, 'Allowed State Transitions'),
    forbidden_states: extractBulletSection(researchContent, 'Forbidden States'),
    test_oracles: extractBulletSection(researchContent, 'Test Oracles'),
    truth_tables: extractBulletSection(researchContent, 'Truth Tables'),
    policy_rules: extractBulletSection(researchContent, 'Policy Rules'),
    executable_checks: extractBulletSection(researchContent, 'Executable Checks'),
  };

  contract.non_empty_categories = Object.entries(contract)
    .filter(([key, value]) => key !== 'non_empty_categories' && Array.isArray(value) && value.length > 0)
    .map(([key]) => key);

  return contract;
}

function hasPlanCoverageForContractCategory(content, tasks, category) {
  const categoryMatchers = {
    invariants: () => hasExplicitSection(content, ['Invariants']) || hasExplicitPlanDirective(content, ['Invariant']),
    allowed_state_transitions: () => hasExplicitSection(content, ['Allowed State Transitions']) || hasExplicitPlanDirective(content, ['Allowed State Transition']),
    forbidden_states: () => hasExplicitSection(content, ['Forbidden States']) || hasExplicitPlanDirective(content, ['Forbidden State']),
    test_oracles: () => hasExplicitSection(content, ['Test Oracles']) || hasExplicitPlanDirective(content, ['Test Oracle']),
    truth_tables: () => hasExplicitSection(content, ['Truth Tables']) || hasExplicitPlanDirective(content, ['Truth Table']),
    policy_rules: () => hasExplicitSection(content, ['Policy Rules']) || hasExplicitPlanDirective(content, ['Policy Rule']),
    executable_checks: () => hasExplicitSection(content, ['Executable Checks']) || hasExplicitPlanDirective(content, ['Executable Check']),
    open_questions: () => hasExplicitSection(content, ['Open Questions']) || hasExplicitPlanDirective(content, ['Open Question']),
    unresolved_ambiguities: () => hasExplicitSection(content, ['Open Questions', 'Unknowns']) || hasExplicitPlanDirective(content, ['Open Question', 'Unknown']),
    interpreted_assumptions: () => hasExplicitSection(content, ['Assumptions']) || hasExplicitPlanDirective(content, ['Assumption']),
    locked_decisions: () => hasExplicitSection(content, ['Implementation Decisions', 'Locked Decisions']) || hasExplicitPlanDirective(content, ['Decision', 'Locked Decision']),
  };

  const matcher = categoryMatchers[category];
  if (!matcher) return false;
  if (matcher()) return true;

  if (category === 'executable_checks') return tasks.some(task => task.hasVerify);
  if (category === 'test_oracles') return tasks.some(task => task.hasAcceptanceCriteria);
  return false;
}

function cmdVerifyPlanQuality(cwd, phase, raw) {
  if (!phase) { error('phase required'); }
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ phase, status: 'blocked', error: 'Phase not found', issues: [{ dimension: 'goal_alignment', severity: 'blocker', description: `Phase ${phase} not found`, fix_hint: 'Check ROADMAP.md or run /gsd:progress' }] }, raw, 'blocked');
    return;
  }

  const phaseDir = path.join(cwd, phaseInfo.directory);
  let phaseFiles = [];
  try { phaseFiles = fs.readdirSync(phaseDir); } catch {}
  const planFiles = phaseFiles.filter(f => f.endsWith('-PLAN.md')).sort();
  if (planFiles.length === 0) {
    output({ phase: phaseInfo.phase_number, status: 'blocked', issues: [{ dimension: 'goal_alignment', severity: 'blocker', description: `Phase ${phaseInfo.phase_number} has no PLAN.md artifacts`, fix_hint: `Run /gsd:plan-phase ${phaseInfo.phase_number}` }], scores: {}, summary: 'Blocked: no plans found' }, raw, 'blocked');
    return;
  }

  const roadmapPhase = getRoadmapPhaseInternal(cwd, String(Number.parseInt(String(phaseInfo.phase_number).split('.')[0], 10)));
  const roadmapSection = roadmapPhase?.section || '';
  const requiredIds = extractPhaseRequirementIdsFromSection(roadmapSection);
  const contextFile = phaseFiles.find(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
  const researchFile = phaseFiles.find(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
  const contextContent = contextFile ? safeReadFile(path.join(phaseDir, contextFile)) || '' : '';
  const researchContent = researchFile ? safeReadFile(path.join(phaseDir, researchFile)) || '' : '';
  const domainContract = buildDomainContract(contextContent, researchContent);
  const ambiguitySignals = domainContract.unresolved_ambiguities.length > 0
    || domainContract.interpreted_assumptions.length > 0
    || domainContract.open_questions.length > 0
    || /open question|unresolved|assumption|unknown/i.test(researchContent);

  const planSet = new Set();
  const dependencies = new Map();
  const issues = [];
  const metrics = {
    plan_count: planFiles.length,
    task_count: 0,
    executable_task_count: 0,
    tasks_missing_read_first: 0,
    tasks_missing_acceptance_criteria: 0,
    tasks_missing_verify: 0,
    plans_missing_requirements: 0,
    plans_missing_truths: 0,
    plans_missing_key_links: 0,
    plans_missing_artifacts: 0,
    plans_with_risk_contracts: 0,
    plans_with_assumption_contracts: 0,
    oversized_plans: 0,
    large_file_plans: 0,
    contract_categories_total: 0,
    contract_categories_covered: 0,
  };
  const plans = [];

  for (const file of planFiles) {
    const fullPath = path.join(phaseDir, file);
    const content = safeReadFile(fullPath) || '';
    const fm = extractFrontmatter(content);
    const planId = String(fm.plan || file.replace(/.*-(\d+)-PLAN\.md$/, '$1').replace('-PLAN.md', ''));
    const dependsOn = normalizeFrontmatterArray(fm.depends_on);
    const filesModified = normalizeFrontmatterArray(fm.files_modified);
    const requirements = normalizeFrontmatterArray(fm.requirements);
    const truths = parseMustHavesBlock(content, 'truths');
    const artifacts = parseMustHavesBlock(content, 'artifacts');
    const keyLinks = parseMustHavesBlock(content, 'key_links');
    const tasks = parsePlanQualityTasks(content);
    const executableTasks = tasks.filter(task => !task.isCheckpoint);
    const hasRiskContract = hasDeterministicRiskCoverage(content, tasks);
    const hasAssumptionContract = hasDeterministicAssumptionCarryForward(content, tasks);
    const coveredContractCategories = domainContract.non_empty_categories.filter(category => hasPlanCoverageForContractCategory(content, tasks, category));
    const wave = Number.parseInt(String(fm.wave || '1'), 10) || 1;

    planSet.add(planId);
    dependencies.set(planId, dependsOn);
    metrics.task_count += tasks.length;
    metrics.executable_task_count += executableTasks.length;
    if (hasRiskContract) metrics.plans_with_risk_contracts += 1;
    if (hasAssumptionContract) metrics.plans_with_assumption_contracts += 1;
    if (requirements.length === 0) metrics.plans_missing_requirements += 1;
    if (truths.length === 0) metrics.plans_missing_truths += 1;
    if (artifacts.length === 0) metrics.plans_missing_artifacts += 1;
    if (keyLinks.length === 0) metrics.plans_missing_key_links += 1;
    if (executableTasks.length > 4) metrics.oversized_plans += 1;
    if (filesModified.length > 10) metrics.large_file_plans += 1;
    metrics.contract_categories_total += domainContract.non_empty_categories.length;
    metrics.contract_categories_covered += coveredContractCategories.length;

    for (const task of executableTasks) {
      if (!task.hasReadFirst) metrics.tasks_missing_read_first += 1;
      if (!task.hasAcceptanceCriteria) metrics.tasks_missing_acceptance_criteria += 1;
      if (!task.hasVerify) metrics.tasks_missing_verify += 1;
    }

    if (requirements.length === 0) {
      issues.push({ dimension: 'goal_alignment', severity: 'warning', plan: planId, description: `Plan ${planId} is missing requirements frontmatter`, fix_hint: 'Add roadmap requirement IDs to requirements: [...]' });
    }
    if (truths.length === 0) {
      issues.push({ dimension: 'goal_alignment', severity: 'warning', plan: planId, description: `Plan ${planId} is missing must_haves.truths`, fix_hint: 'Add user-observable truths to must_haves.truths' });
    }
    if (artifacts.length === 0) {
      issues.push({ dimension: 'verification_strength', severity: 'warning', plan: planId, description: `Plan ${planId} is missing must_haves.artifacts`, fix_hint: 'List the artifacts this plan must produce' });
    }
    if (keyLinks.length === 0) {
      issues.push({ dimension: 'verification_strength', severity: 'warning', plan: planId, description: `Plan ${planId} is missing must_haves.key_links`, fix_hint: 'Describe how the artifacts wire together or justify why none are needed' });
    }
    if (executableTasks.length === 0) {
      issues.push({ dimension: 'task_atomicity', severity: 'blocker', plan: planId, description: `Plan ${planId} has no executable tasks`, fix_hint: 'Add at least one executable task before checkpoints' });
    }
    if (executableTasks.length > 4) {
      issues.push({ dimension: 'scope_fit', severity: executableTasks.length >= 6 ? 'blocker' : 'warning', plan: planId, description: `Plan ${planId} has ${executableTasks.length} executable tasks`, fix_hint: 'Split the plan into smaller units (target 2-4 tasks)' });
    }
    if (filesModified.length > 10) {
      issues.push({ dimension: 'scope_fit', severity: filesModified.length >= 15 ? 'blocker' : 'warning', plan: planId, description: `Plan ${planId} touches ${filesModified.length} files in files_modified`, fix_hint: 'Reduce file scope or split the work into another plan' });
    }
    if (!hasRiskContract) {
      issues.push({ dimension: 'risk_coverage', severity: 'warning', plan: planId, description: `Plan ${planId} does not surface risk, fallback, or defer language`, fix_hint: 'Add an explicit Risk:/Rollback:/Fallback:/Guardrail: line or a dedicated risk section' });
    }
    for (const task of executableTasks) {
      if (!task.hasReadFirst) issues.push({ dimension: 'task_atomicity', severity: 'warning', plan: planId, description: `Task '${task.name}' is missing <read_first>`, fix_hint: 'List the source-of-truth files the executor must read first' });
      if (!task.hasAcceptanceCriteria) issues.push({ dimension: 'verification_strength', severity: 'warning', plan: planId, description: `Task '${task.name}' is missing <acceptance_criteria>`, fix_hint: 'Add grep/testable acceptance criteria' });
      if (!task.hasVerify) issues.push({ dimension: 'verification_strength', severity: 'warning', plan: planId, description: `Task '${task.name}' is missing <verify>`, fix_hint: 'Add an explicit verification command or output check' });
    }
    if (wave > 1 && dependsOn.length === 0) {
      issues.push({ dimension: 'dependency_clarity', severity: 'warning', plan: planId, description: `Plan ${planId} is in wave ${wave} but has no depends_on entries`, fix_hint: 'Either move it to wave 1 or declare its dependencies' });
    }

    plans.push({
      plan: planId,
      file,
      wave,
      depends_on: dependsOn,
      files_modified: filesModified.length,
      requirements,
      truths: truths.length,
      artifacts: artifacts.length,
      key_links: keyLinks.length,
      task_count: tasks.length,
      executable_task_count: executableTasks.length,
      has_risk_contract: hasRiskContract,
      has_assumption_contract: hasAssumptionContract,
      covered_contract_categories: coveredContractCategories,
    });
  }

  const coveredRequirements = new Set(plans.flatMap(plan => plan.requirements));
  const missingRequirementIds = requiredIds.filter(id => !coveredRequirements.has(id));
  if (missingRequirementIds.length > 0) {
    issues.push({ dimension: 'goal_alignment', severity: 'blocker', description: `Phase requirements not covered by any plan: ${missingRequirementIds.join(', ')}`, fix_hint: 'Add the missing requirement IDs to plan frontmatter and cover them with tasks' });
  }

  for (const plan of plans) {
    for (const dep of plan.depends_on) {
      if (!planSet.has(dep)) {
        issues.push({ dimension: 'dependency_clarity', severity: 'blocker', plan: plan.plan, description: `Plan ${plan.plan} depends on missing plan '${dep}'`, fix_hint: 'Fix depends_on or create the missing upstream plan' });
      }
      const depPlan = plans.find(candidate => candidate.plan === dep);
      if (depPlan && depPlan.wave >= plan.wave) {
        issues.push({ dimension: 'dependency_clarity', severity: 'warning', plan: plan.plan, description: `Plan ${plan.plan} is in wave ${plan.wave} but depends on plan ${dep} in wave ${depPlan.wave}`, fix_hint: 'Move the dependent plan to a later wave than its dependencies' });
      }
    }
  }

  if (detectCycle(dependencies)) {
    issues.push({ dimension: 'dependency_clarity', severity: 'blocker', description: 'Circular dependency detected across plans', fix_hint: 'Break the cycle by reordering or splitting dependencies' });
  }

  if (ambiguitySignals && metrics.plans_with_assumption_contracts === 0) {
    issues.push({ dimension: 'assumption_honesty', severity: 'warning', description: 'Context or research contains unresolved ambiguity, but no plan preserves that ambiguity as assumptions/defer/pause language', fix_hint: 'Add an explicit Assumption:/Open Question:/Deferred: line or dedicated assumptions section before hardening scope' });
  }

  const uncoveredContractCategories = domainContract.non_empty_categories.filter(
    category => !plans.some(plan => plan.covered_contract_categories.includes(category))
  );
  for (const category of uncoveredContractCategories) {
    issues.push({
      dimension: 'contract_materialization',
      severity: ['invariants', 'forbidden_states', 'policy_rules', 'executable_checks'].includes(category) ? 'blocker' : 'warning',
      description: `Surfaced domain contract category '${category}' is not carried into any plan`,
      fix_hint: `Add an explicit ${category.replace(/_/g, ' ')} section/directive or executable task coverage to at least one plan`,
    });
  }

  const executableTasks = Math.max(metrics.executable_task_count, 1);
  const plansCount = Math.max(metrics.plan_count, 1);
  const taskAtomicityCoverage = 1 - ((metrics.tasks_missing_read_first + metrics.tasks_missing_acceptance_criteria) / (executableTasks * 2));
  const verificationCoverage = 1 - ((metrics.tasks_missing_acceptance_criteria + metrics.tasks_missing_verify + metrics.plans_missing_key_links + metrics.plans_missing_artifacts) / ((executableTasks * 2) + (plansCount * 2)));
  const contractCoverage = domainContract.non_empty_categories.length === 0
    ? 1
    : (domainContract.non_empty_categories.length - uncoveredContractCategories.length) / domainContract.non_empty_categories.length;

  const dimensionScores = {
    goal_alignment: {
      score: missingRequirementIds.length > 0 ? 1 : (metrics.plans_missing_requirements > 0 || metrics.plans_missing_truths > 0 ? 3 : 5),
      max: 5,
      evidence: [`${requiredIds.length} roadmap requirement(s)`, `${coveredRequirements.size} covered requirement ID(s)`, `${plansCount - metrics.plans_missing_truths}/${plansCount} plan(s) with must_haves.truths`],
    },
    scope_fit: {
      score: metrics.oversized_plans > 0 || metrics.large_file_plans > 0 ? ((metrics.oversized_plans > 0 && metrics.large_file_plans > 0) ? 2 : 3) : 5,
      max: 5,
      evidence: [`${metrics.oversized_plans} oversized plan(s)`, `${metrics.large_file_plans} large file-scope plan(s)`],
    },
    task_atomicity: {
      score: taskAtomicityCoverage >= 0.95 ? 5 : taskAtomicityCoverage >= 0.8 ? 4 : taskAtomicityCoverage >= 0.65 ? 3 : 2,
      max: 5,
      evidence: [`${metrics.tasks_missing_read_first} task(s) missing read_first`, `${metrics.tasks_missing_acceptance_criteria} task(s) missing acceptance_criteria`],
    },
    dependency_clarity: {
      score: issues.some(issue => issue.dimension === 'dependency_clarity' && issue.severity === 'blocker') ? 1 : issues.some(issue => issue.dimension === 'dependency_clarity') ? 3 : 5,
      max: 5,
      evidence: [`${plansCount} plan(s) in dependency graph`, `${issues.filter(issue => issue.dimension === 'dependency_clarity').length} dependency issue(s)`],
    },
    verification_strength: {
      score: verificationCoverage >= 0.95 ? 5 : verificationCoverage >= 0.8 ? 4 : verificationCoverage >= 0.65 ? 3 : 2,
      max: 5,
      evidence: [`${metrics.tasks_missing_verify} task(s) missing verify`, `${metrics.plans_missing_artifacts} plan(s) missing artifacts`, `${metrics.plans_missing_key_links} plan(s) missing key_links`],
    },
    risk_coverage: {
      score: metrics.plans_with_risk_contracts === plansCount ? 5 : metrics.plans_with_risk_contracts > 0 ? 3 : 2,
      max: 5,
      evidence: [`${metrics.plans_with_risk_contracts}/${plansCount} plan(s) declare explicit risk coverage`],
    },
    assumption_honesty: {
      score: ambiguitySignals ? (metrics.plans_with_assumption_contracts > 0 ? 5 : 2) : 4,
      max: 5,
      evidence: [ambiguitySignals ? 'Upstream ambiguity signals detected' : 'No upstream ambiguity signals detected', `${metrics.plans_with_assumption_contracts}/${plansCount} plan(s) preserve explicit assumption or defer contracts`],
    },
    contract_materialization: {
      score: contractCoverage >= 0.95 ? 5 : contractCoverage >= 0.8 ? 4 : contractCoverage >= 0.6 ? 3 : contractCoverage > 0 ? 2 : 1,
      max: 5,
      evidence: [
        `${domainContract.non_empty_categories.length} surfaced contract categor${domainContract.non_empty_categories.length === 1 ? 'y' : 'ies'}`,
        `${domainContract.non_empty_categories.length - uncoveredContractCategories.length}/${domainContract.non_empty_categories.length || 1} categor${domainContract.non_empty_categories.length === 1 ? 'y' : 'ies'} carried into plans`,
      ],
    },
  };

  const status = issues.some(issue => issue.severity === 'blocker') ? 'blocked' : (issues.length > 0 || Object.values(dimensionScores).some(entry => entry.score < 3)) ? 'revise' : 'passed';
  output({
    phase: phaseInfo.phase_number,
    status,
    summary: buildPlanQualitySummary(status, issues, dimensionScores),
    scores: dimensionScores,
    issues,
    metrics,
    plans,
    domain_contract: domainContract,
    uncovered_contract_categories: uncoveredContractCategories,
  }, raw, status);
}

function cmdVerifyCheckpointResponse(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const result = checkpointResponseSchema.safeParse(content);
  if (result.success) {
    output({ valid: true, errors: [], fields: result.data }, raw, 'valid');
  } else {
    const errors = result.error.issues.map(e => e.message);
    output({ valid: false, errors, fields: {} }, raw, 'invalid');
  }
}

function cmdVerifyPhaseCompleteness(cwd, phase, raw) {
  if (!phase) { error('phase required'); }
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const errors = [];
  const warnings = [];
  const phaseDir = path.join(cwd, phaseInfo.directory);

  // List plans and summaries
  let files;
  try { files = fs.readdirSync(phaseDir); } catch { output({ error: 'Cannot read phase directory' }, raw); return; }

  const plans = files.filter(f => f.match(/-PLAN\.md$/i));
  const summaries = files.filter(f => f.match(/-SUMMARY\.md$/i));

  // Extract plan IDs (everything before -PLAN.md)
  const planIds = new Set(plans.map(p => p.replace(/-PLAN\.md$/i, '')));
  const summaryIds = new Set(summaries.map(s => s.replace(/-SUMMARY\.md$/i, '')));

  // Plans without summaries
  const incompletePlans = [...planIds].filter(id => !summaryIds.has(id));
  if (incompletePlans.length > 0) {
    errors.push(`Plans without summaries: ${incompletePlans.join(', ')}`);
  }

  // Summaries without plans (orphans)
  const orphanSummaries = [...summaryIds].filter(id => !planIds.has(id));
  if (orphanSummaries.length > 0) {
    warnings.push(`Summaries without plans: ${orphanSummaries.join(', ')}`);
  }

  output({
    complete: errors.length === 0,
    phase: phaseInfo.phase_number,
    plan_count: plans.length,
    summary_count: summaries.length,
    incomplete_plans: incompletePlans,
    orphan_summaries: orphanSummaries,
    errors,
    warnings,
  }, raw, errors.length === 0 ? 'complete' : 'incomplete');
}

function cmdVerifyReferences(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const found = [];
  const missing = [];

  // Find @-references: @path/to/file (must contain / to be a file path)
  const atRefs = content.match(/@([^\s\n,)]+\/[^\s\n,)]+)/g) || [];
  for (const ref of atRefs) {
    const cleanRef = ref.slice(1); // remove @
    const resolved = cleanRef.startsWith('~/')
      ? path.join(process.env.HOME || '', cleanRef.slice(2))
      : path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  // Find backtick file paths that look like real paths (contain / and have extension)
  const backtickRefs = content.match(/`([^`]+\/[^`]+\.[a-zA-Z]{1,10})`/g) || [];
  for (const ref of backtickRefs) {
    const cleanRef = ref.slice(1, -1); // remove backticks
    if (cleanRef.startsWith('http') || cleanRef.includes('${') || cleanRef.includes('{{')) continue;
    if (found.includes(cleanRef) || missing.includes(cleanRef)) continue; // dedup
    const resolved = path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  output({
    valid: missing.length === 0,
    found: found.length,
    missing,
    total: found.length + missing.length,
  }, raw, missing.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyTaskCommit(cwd, hash, options, raw) {
  if (!hash) {
    error('task commit hash required');
  }

  const scope = options?.scope || null;
  const commitType = execGit(cwd, ['cat-file', '-t', hash]);
  const exists = commitType.exitCode === 0 && commitType.stdout.trim() === 'commit';

  let isHead = false;
  let subject = null;
  let scopeMatches = scope === null;

  if (exists) {
    const headResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
    isHead = headResult.exitCode === 0 && headResult.stdout.trim() === hash;

    const subjectResult = execGit(cwd, ['log', '-1', '--format=%s', hash]);
    subject = subjectResult.exitCode === 0 ? subjectResult.stdout.trim() : null;

    if (scope !== null) {
      const openParen = subject ? subject.indexOf('(') : -1;
      const closeParen = subject ? subject.indexOf('):') : -1;
      const subjectScope = openParen !== -1 && closeParen !== -1 && closeParen > openParen
        ? subject.slice(openParen + 1, closeParen)
        : null;
      scopeMatches = subjectScope === scope;
    }
  }

  const errors = [];
  if (!exists) errors.push('Commit hash not found in git history');
  if (exists && !isHead) errors.push('Task commit is not the current HEAD');
  if (exists && scope !== null && !scopeMatches) {
    errors.push(`Task commit subject does not match expected scope ${scope}`);
  }

  output({
    valid: errors.length === 0,
    hash,
    exists,
    is_head: isHead,
    subject,
    scope: scope || null,
    scope_matches: scopeMatches,
    errors,
  }, raw, errors.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyCommits(cwd, hashes, raw) {
  if (!hashes || hashes.length === 0) { error('At least one commit hash required'); }
  const valid = [];
  const invalid = [];

  for (const hash of hashes) {
    const result = execGit(cwd, ['cat-file', '-t', hash]);
    if (result.exitCode === 0 && result.stdout.trim() === 'commit') {
      valid.push(hash);
    } else {
      invalid.push(hash);
    }
  }

  output({
    all_valid: invalid.length === 0,
    valid,
    invalid,
    total: hashes.length,
  }, raw, invalid.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyArtifacts(cwd, planFilePath, raw) {
  if (!planFilePath) { error('plan file path required'); }
  const fullPath = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: planFilePath }, raw); return; }

  const artifacts = parseMustHavesBlock(content, 'artifacts');
  if (artifacts.length === 0) {
    output({ error: 'No must_haves.artifacts found in frontmatter', path: planFilePath }, raw);
    return;
  }

  const results = [];
  for (const artifact of artifacts) {
    if (typeof artifact === 'string') continue; // skip simple string items
    const artPath = artifact.path;
    if (!artPath) continue;

    const artFullPath = path.join(cwd, artPath);
    const exists = fs.existsSync(artFullPath);
    const check = { path: artPath, exists, issues: [], passed: false };

    if (exists) {
      const fileContent = safeReadFile(artFullPath) || '';
      const lineCount = fileContent.split('\n').length;

      if (artifact.min_lines && lineCount < artifact.min_lines) {
        check.issues.push(`Only ${lineCount} lines, need ${artifact.min_lines}`);
      }
      if (artifact.contains && !fileContent.includes(artifact.contains)) {
        check.issues.push(`Missing pattern: ${artifact.contains}`);
      }
      if (artifact.exports) {
        const exports = Array.isArray(artifact.exports) ? artifact.exports : [artifact.exports];
        for (const exp of exports) {
          if (!fileContent.includes(exp)) check.issues.push(`Missing export: ${exp}`);
        }
      }
      check.passed = check.issues.length === 0;
    } else {
      check.issues.push('File not found');
    }

    results.push(check);
  }

  const passed = results.filter(r => r.passed).length;
  output({
    all_passed: passed === results.length,
    passed,
    total: results.length,
    artifacts: results,
  }, raw, passed === results.length ? 'valid' : 'invalid');
}

function cmdVerifyKeyLinks(cwd, planFilePath, raw) {
  if (!planFilePath) { error('plan file path required'); }
  const fullPath = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: planFilePath }, raw); return; }

  const keyLinks = parseMustHavesBlock(content, 'key_links');
  if (keyLinks.length === 0) {
    output({ error: 'No must_haves.key_links found in frontmatter', path: planFilePath }, raw);
    return;
  }

  const results = [];
  for (const link of keyLinks) {
    if (typeof link === 'string') continue;
    const check = { from: link.from, to: link.to, via: link.via || '', verified: false, detail: '' };

    const sourceContent = safeReadFile(path.join(cwd, link.from || ''));
    if (!sourceContent) {
      check.detail = 'Source file not found';
    } else if (link.pattern) {
      try {
        const regex = new RegExp(link.pattern);
        if (regex.test(sourceContent)) {
          check.verified = true;
          check.detail = 'Pattern found in source';
        } else {
          const targetContent = safeReadFile(path.join(cwd, link.to || ''));
          if (targetContent && regex.test(targetContent)) {
            check.verified = true;
            check.detail = 'Pattern found in target';
          } else {
            check.detail = `Pattern "${link.pattern}" not found in source or target`;
          }
        }
      } catch {
        check.detail = `Invalid regex pattern: ${link.pattern}`;
      }
    } else {
      // No pattern: just check source references target
      if (sourceContent.includes(link.to || '')) {
        check.verified = true;
        check.detail = 'Target referenced in source';
      } else {
        check.detail = 'Target not referenced in source';
      }
    }

    results.push(check);
  }

  const verified = results.filter(r => r.verified).length;
  output({
    all_verified: verified === results.length,
    verified,
    total: results.length,
    links: results,
  }, raw, verified === results.length ? 'valid' : 'invalid');
}

function extractTaggedBullets(content, tagName) {
  const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*</${tagName}>`, 'i');
  const match = content.match(pattern);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean)
    .filter(line => !/^none\b/i.test(line));
}

function extractHeadingBullets(content, heading) {
  const pattern = new RegExp(`#{2,3}\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s+|\\n</|$)`, 'i');
  const match = content.match(pattern);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean)
    .filter(line => !/^none\b/i.test(line));
}

function findUncheckedCarryForward(items, researchContent, label) {
  const issues = [];
  const lowerResearch = researchContent.toLowerCase();

  for (const item of items) {
    const index = lowerResearch.indexOf(item.toLowerCase());
    if (index === -1) {
      // Item not carried forward at all
      issues.push(`${label} not carried forward into research: ${item}`);
      continue;
    }
    const windowStart = Math.max(0, index - 120);
    const windowEnd = Math.min(researchContent.length, index + item.length + 120);
    const window = researchContent.slice(windowStart, windowEnd).toLowerCase();
    const markedSafe = /(assumption|defer|deferred|follow-up|open question|clarif|pause|unknown|unresolved)/.test(window);
    if (!markedSafe) {
      issues.push(`${label} appears in the research without an assumption/defer/clarification marker: ${item}`);
    }
  }

  return issues;
}

function cmdVerifyContextContract(cwd, contextFilePath, planFilePath, raw) {
  if (!contextFilePath) { error('context file path required'); }
  const contextFullPath = path.isAbsolute(contextFilePath) ? contextFilePath : path.join(cwd, contextFilePath);
  const contextContent = safeReadFile(contextFullPath);
  if (!contextContent) { output({ error: 'Context file not found', path: contextFilePath }, raw); return; }

  const implementationDecisions = extractTaggedBullets(contextContent, 'decisions');
  const unresolvedAmbiguities = extractHeadingBullets(contextContent, 'Unresolved Ambiguities');
  const interpretedAssumptions = extractHeadingBullets(contextContent, 'Interpreted Assumptions');
  const domainContract = buildDomainContract(contextContent, '');
  const errors = [];
  const warnings = [];

  if (!/###\s+Unresolved Ambiguities/i.test(contextContent)) {
    warnings.push('CONTEXT.md is missing the "Unresolved Ambiguities" section.');
  }

  for (const item of [...unresolvedAmbiguities, ...interpretedAssumptions]) {
    if (implementationDecisions.some(decision => decision.toLowerCase() === item.toLowerCase())) {
      errors.push(`Guidance-only item duplicated in Implementation Decisions: ${item}`);
    }
  }

  let plan = null;
  if (planFilePath) {
    const planFullPath = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
    const planContent = safeReadFile(planFullPath);
    if (!planContent) { output({ error: 'Plan file not found', path: planFilePath }, raw); return; }
    errors.push(...findUncheckedCarryForward(unresolvedAmbiguities, planContent, 'Unresolved ambiguity'));
    errors.push(...findUncheckedCarryForward(interpretedAssumptions, planContent, 'Interpreted assumption'));
    plan = { path: planFilePath, checked: true };
  }

  output({
    valid: errors.length === 0,
    context: {
      path: contextFilePath,
      unresolved_ambiguities: unresolvedAmbiguities,
      interpreted_assumptions: interpretedAssumptions,
      implementation_decisions: implementationDecisions,
    },
    domain_contract: domainContract,
    plan,
    errors,
    warnings,
  }, raw, errors.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyResearchContract(cwd, contextFilePath, researchFilePath, raw) {
  if (!contextFilePath) { error('context file path required'); }
  if (!researchFilePath) { error('research file path required'); }

  const contextFullPath = path.isAbsolute(contextFilePath) ? contextFilePath : path.join(cwd, contextFilePath);
  const researchFullPath = path.isAbsolute(researchFilePath) ? researchFilePath : path.join(cwd, researchFilePath);
  const contextContent = safeReadFile(contextFullPath);
  const researchContent = safeReadFile(researchFullPath);
  if (!contextContent) { output({ error: 'Context file not found', path: contextFilePath }, raw); return; }
  if (!researchContent) { output({ error: 'Research file not found', path: researchFilePath }, raw); return; }

  const unresolvedAmbiguities = extractHeadingBullets(contextContent, 'Unresolved Ambiguities');
  const interpretedAssumptions = extractHeadingBullets(contextContent, 'Interpreted Assumptions');
  const domainContract = buildDomainContract(contextContent, researchContent);
  const errors = [];
  const warnings = [];

  errors.push(...findUncheckedCarryForward(
    unresolvedAmbiguities,
    researchContent,
    'Unresolved ambiguity'
  ));
  errors.push(...findUncheckedCarryForward(
    interpretedAssumptions,
    researchContent,
    'Interpreted assumption'
  ));

  if (!/open question|unresolved|assumption|investigate|unknown/i.test(researchContent)) {
    warnings.push('RESEARCH.md does not visibly carry forward open-question / assumption language.');
  }
  if (domainContract.non_empty_categories.length === 0 && (unresolvedAmbiguities.length > 0 || interpretedAssumptions.length > 0)) {
    warnings.push('RESEARCH.md carries context ambiguity forward, but does not materialize any domain contract sections such as Invariants, Policy Rules, Test Oracles, or Executable Checks.');
  }

  const result = {
    valid: errors.length === 0,
    context: {
      path: contextFilePath,
      unresolved_ambiguities: unresolvedAmbiguities,
      interpreted_assumptions: interpretedAssumptions,
    },
    research: {
      path: researchFilePath,
      checked: true,
    },
    domain_contract: domainContract,
    errors,
    warnings,
  };

  if (raw) {
    process.stdout.write(JSON.stringify(result));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }

  // If there are errors, log a clear message to stderr and exit with failure
  if (errors.length > 0) {
    console.error('Research Contract Violation');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

function cmdValidateConsistency(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const errors = [];
  const warnings = [];

  // Check for ROADMAP
  if (!fs.existsSync(roadmapPath)) {
    errors.push('ROADMAP.md not found');
    output({ passed: false, errors, warnings }, raw, 'failed');
    return;
  }

  const roadmapContentRaw = fs.readFileSync(roadmapPath, 'utf-8');
  const roadmapContent = stripShippedMilestones(roadmapContentRaw);

  // Extract phases from ROADMAP (archived milestones already stripped)
  const roadmapPhases = new Set();
  const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
  let m;
  while ((m = phasePattern.exec(roadmapContent)) !== null) {
    roadmapPhases.add(m[1]);
  }

  // Get phases on disk
  const diskPhases = new Set();
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
      if (dm) diskPhases.add(dm[1]);
    }
  } catch {}

  // Check: phases in ROADMAP but not on disk
  for (const p of roadmapPhases) {
    if (!diskPhases.has(p) && !diskPhases.has(normalizePhaseName(p))) {
      warnings.push(`Phase ${p} in ROADMAP.md but no directory on disk`);
    }
  }

  // Check: phases on disk but not in ROADMAP
  for (const p of diskPhases) {
    const unpadded = String(parseInt(p, 10));
    if (!roadmapPhases.has(p) && !roadmapPhases.has(unpadded)) {
      warnings.push(`Phase ${p} exists on disk but not in ROADMAP.md`);
    }
  }

  // Check: sequential phase numbers (integers only)
  const integerPhases = [...diskPhases]
    .filter(p => !p.includes('.'))
    .map(p => parseInt(p, 10))
    .sort((a, b) => a - b);

  for (let i = 1; i < integerPhases.length; i++) {
    if (integerPhases[i] !== integerPhases[i - 1] + 1) {
      warnings.push(`Gap in phase numbering: ${integerPhases[i - 1]} → ${integerPhases[i]}`);
    }
  }

  // Check: plan numbering within phases
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md')).sort();

      // Extract plan numbers
      const planNums = plans.map(p => {
        const pm = p.match(/-(\d{2})-PLAN\.md$/);
        return pm ? parseInt(pm[1], 10) : null;
      }).filter(n => n !== null);

      for (let i = 1; i < planNums.length; i++) {
        if (planNums[i] !== planNums[i - 1] + 1) {
          warnings.push(`Gap in plan numbering in ${dir}: plan ${planNums[i - 1]} → ${planNums[i]}`);
        }
      }

      // Check: plans without summaries (completed plans)
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md'));
      const planIds = new Set(plans.map(p => p.replace('-PLAN.md', '')));
      const summaryIds = new Set(summaries.map(s => s.replace('-SUMMARY.md', '')));

      // Summary without matching plan is suspicious
      for (const sid of summaryIds) {
        if (!planIds.has(sid)) {
          warnings.push(`Summary ${sid}-SUMMARY.md in ${dir} has no matching PLAN.md`);
        }
      }
    }
  } catch {}

  // Check: frontmatter in plans has required fields
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const dir of dirs) {
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md'));

      for (const plan of plans) {
        const content = fs.readFileSync(path.join(phasesDir, dir, plan), 'utf-8');
        const fm = extractFrontmatter(content);

        if (!fm.wave) {
          warnings.push(`${dir}/${plan}: missing 'wave' in frontmatter`);
        }
      }
    }
  } catch {}

  const passed = errors.length === 0;
  output({ passed, errors, warnings, warning_count: warnings.length }, raw, passed ? 'passed' : 'failed');
}

function normalizeHealthPhaseId(token) {
  if (!token) return null;
  return token.split('.').map(segment => {
    const parsed = Number.parseInt(segment, 10);
    return Number.isNaN(parsed) ? segment : String(parsed);
  }).join('.');
}

function readHealthStateMarkers(stateContent) {
  const markers = {
    nyquistBypass: new Map(),
    uiSpecBypass: new Map(),
    adversarialBypass: new Map(),
  };
  if (!stateContent) return markers;

  for (const line of stateContent.split('\n')) {
    const match = line.match(/^\s*-\s+\[Phase\s+([^\]]+)\]:\s+(.+?)\s*(?:—\s*(.+))?$/i);
    if (!match) continue;
    const phase = normalizeHealthPhaseId(match[1].trim());
    const summary = match[2].trim();
    const rationale = (match[3] || '').trim();
    const target = summary.startsWith('Nyquist bypass accepted')
      ? markers.nyquistBypass
      : summary.startsWith('UI-SPEC bypass accepted')
        ? markers.uiSpecBypass
        : summary.startsWith('Adversarial harness bypassed')
          ? markers.adversarialBypass
          : null;
    if (!target || !phase) continue;
    if (!target.has(phase)) target.set(phase, []);
    target.get(phase).push({ summary, rationale });
  }

  return markers;
}

function cmdValidateHealth(cwd, options, raw) {
  // Guard: detect if CWD is the home directory (likely accidental)
  const resolved = path.resolve(cwd);
  if (resolved === os.homedir()) {
    output({
      status: 'error',
      errors: [{ code: 'E010', message: `CWD is home directory (${resolved}) — health check would read the wrong .planning/ directory. Run from your project root instead.`, fix: 'cd into your project directory and retry' }],
      warnings: [],
      info: [{ code: 'I010', message: `Resolved CWD: ${resolved}` }],
      repairable_count: 0,
    }, raw);
    return;
  }

  const planningDir = path.join(cwd, '.planning');
  const projectPath = path.join(planningDir, 'PROJECT.md');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const statePath = path.join(planningDir, 'STATE.md');
  const configPath = path.join(planningDir, 'config.json');
  const phasesDir = path.join(planningDir, 'phases');

  const errors = [];
  const warnings = [];
  const info = [];
  const repairs = [];

  // Helper to add issue
  const addIssue = (severity, code, message, fix, repairable = false) => {
    const issue = { code, message, fix, repairable };
    if (severity === 'error') errors.push(issue);
    else if (severity === 'warning') warnings.push(issue);
    else info.push(issue);
  };

  // ─── Check 1: .planning/ exists ───────────────────────────────────────────
  if (!fs.existsSync(planningDir)) {
    addIssue('error', 'E001', '.planning/ directory not found', 'Run /gsd:new-project to initialize');
    output({
      status: 'broken',
      errors,
      warnings,
      info,
      repairable_count: 0,
    }, raw);
    return;
  }

  // ─── Check 2: PROJECT.md exists and has required sections ─────────────────
  if (!fs.existsSync(projectPath)) {
    addIssue('error', 'E002', 'PROJECT.md not found', 'Run /gsd:new-project to create');
  } else {
    const content = fs.readFileSync(projectPath, 'utf-8');
    const requiredSections = ['## What This Is', '## Core Value', '## Requirements'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        addIssue('warning', 'W001', `PROJECT.md missing section: ${section}`, 'Add section manually');
      }
    }
  }

  // ─── Check 3: ROADMAP.md exists ───────────────────────────────────────────
  if (!fs.existsSync(roadmapPath)) {
    addIssue('error', 'E003', 'ROADMAP.md not found', 'Run /gsd:new-milestone to create roadmap');
  }

  // ─── Check 4: STATE.md exists and references valid phases ─────────────────
  let healthStateMarkers = { nyquistBypass: new Map(), uiSpecBypass: new Map(), adversarialBypass: new Map() };
  if (!fs.existsSync(statePath)) {
    addIssue('error', 'E004', 'STATE.md not found', 'Run /gsd:health --repair to regenerate', true);
    repairs.push('regenerateState');
  } else {
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    healthStateMarkers = readHealthStateMarkers(stateContent);
    // Extract phase references from STATE.md
    const phaseRefs = [...stateContent.matchAll(/[Pp]hase\s+(\d+(?:\.\d+)*)/g)].map(m => m[1]);
    // Get disk phases
    const diskPhases = new Set();
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const m = e.name.match(/^(\d+(?:\.\d+)*)/);
          if (m) diskPhases.add(m[1]);
        }
      }
    } catch {}
    // Check for invalid references
    for (const ref of phaseRefs) {
      const normalizedRef = String(parseInt(ref, 10)).padStart(2, '0');
      if (!diskPhases.has(ref) && !diskPhases.has(normalizedRef) && !diskPhases.has(String(parseInt(ref, 10)))) {
        // Only warn if phases dir has any content (not just an empty project)
        if (diskPhases.size > 0) {
          addIssue('warning', 'W002', `STATE.md references phase ${ref}, but only phases ${[...diskPhases].sort().join(', ')} exist`, 'Run /gsd:health --repair to regenerate STATE.md', true);
          if (!repairs.includes('regenerateState')) repairs.push('regenerateState');
        }
      }
    }
  }

  // ─── Check 5: config.json valid JSON + valid schema ───────────────────────
  if (!fs.existsSync(configPath)) {
    addIssue('warning', 'W003', 'config.json not found', 'Run /gsd:health --repair to create with defaults', true);
    repairs.push('createConfig');
  } else {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Validate known fields
      const validProfiles = ['quality', 'balanced', 'budget', 'inherit'];
      if (parsed.model_profile && !validProfiles.includes(parsed.model_profile)) {
        addIssue('warning', 'W004', `config.json: invalid model_profile "${parsed.model_profile}"`, `Valid values: ${validProfiles.join(', ')}`);
      }
    } catch (err) {
      addIssue('error', 'E005', `config.json: JSON parse error - ${err.message}`, 'Run /gsd:health --repair to reset to defaults', true);
      repairs.push('resetConfig');
    }
  }

  // ─── Check 5b: Nyquist validation key presence ──────────────────────────
  if (fs.existsSync(configPath)) {
    try {
      const configRaw = fs.readFileSync(configPath, 'utf-8');
      const configParsed = JSON.parse(configRaw);
      if (configParsed.workflow && configParsed.workflow.nyquist_validation === undefined) {
        addIssue('warning', 'W008', 'config.json: workflow.nyquist_validation absent (defaults to enabled but agents may skip)', 'Run /gsd:health --repair to add key', true);
        if (!repairs.includes('addNyquistKey')) repairs.push('addNyquistKey');
      }
    } catch {}
  }

  // ─── Check 6: Phase directory naming (NN-name format) ─────────────────────
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.match(/^\d{2}(?:\.\d+)*-[\w-]+$/)) {
        addIssue('warning', 'W005', `Phase directory "${e.name}" doesn't follow NN-name format`, 'Rename to match pattern (e.g., 01-setup)');
      }
    }
  } catch {}

  // ─── Check 7: Orphaned plans (PLAN without SUMMARY) ───────────────────────
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const phaseFiles = fs.readdirSync(path.join(phasesDir, e.name));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const summaryBases = new Set(summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')));

      for (const plan of plans) {
        const planBase = plan.replace('-PLAN.md', '').replace('PLAN.md', '');
        if (!summaryBases.has(planBase)) {
          addIssue('info', 'I001', `${e.name}/${plan} has no SUMMARY.md`, 'May be in progress');
        }
      }
    }
  } catch {}

  // ─── Check 7b: Nyquist VALIDATION.md consistency ────────────────────────
  try {
    const phaseEntries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const e of phaseEntries) {
      if (!e.isDirectory()) continue;
      const phaseFiles = fs.readdirSync(path.join(phasesDir, e.name));
      const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md'));
      const hasValidation = phaseFiles.some(f => f.endsWith('-VALIDATION.md'));
      if (hasResearch && !hasValidation) {
        const researchFile = phaseFiles.find(f => f.endsWith('-RESEARCH.md'));
        const researchContent = fs.readFileSync(path.join(phasesDir, e.name, researchFile), 'utf-8');
        if (researchContent.includes('## Validation Architecture')) {
          const phaseMatch = e.name.match(/^(\d+(?:\.\d+)*)/);
          const phaseId = normalizeHealthPhaseId(phaseMatch ? phaseMatch[1] : e.name);
          const bypasses = healthStateMarkers.nyquistBypass.get(phaseId) || [];
          if (bypasses.length > 0) {
            const reason = bypasses[bypasses.length - 1].rationale || 'reason=unspecified';
            addIssue('info', 'I002', `Phase ${e.name}: Nyquist bypass recorded in STATE.md (${reason})`, 'No action required unless the bypass was accidental');
          } else {
            addIssue('warning', 'W009', `Phase ${e.name}: has Validation Architecture in RESEARCH.md but no VALIDATION.md`, 'Re-run /gsd:plan-phase with --research to regenerate');
          }
        }
      }
    }
  } catch {}

  // ─── Check 7c: Accepted degraded-mode bypasses ───────────────────────────
  for (const [phase, entries] of healthStateMarkers.uiSpecBypass.entries()) {
    const reason = entries[entries.length - 1]?.rationale || 'reason=unspecified';
    addIssue('info', 'I003', `Phase ${phase}: UI-SPEC bypass recorded in STATE.md (${reason})`, 'No action required unless the bypass was accidental');
  }
  for (const [phase, entries] of healthStateMarkers.adversarialBypass.entries()) {
    const reason = entries[entries.length - 1]?.rationale || 'scope=unspecified';
    addIssue('info', 'I004', `Phase ${phase}: adversarial harness bypass recorded in STATE.md (${reason})`, 'Re-enable workflow.adversarial_test_harness when you want contract gates enforced');
  }

  // ─── Check 8: Run existing consistency checks ─────────────────────────────
  // Inline subset of cmdValidateConsistency
  if (fs.existsSync(roadmapPath)) {
    const roadmapContentRaw = fs.readFileSync(roadmapPath, 'utf-8');
    const roadmapContent = stripShippedMilestones(roadmapContentRaw);
    const roadmapPhases = new Set();
    const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
    let m;
    while ((m = phasePattern.exec(roadmapContent)) !== null) {
      roadmapPhases.add(m[1]);
    }

    const diskPhases = new Set();
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const dm = e.name.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
          if (dm) diskPhases.add(dm[1]);
        }
      }
    } catch {}

    // Phases in ROADMAP but not on disk
    for (const p of roadmapPhases) {
      const padded = String(parseInt(p, 10)).padStart(2, '0');
      if (!diskPhases.has(p) && !diskPhases.has(padded)) {
        addIssue('warning', 'W006', `Phase ${p} in ROADMAP.md but no directory on disk`, 'Create phase directory or remove from roadmap');
      }
    }

    // Phases on disk but not in ROADMAP
    for (const p of diskPhases) {
      const unpadded = String(parseInt(p, 10));
      if (!roadmapPhases.has(p) && !roadmapPhases.has(unpadded)) {
        addIssue('warning', 'W007', `Phase ${p} exists on disk but not in ROADMAP.md`, 'Add to roadmap or remove directory');
      }
    }
  }

  // ─── Perform repairs if requested ─────────────────────────────────────────
  const repairActions = [];
  if (options.repair && repairs.length > 0) {
    for (const repair of repairs) {
      try {
        switch (repair) {
          case 'createConfig':
          case 'resetConfig': {
            const defaults = {
              model_profile: 'balanced',
              commit_docs: true,
              search_gitignored: false,
              branching_strategy: 'none',
              phase_branch_template: 'gsd/phase-{phase}-{slug}',
              milestone_branch_template: 'gsd/{milestone}-{slug}',
              workflow: {
                research: true,
                plan_check: true,
                verifier: true,
                nyquist_validation: true,
                adversarial_test_harness: true,
                ui_phase: true,
                ui_safety_gate: true,
              },
              parallelization: true,
              brave_search: false,
            };
            fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'config.json' });
            break;
          }
          case 'regenerateState': {
            // Create timestamped backup before overwriting
            if (fs.existsSync(statePath)) {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              const backupPath = `${statePath}.bak-${timestamp}`;
              fs.copyFileSync(statePath, backupPath);
              repairActions.push({ action: 'backupState', success: true, path: backupPath });
            }
            // Generate minimal STATE.md from ROADMAP.md structure
            const milestone = getMilestoneInfo(cwd);
            let stateContent = `# Session State\n\n`;
            stateContent += `## Project Reference\n\n`;
            stateContent += `See: .planning/PROJECT.md\n\n`;
            stateContent += `## Position\n\n`;
            stateContent += `**Milestone:** ${milestone.version} ${milestone.name}\n`;
            stateContent += `**Current phase:** (determining...)\n`;
            stateContent += `**Status:** Resuming\n\n`;
            stateContent += `## Session Log\n\n`;
            stateContent += `- ${new Date().toISOString().split('T')[0]}: STATE.md regenerated by /gsd:health --repair\n`;
            writeStateMd(statePath, stateContent, cwd);
            repairActions.push({ action: repair, success: true, path: 'STATE.md' });
            break;
          }
          case 'addNyquistKey': {
            if (fs.existsSync(configPath)) {
              try {
                const configRaw = fs.readFileSync(configPath, 'utf-8');
                const configParsed = JSON.parse(configRaw);
                if (!configParsed.workflow) configParsed.workflow = {};
                if (configParsed.workflow.nyquist_validation === undefined) {
                  configParsed.workflow.nyquist_validation = true;
                }
                if (configParsed.workflow.adversarial_test_harness === undefined) {
                  configParsed.workflow.adversarial_test_harness = true;
                }
                if (configParsed.workflow.ui_phase === undefined) {
                  configParsed.workflow.ui_phase = true;
                }
                if (configParsed.workflow.ui_safety_gate === undefined) {
                  configParsed.workflow.ui_safety_gate = true;
                }
                fs.writeFileSync(configPath, JSON.stringify(configParsed, null, 2), 'utf-8');
                repairActions.push({ action: repair, success: true, path: 'config.json' });
              } catch (err) {
                repairActions.push({ action: repair, success: false, error: err.message });
              }
            }
            break;
          }
        }
      } catch (err) {
        repairActions.push({ action: repair, success: false, error: err.message });
      }
    }
  }

  // ─── Determine overall status ─────────────────────────────────────────────
  let status;
  if (errors.length > 0) {
    status = 'broken';
  } else if (warnings.length > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const repairableCount = errors.filter(e => e.repairable).length +
                         warnings.filter(w => w.repairable).length;

  output({
    status,
    errors,
    warnings,
    info,
    repairable_count: repairableCount,
    repairs_performed: repairActions.length > 0 ? repairActions : undefined,
  }, raw);
}

function pushWorkflowGate(gates, gate) {
  gates.push(gate);
}

function buildWorkflowReadinessSummary(status, gates) {
  const blocks = gates.filter(g => g.state === 'block').length;
  const warnings = gates.filter(g => g.state === 'warn').length;
  const acknowledged = gates.filter(g => g.state === 'acknowledged').length;
  if (status === 'blocked') return `Blocked: ${blocks} blocking gate(s), ${warnings} degraded gate(s), ${acknowledged} acknowledged bypass(es)`;
  if (status === 'degraded') return `Degraded: ${warnings} gate(s) need an explicit decision, ${acknowledged} already acknowledged`;
  if (acknowledged > 0) return `Ready with ${acknowledged} acknowledged bypass(es) already recorded`;
  return 'Ready';
}

function getWorkflowPhaseMarkers(markers, phaseNumber) {
  const exact = String(phaseNumber);
  const normalized = String(Number.parseInt(String(phaseNumber).split('.')[0], 10));
  return {
    ui: markers.uiSpecBypass.get(exact) || markers.uiSpecBypass.get(normalized) || [],
    nyquist: markers.nyquistBypass.get(exact) || markers.nyquistBypass.get(normalized) || [],
    adversarial: markers.adversarialBypass.get(exact) || markers.adversarialBypass.get(normalized) || [],
  };
}

function cmdVerifyWorkflowReadiness(cwd, workflow, options = {}, raw) {
  if (!workflow) error('workflow required');
  if (!['plan-phase', 'execute-phase'].includes(workflow)) {
    error('Unsupported workflow for workflow-readiness. Available: plan-phase, execute-phase');
  }
  if (!options.phase) error('phase required for workflow-readiness');

  const config = loadConfig(cwd);
  const phaseInfo = findPhaseInternal(cwd, options.phase);
  const gates = [];

  if (!phaseInfo) {
    pushWorkflowGate(gates, {
      code: 'R001',
      state: 'block',
      severity: 'error',
      title: 'Phase Not Found',
      message: `Phase ${options.phase} could not be resolved on disk or in the active roadmap context.`,
      resolutions: [
        { label: 'Check progress', command: '/gsd:progress' },
        { label: 'Inspect roadmap', command: '/gsd:stats' },
      ],
    });
    const result = { workflow, phase: options.phase, status: 'blocked', gates, summary: buildWorkflowReadinessSummary('blocked', gates) };
    output(result, raw, 'blocked');
    return;
  }

  const phaseDir = path.join(cwd, phaseInfo.directory);
  let phaseFiles = [];
  try { phaseFiles = fs.readdirSync(phaseDir); } catch {}
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const stateExists = fs.existsSync(statePath);
  const planningExists = fs.existsSync(path.join(cwd, '.planning'));
  const stateContent = safeReadFile(statePath) || '';
  const markers = getWorkflowPhaseMarkers(readHealthStateMarkers(stateContent), phaseInfo.phase_number);
  const clarificationBlocked = /Clarification Status:\s*blocked/i.test(stateContent) || /\*\*Clarification Status:\*\*\s*blocked/i.test(stateContent);

  if (clarificationBlocked) {
    pushWorkflowGate(gates, {
      code: 'R002',
      state: 'block',
      severity: 'error',
      title: 'Clarification Blocked',
      message: workflow === 'execute-phase'
        ? `Clarification status is blocked for Phase ${phaseInfo.phase_number}. Execution should not proceed until ambiguity is resolved.`
        : `Clarification status is blocked for Phase ${phaseInfo.phase_number}. Planning should not proceed until ambiguity is resolved.`,
      resolutions: [
        { label: 'Resolve with discuss-phase', command: `/gsd:discuss-phase ${phaseInfo.phase_number}` },
      ],
    });
  }

  if (workflow === 'execute-phase') {
    const planFiles = phaseFiles.filter(f => f.endsWith('-PLAN.md')).sort();
    const summaryBases = new Set(
      phaseFiles
        .filter(f => f.endsWith('-SUMMARY.md'))
        .map(f => f.replace('-SUMMARY.md', ''))
    );
    const planBases = planFiles.map(f => f.replace('-PLAN.md', ''));
    const plansWithSummary = planBases.filter(base => summaryBases.has(base));
    const plansWithoutSummary = planBases.filter(base => !summaryBases.has(base));

    if (planFiles.length === 0) {
      pushWorkflowGate(gates, {
        code: 'R007',
        state: 'block',
        severity: 'error',
        title: 'No Plans Found',
        message: `Phase ${phaseInfo.phase_number} has no plan artifacts to execute.`,
        resolutions: [
          { label: 'Plan the phase first', command: `/gsd:plan-phase ${phaseInfo.phase_number}` },
          { label: 'Inspect progress', command: '/gsd:progress' },
        ],
      });
    }

    if (planningExists && !stateExists) {
      pushWorkflowGate(gates, {
        code: 'R008',
        state: 'warn',
        severity: 'warning',
        title: 'STATE.md Missing',
        message: 'The planning workspace exists but STATE.md is missing, so resume context and phase tracking may be incomplete.',
        resolutions: [
          { label: 'Repair planning state', command: '/gsd:health --repair' },
          { label: 'Continue from disk artifacts', command: `/gsd:execute-phase ${phaseInfo.phase_number}` },
        ],
      });
    }

    if (plansWithSummary.length > 0 && plansWithoutSummary.length > 0) {
      pushWorkflowGate(gates, {
        code: 'R009',
        state: 'acknowledged',
        severity: 'info',
        title: 'Resuming Incomplete Execution',
        message: `Phase ${phaseInfo.phase_number} already has ${plansWithSummary.length} completed plan(s); this run will skip them and resume the ${plansWithoutSummary.length} incomplete plan(s).`,
        resolutions: [
          { label: 'Continue execution', command: `/gsd:execute-phase ${phaseInfo.phase_number}` },
        ],
      });
    }

    const status = gates.some(g => g.state === 'block') ? 'blocked' : gates.some(g => g.state === 'warn') ? 'degraded' : 'ready';
    const result = {
      workflow,
      phase: phaseInfo.phase_number,
      status,
      gates,
      summary: buildWorkflowReadinessSummary(status, gates),
    };
    output(result, raw, status);
    return;
  }

  const roadmapPhaseNum = String(Number.parseInt(String(phaseInfo.phase_number).split('.')[0], 10));
  const roadmapSection = getRoadmapPhaseInternal(cwd, roadmapPhaseNum)?.section || '';
  const hasUiIndicators = /UI|interface|frontend|component|layout|page|screen|view|form|dashboard|widget/i.test(roadmapSection);
  const hasUiSpec = phaseFiles.some(f => f.endsWith('-UI-SPEC.md'));
  const hasContextArtifact = phaseInfo.has_context || phaseFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
  if (config.ui_safety_gate && hasUiIndicators && !hasUiSpec) {
    if (markers.ui.length > 0) {
      const reason = markers.ui[markers.ui.length - 1].rationale || 'reason=unspecified';
      pushWorkflowGate(gates, {
        code: 'R003',
        state: 'acknowledged',
        severity: 'info',
        title: 'UI Gate Bypassed',
        message: `Frontend indicators were detected without UI-SPEC.md, but an explicit bypass is already recorded (${reason}).`,
        resolutions: [
          { label: 'Generate UI-SPEC later', command: `/gsd:ui-phase ${phaseInfo.phase_number}` },
        ],
      });
    } else {
      pushWorkflowGate(gates, {
        code: 'R003',
        state: 'warn',
        severity: 'warning',
        title: 'Missing UI-SPEC',
        message: `Frontend indicators were detected for Phase ${phaseInfo.phase_number}, but no UI-SPEC.md is present.`,
        resolutions: [
          { label: 'Generate UI-SPEC first', command: `/gsd:ui-phase ${phaseInfo.phase_number}` },
          { label: 'Continue without UI-SPEC', record_decision: { summary: 'UI-SPEC bypass accepted', rationale: 'reason=continue-without-ui-spec' } },
          { label: 'Mark as non-frontend', record_decision: { summary: 'UI-SPEC bypass accepted', rationale: 'reason=frontend-indicator-dismissed' } },
        ],
      });
    }
  }

  const explicitSkipResearch = !!options.skip_research;
  const explicitResearch = !!options.research;
  const noResearchPath = config.nyquist_validation && (explicitSkipResearch || (!config.research && !phaseInfo.has_research && !explicitResearch));
  const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md'));
  const hasValidation = phaseFiles.some(f => f.endsWith('-VALIDATION.md'));
  const researchFile = phaseFiles.find(f => f.endsWith('-RESEARCH.md'));
  const researchContent = researchFile ? fs.readFileSync(path.join(phaseDir, researchFile), 'utf-8') : '';
  const hasValidationArchitecture = researchContent.includes('## Validation Architecture');
  if (config.nyquist_validation) {
    if (noResearchPath) {
      if (markers.nyquist.length > 0) {
        const reason = markers.nyquist[markers.nyquist.length - 1].rationale || 'reason=unspecified';
        pushWorkflowGate(gates, {
          code: 'R004',
          state: 'acknowledged',
          severity: 'info',
          title: 'Nyquist Bypassed',
          message: `Nyquist is not applicable for this no-research path, and an explicit bypass is already recorded (${reason}).`,
          resolutions: [
            { label: 'Run with research later', command: `/gsd:plan-phase ${phaseInfo.phase_number} --research` },
          ],
        });
      } else {
        pushWorkflowGate(gates, {
          code: 'R004',
          state: 'warn',
          severity: 'warning',
          title: 'Nyquist Not Available In No-Research Path',
          message: 'Nyquist validation is enabled, but this run is on a no-research path so VALIDATION.md cannot be generated automatically.',
          resolutions: [
            { label: 'Run with research', command: `/gsd:plan-phase ${phaseInfo.phase_number} --research` },
            { label: 'Disable Nyquist', command: 'node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" config-set workflow.nyquist_validation false' },
            { label: 'Continue without Nyquist', record_decision: { summary: 'Nyquist bypass accepted', rationale: 'reason=no-research-path' } },
          ],
        });
      }
    } else if (hasResearch && hasValidationArchitecture && !hasValidation) {
      if (markers.nyquist.length > 0) {
        const reason = markers.nyquist[markers.nyquist.length - 1].rationale || 'reason=unspecified';
        pushWorkflowGate(gates, {
          code: 'R005',
          state: 'acknowledged',
          severity: 'info',
          title: 'Missing VALIDATION Acknowledged',
          message: `RESEARCH.md contains Validation Architecture but VALIDATION.md is missing; an explicit bypass is already recorded (${reason}).`,
          resolutions: [
            { label: 'Regenerate with research', command: `/gsd:plan-phase ${phaseInfo.phase_number} --research` },
          ],
        });
      } else {
        pushWorkflowGate(gates, {
          code: 'R005',
          state: 'warn',
          severity: 'warning',
          title: 'Missing VALIDATION Artifact',
          message: `RESEARCH.md contains Validation Architecture for Phase ${phaseInfo.phase_number}, but no VALIDATION.md exists.`,
          resolutions: [
            { label: 'Regenerate with research', command: `/gsd:plan-phase ${phaseInfo.phase_number} --research` },
            { label: 'Disable Nyquist', command: 'node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" config-set workflow.nyquist_validation false' },
            { label: 'Continue anyway', record_decision: { summary: 'Nyquist bypass accepted', rationale: 'reason=missing-validation-artifact' } },
          ],
        });
      }
    }
  }

  if (hasContextArtifact && !config.adversarial_test_harness) {
    if (markers.adversarial.length > 0) {
      const reason = markers.adversarial[markers.adversarial.length - 1].rationale || 'scope=unspecified';
      pushWorkflowGate(gates, {
        code: 'R006',
        state: 'acknowledged',
        severity: 'info',
        title: 'Adversarial Harness Bypassed',
        message: `Context exists for Phase ${phaseInfo.phase_number}, but the adversarial harness is disabled and the bypass is already recorded (${reason}).`,
        resolutions: [
          { label: 'Re-enable harness', command: 'node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" config-set workflow.adversarial_test_harness true' },
        ],
      });
    } else {
      pushWorkflowGate(gates, {
        code: 'R006',
        state: 'warn',
        severity: 'warning',
        title: 'Adversarial Harness Disabled',
        message: `CONTEXT.md exists for Phase ${phaseInfo.phase_number}, but workflow.adversarial_test_harness is disabled so contract gates will not run automatically.`,
        resolutions: [
          { label: 'Re-enable harness', command: 'node "$HOME/.claude/get-stuff-done/bin/gsd-tools.cjs" config-set workflow.adversarial_test_harness true' },
          { label: 'Continue with bypass recorded', record_decision: { summary: 'Adversarial harness bypassed', rationale: 'scope=plan-phase-readiness' } },
        ],
      });
    }
  }

  const status = gates.some(g => g.state === 'block') ? 'blocked' : gates.some(g => g.state === 'warn') ? 'degraded' : 'ready';
  const result = {
    workflow,
    phase: phaseInfo.phase_number,
    status,
    gates,
    summary: buildWorkflowReadinessSummary(status, gates),
  };
  output(result, raw, status);
}

function cmdVerifyRequirementCoverage(cwd, phase, raw) {
  if (!phase) { error('phase required'); }
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const reqContent = safeReadFile(reqPath);
  if (!reqContent) {
    output({ error: 'REQUIREMENTS.md not found — cannot verify coverage', valid: false }, raw, 'invalid');
    return;
  }

  // Extract phase number as integer for matching (e.g. "01" → 1, "17" → 17)
  const phaseNum = parseInt(phaseInfo.phase_number, 10);

  // Parse traceability table: | REQ-ID | Phase N | Status |
  const traceRows = reqContent.match(/\|\s*([A-Z]+-\d+)\s*\|\s*Phase\s*(\d+)\s*\|/g) || [];
  const phaseRequirements = [];
  for (const row of traceRows) {
    const m = row.match(/\|\s*([A-Z]+-\d+)\s*\|\s*Phase\s*(\d+)\s*\|/);
    if (m && parseInt(m[2], 10) === phaseNum) {
      phaseRequirements.push(m[1]);
    }
  }

  // Collect requirement IDs claimed by all plans in this phase
  const phaseDir = path.join(cwd, phaseInfo.directory);
  const planFiles = fs.readdirSync(phaseDir).filter(f => f.endsWith('-PLAN.md'));
  const coveredIds = new Set();
  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
    const fm = extractFrontmatter(content);
    const reqs = Array.isArray(fm.requirements) ? fm.requirements : [];
    for (const r of reqs) coveredIds.add(String(r).trim());
  }

  // Check for dangling plan references (claimed but not in REQUIREMENTS.md)
  const allReqIds = new Set(reqContent.match(/\b[A-Z]+-\d+\b/g) || []);
  const dangling = [];
  for (const id of coveredIds) {
    if (!allReqIds.has(id)) dangling.push(id);
  }

  // BLOCK-02: requirements scoped to this phase but not covered by any plan
  const uncovered = phaseRequirements.filter(id => !coveredIds.has(id));

  const valid = uncovered.length === 0;
  const errors = [];
  if (uncovered.length > 0) {
    errors.push(`BLOCK-02: ${uncovered.length} requirement(s) scoped to Phase ${phaseNum} have no plan coverage: ${uncovered.join(', ')}`);
  }
  const warnings = dangling.length > 0
    ? [`Plans reference requirement IDs not found in REQUIREMENTS.md: ${dangling.join(', ')}`]
    : [];

  output({
    valid,
    phase: phaseInfo.phase_number,
    phase_requirements: phaseRequirements,
    covered: [...coveredIds],
    uncovered,
    dangling_references: dangling,
    plan_count: planFiles.length,
    errors,
    warnings,
  }, raw, valid ? 'valid' : 'invalid');
}

function cmdVerifyCrossPlanDataContracts(cwd, phase, raw) {
  if (!phase) { error('phase required'); }
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const phaseDir = path.join(cwd, phaseInfo.directory);
  const planFiles = fs.readdirSync(phaseDir).filter(f => f.endsWith('-PLAN.md'));
  const plans = [];

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
    const fm = extractFrontmatter(content);
    
    // Extract input files from action and verify elements
    const inputFiles = new Set();
    const actionVerifyMatches = content.match(/<(?:action|verify)>([\s\S]*?)<\/(?:action|verify)>/g) || [];
    for (const block of actionVerifyMatches) {
      // Find backtick paths or @-refs
      const paths = block.match(/`([^`\s]+\.[a-zA-Z]+)`|@([^\s\n,)]+\/[^\s\n,)]+)/g) || [];
      for (const p of paths) {
        const clean = p.startsWith('@') ? p.slice(1) : p.slice(1, -1);
        if (clean.includes('.') || clean.includes('/')) inputFiles.add(clean);
      }
    }

    plans.push({
      id: file.replace(/-PLAN\.md$/i, ''),
      wave: parseInt(fm.wave) || 1,
      files_modified: Array.isArray(fm.files_modified) ? fm.files_modified : [],
      files_read: Array.from(inputFiles),
    });
  }

  const issues = [];
  const waves = {};
  for (const plan of plans) {
    if (!waves[plan.wave]) waves[plan.wave] = [];
    waves[plan.wave].push(plan);
  }

  for (const waveNum in waves) {
    const wavePlans = waves[waveNum];
    if (wavePlans.length < 2) continue;

    // Check 1: Multiple plans modifying same file
    const modifiedInWave = {};
    for (const plan of wavePlans) {
      for (const file of plan.files_modified) {
        if (!modifiedInWave[file]) modifiedInWave[file] = [];
        modifiedInWave[file].push(plan.id);
      }
    }

    for (const file in modifiedInWave) {
      if (modifiedInWave[file].length > 1) {
        issues.push({
          type: 'race_condition',
          severity: 'blocker',
          description: `Multiple plans modifying same file in Wave ${waveNum}: ${file}`,
          plans: modifiedInWave[file],
          fix_hint: `Move one of ${modifiedInWave[file].join(', ')} to a later wave`,
        });
      }
    }

    // Check 2: Read/Write race (Plan A writes, Plan B reads in same wave)
    for (const planA of wavePlans) {
      for (const planB of wavePlans) {
        if (planA.id === planB.id) continue;
        const intersection = planA.files_modified.filter(f => planB.files_read.includes(f));
        if (intersection.length > 0) {
          issues.push({
            type: 'data_race',
            severity: 'blocker',
            description: `Data race: Plan ${planA.id} writes files that Plan ${planB.id} reads in Wave ${waveNum}`,
            files: intersection,
            fix_hint: `Move Plan ${planB.id} to a later wave (add Plan ${planA.id} to depends_on)`,
          });
        }
      }
    }
  }

  output({
    valid: issues.length === 0,
    phase: phaseInfo.phase_number,
    plan_count: plans.length,
    issues,
  }, raw, issues.length === 0 ? 'valid' : 'invalid');
}

// ---------------------------------------------------------------------------
// cmdVerifyDeadExports — export-level spot check (post-execution)
// For each must_haves.key_link with a `via` field: verifies the named
// symbol is both defined in `from` (the producer) AND used in `to` (the
// consumer). If defined but not consumed → dead store.
// ---------------------------------------------------------------------------

function cmdVerifyDeadExports(cwd, phase, raw) {
  if (!phase) { error('phase required'); }
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const phaseDir = path.join(cwd, phaseInfo.directory);
  const planFiles = fs.readdirSync(phaseDir).filter(f => f.endsWith('-PLAN.md'));

  const deadStores = [];
  const verified = [];
  const skipped = [];
  let linksChecked = 0;

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
    const fm = extractFrontmatter(content);
    const keyLinks = parseMustHavesBlock(content, 'key_links');

    for (const link of keyLinks) {
      if (typeof link !== 'object' || !link.via || !link.from || !link.to) {
        skipped.push({ file, reason: 'key_link missing via, from, or to' });
        continue;
      }

      const symbol = link.via;
      const fromPath = path.join(cwd, link.from);
      const toPath = path.join(cwd, link.to);
      linksChecked++;

      const fromContent = safeReadFile(fromPath);
      const toContent = safeReadFile(toPath);

      if (!fromContent) {
        skipped.push({ from: link.from, to: link.to, via: symbol, reason: 'from file not found' });
        continue;
      }
      if (!toContent) {
        skipped.push({ from: link.from, to: link.to, via: symbol, reason: 'to file not found' });
        continue;
      }

      const definedInFrom = fromContent.includes(symbol);
      const usedInTo = toContent.includes(symbol);

      if (!definedInFrom) {
        // Symbol not in from — export doesn't exist (separate issue from dead-store)
        skipped.push({ from: link.from, to: link.to, via: symbol, reason: 'symbol not found in producer file (missing export)' });
      } else if (!usedInTo) {
        deadStores.push({
          from: link.from,
          to: link.to,
          via: symbol,
          description: `"${symbol}" is defined in ${link.from} but not used in ${link.to}`,
          fix_hint: `Add import/call for "${symbol}" in ${link.to}, or update the key_link if the wiring changed`,
        });
      } else {
        verified.push({ from: link.from, to: link.to, via: symbol });
      }
    }
  }

  const valid = deadStores.length === 0;
  output({
    valid,
    phase: phaseInfo.phase_number,
    links_checked: linksChecked,
    verified: verified.length,
    dead_stores: deadStores,
    skipped,
  }, raw, valid ? 'valid' : 'invalid');
}

/**
 * BLOCK-07: Orphaned Phase State
 *
 * Detects when execution was interrupted mid-phase: some plans have SUMMARY.md
 * (committed work) while later plans in the same phase do not, meaning the
 * executor stopped without completing the phase.
 *
 * Returns { orphaned, phase, plans_with_summary, plans_without_summary, message }
 */
function cmdVerifyOrphanedState(cwd, phaseArg, raw) {
  if (!phaseArg) {
    error('phase argument required');
  }

  const planningDir = path.join(cwd, '.planning');
  const phasesDir = path.join(planningDir, 'phases');

  // Find the phase directory
  const phaseInfo = findPhaseInternal(cwd, phaseArg);
  if (!phaseInfo || !phaseInfo.found) {
    output({
      orphaned: false,
      phase: phaseArg,
      plans_with_summary: [],
      plans_without_summary: [],
      message: `Phase ${phaseArg} not found — nothing to check`,
    }, raw, 'clean');
    return;
  }

  const phaseDir = path.join(cwd, phaseInfo.directory);

  let phaseFiles;
  try {
    phaseFiles = fs.readdirSync(phaseDir);
  } catch {
    output({
      orphaned: false,
      phase: phaseInfo.phase_number,
      plans_with_summary: [],
      plans_without_summary: [],
      message: `Phase directory ${phaseDir} is not readable`,
    }, raw, 'clean');
    return;
  }

  // Collect all PLAN.md files and SUMMARY.md files
  const plans = phaseFiles
    .filter(f => f.endsWith('-PLAN.md'))
    .map(f => f.replace('-PLAN.md', ''))
    .sort();

  const summaryBases = new Set(
    phaseFiles
      .filter(f => f.endsWith('-SUMMARY.md'))
      .map(f => f.replace('-SUMMARY.md', ''))
  );

  if (plans.length === 0) {
    output({
      orphaned: false,
      phase: phaseInfo.phase_number,
      plans_with_summary: [],
      plans_without_summary: [],
      message: 'No plans found in phase — nothing to check',
    }, raw, 'clean');
    return;
  }

  const plansWithSummary = plans.filter(p => summaryBases.has(p));
  const plansWithoutSummary = plans.filter(p => !summaryBases.has(p));

  // Orphaned only when SOME plans have summaries but LATER ones don't.
  // A fresh phase (no summaries yet) is not orphaned — it just hasn't started.
  const orphaned = plansWithSummary.length > 0 && plansWithoutSummary.length > 0;

  const message = orphaned
    ? `BLOCK-07: Execution stopped mid-phase — ${plansWithSummary.length} plan(s) completed but ${plansWithoutSummary.length} plan(s) have no record. Re-run /gsd:execute-phase ${phaseInfo.phase_number} to resume from where it stopped.`
    : plansWithoutSummary.length === 0
      ? `All ${plans.length} plan(s) have summaries — phase is complete`
      : `Phase has ${plans.length} plan(s) with no summaries yet — fresh start, not orphaned`;

  output({
    orphaned,
    phase: phaseInfo.phase_number,
    plans_with_summary: plansWithSummary,
    plans_without_summary: plansWithoutSummary,
    message,
  }, raw, orphaned ? 'orphaned' : 'clean');
}

/**
 * Detect checkpoint bypass: plan has checkpoint tasks but no CHECKPOINT.md was written.
 *
 * Used by orchestrators after a Pattern A/B subagent completes to catch silent bypasses —
 * an agent that ran past a checkpoint without pausing would produce no CHECKPOINT.md.
 *
 * Returns:
 *   { has_checkpoints, checkpoint_count, checkpoint_types, checkpoint_file_exists,
 *     bypass_suspected, plan_file, phase_dir }
 *
 * bypass_suspected = plan has checkpoints AND no CHECKPOINT.md exists in the phase dir.
 */
function cmdVerifyCheckpointCoverage(cwd, planFile, phase, raw) {
  if (!planFile) error('plan file path required');

  const fullPlanPath = path.isAbsolute(planFile) ? planFile : path.join(cwd, planFile);
  if (!fs.existsSync(fullPlanPath)) {
    error(`Plan file not found: ${fullPlanPath}`);
  }

  const planContent = fs.readFileSync(fullPlanPath, 'utf-8');

  // Extract checkpoint task types from plan XML task blocks
  // Matches: type="checkpoint:human-verify", type="checkpoint:decision", type="checkpoint:human-action"
  const checkpointPattern = /type="(checkpoint:[^"]+)"/g;
  const checkpointTypes = [];
  let match;
  while ((match = checkpointPattern.exec(planContent)) !== null) {
    checkpointTypes.push(match[1]);
  }

  const hasCheckpoints = checkpointTypes.length > 0;

  // Resolve phase dir for CHECKPOINT.md lookup
  let phaseDir = null;
  let checkpointFileExists = false;

  if (phase) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    if (phaseInfo) {
      phaseDir = phaseInfo.directory;
      checkpointFileExists = fs.existsSync(path.join(cwd, phaseDir, 'CHECKPOINT.md'));
    }
  }

  // bypass_suspected: plan declares checkpoints but no CHECKPOINT.md artifact exists
  // This implies the subagent ran past checkpoint tasks without pausing
  const bypassSuspected = hasCheckpoints && phaseDir !== null && !checkpointFileExists;

  output({
    has_checkpoints: hasCheckpoints,
    checkpoint_count: checkpointTypes.length,
    checkpoint_types: checkpointTypes,
    checkpoint_file_exists: checkpointFileExists,
    bypass_suspected: bypassSuspected,
    plan_file: planFile,
    phase_dir: phaseDir,
  }, raw, bypassSuspected ? 'bypass_suspected' : 'ok');
}

/**
 * Execution integrity audit — full coherence check for orchestration state.
 *
 * Checks ten invariants:
 *  1. HEAD matches last task log entry (no OOB commit after last task)
 *  2. No stale pending gate artifacts (unclosed gates left from a prior run)
 *  3. No checkpoint task in plan without CHECKPOINT.md (bypass detection)
 *  4. All task log commit hashes exist in git history (force-push erasure)
 *  5. Last task log entry parses cleanly (interrupted commit-task detection)
 *  6. Task log hashes ↔ SUMMARY ## Task Commits agreement
 *  7. All task log hashes are ancestors of HEAD (history rewrite / cherry-pick / branch divergence)
 *  8. Branch consistency — task log entries recorded on current branch
 *  9. STATE.md current_phase ↔ roadmap active phase
 * 10. Warning severity classification (stop-the-line vs ignorable)
 *
 * Returns:
 *   { coherent, checks: { head_matches_task_log, no_pending_gates,
 *     checkpoint_coverage, task_log_commits_exist, task_log_last_entry_valid,
 *     task_log_summary_agreement, task_log_ancestry, task_log_branch_consistency,
 *     state_roadmap_agreement }, errors, warnings: [{ message, severity }] }
 *
 * Options: { phase?, plan? } — when provided, enables task-log and checkpoint checks.
 */
/**
 * Callable (non-output) version of the integrity audit.
 * Returns the result object directly so other commands can compose it.
 */
function runVerifyIntegrity(cwd, options) {
  const phase = options?.phase || null;
  const plan = options?.plan || null;

  const errors = [];
  const warnings = [];
  const checks = {};

  // ── 1. HEAD matches last task log entry ────────────────────────────────────
  if (phase && plan) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    let taskLogCheck = { pass: true, note: 'no_task_log' };

    if (phaseInfo) {
      const logFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-TASK-LOG.jsonl`);
      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
        if (lines.length > 0) {
          let lastEntry = null;
          try { lastEntry = JSON.parse(lines[lines.length - 1]); } catch {}
          if (lastEntry?.hash) {
            const headResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
            const head = headResult.exitCode === 0 ? headResult.stdout.trim() : null;
            const matches = head === lastEntry.hash;
            taskLogCheck = { pass: matches, head, last_hash: lastEntry.hash, last_task: lastEntry.task };
            if (!matches) {
              errors.push(`HEAD (${head}) does not match last task log entry (${lastEntry.hash} for task ${lastEntry.task}) — out-of-band commit detected`);
            }
          }
        }
      }
    }
    checks.head_matches_task_log = taskLogCheck;
  } else {
    checks.head_matches_task_log = { pass: true, note: 'skipped — no phase/plan provided' };
  }

  // ── 2. No stale pending gate artifacts ────────────────────────────────────
  const gatesDir = path.join(cwd, '.planning', 'gates');
  const pendingKeys = [];
  if (fs.existsSync(gatesDir)) {
    for (const f of fs.readdirSync(gatesDir)) {
      if (f.endsWith('-pending.json')) {
        let key = null;
        try {
          const record = JSON.parse(fs.readFileSync(path.join(gatesDir, f), 'utf-8'));
          key = record.key || f.replace('-pending.json', '').replace(/_/g, '.');
          const blockedAt = record.blocked_at ? new Date(record.blocked_at) : null;
          const ageMs = blockedAt ? Date.now() - blockedAt.getTime() : null;
          // Warn if stale (>1 hour without release)
          if (ageMs !== null && ageMs > 3600000) {
            warnings.push(`Stale pending gate: ${key} (blocked ${Math.round(ageMs / 60000)}min ago)`);
          }
        } catch {}
        pendingKeys.push(key || f);
      }
    }
  }
  const noPendingGates = pendingKeys.length === 0;
  checks.no_pending_gates = { pass: noPendingGates, pending_keys: pendingKeys };
  if (!noPendingGates) {
    errors.push(`Pending gate artifacts found: ${pendingKeys.join(', ')} — human acknowledgment required`);
  }

  // ── 3. Checkpoint coverage (plan has checkpoints → CHECKPOINT.md exists) ──
  if (phase && plan) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    let coverageCheck = { pass: true, note: 'no_plan_file' };

    if (phaseInfo) {
      const planFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-PLAN.md`);
      if (fs.existsSync(planFile)) {
        const planContent = fs.readFileSync(planFile, 'utf-8');
        const checkpointPattern = /type="(checkpoint:[^"]+)"/g;
        const checkpointTypes = [];
        let m;
        while ((m = checkpointPattern.exec(planContent)) !== null) checkpointTypes.push(m[1]);
        const hasCheckpoints = checkpointTypes.length > 0;
        const checkpointFileExists = fs.existsSync(path.join(cwd, phaseInfo.directory, 'CHECKPOINT.md'));
        const bypass = hasCheckpoints && !checkpointFileExists;
        coverageCheck = { pass: !bypass, has_checkpoints: hasCheckpoints, checkpoint_count: checkpointTypes.length, checkpoint_file_exists: checkpointFileExists };
        if (bypass) {
          errors.push(`Plan has ${checkpointTypes.length} checkpoint task(s) but no CHECKPOINT.md exists — subagent may have bypassed checkpoints`);
        }
      }
    }
    checks.checkpoint_coverage = coverageCheck;
  } else {
    checks.checkpoint_coverage = { pass: true, note: 'skipped — no phase/plan provided' };
  }

  // ── 3b. Orphaned CHECKPOINT.md (non-resolved but no pending gate) ──────────
  if (phase) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    let orphanedCheckpointCheck = { pass: true, note: 'no_checkpoint_file' };

    if (phaseInfo) {
      const checkpointFile = path.join(cwd, phaseInfo.directory, 'CHECKPOINT.md');
      if (fs.existsSync(checkpointFile)) {
        const cpContent = fs.readFileSync(checkpointFile, 'utf-8');
        const cpFm = extractFrontmatter(cpContent);
        const cpStatus = cpFm?.status || 'unknown';
        const isResolved = cpStatus === 'resolved';

        if (!isResolved) {
          // Non-resolved CHECKPOINT.md: there should be a corresponding pending gate artifact.
          // Without one, the checkpoint cannot be acknowledged — it's in an unresolvable state.
          const hasPendingGate = pendingKeys.length > 0;
          orphanedCheckpointCheck = {
            pass: hasPendingGate,
            checkpoint_status: cpStatus,
            pending_gate_count: pendingKeys.length,
          };
          if (!hasPendingGate) {
            warnings.push(`CHECKPOINT.md exists (status: ${cpStatus}) but no pending gate artifact found — checkpoint cannot be acknowledged via normal gate release`);
          }
        }
      }
    }
    checks.checkpoint_orphan = orphanedCheckpointCheck;
  } else {
    checks.checkpoint_orphan = { pass: true, note: 'skipped — no phase provided' };
  }

  // ── 4. All task log hashes exist in git history ────────────────────────────
  if (phase && plan) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    let commitCheck = { pass: true, checked: 0, missing: [] };

    if (phaseInfo) {
      const logFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-TASK-LOG.jsonl`);
      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
        const missing = [];
        for (const line of lines) {
          let entry = null;
          try { entry = JSON.parse(line); } catch { continue; }
          if (!entry?.hash) continue;
          const result = execGit(cwd, ['cat-file', '-t', entry.hash]);
          if (result.exitCode !== 0 || result.stdout.trim() !== 'commit') {
            missing.push({ task: entry.task, hash: entry.hash });
          }
        }
        commitCheck = { pass: missing.length === 0, checked: lines.length, missing };
        if (missing.length > 0) {
          errors.push(`${missing.length} task log hash(es) not found in git history: ${missing.map(m => m.hash).join(', ')}`);
        }
      }
    }
    checks.task_log_commits_exist = commitCheck;
  } else {
    checks.task_log_commits_exist = { pass: true, note: 'skipped — no phase/plan provided' };
  }

  // ── 5. Partial / truncated last task log entry ─────────────────────────────
  if (phase && plan) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    let partialCheck = { pass: true, note: 'no_task_log' };

    if (phaseInfo) {
      const logFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-TASK-LOG.jsonl`);
      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          let parsed = null;
          let parseOk = false;
          try { parsed = JSON.parse(lastLine); parseOk = true; } catch {}
          const truncated = !parseOk;
          const missingHash = parseOk && !parsed?.hash;
          partialCheck = {
            pass: !truncated && !missingHash,
            truncated,
            missing_hash: missingHash,
            entry_count: lines.length,
          };
          if (truncated) {
            errors.push('Last task log entry is malformed / truncated — commit-task may have been interrupted before JSON was flushed');
          } else if (missingHash) {
            errors.push('Last task log entry is missing a commit hash — task log is incomplete');
          }
        }
      }
    }
    checks.task_log_last_entry_valid = partialCheck;
  } else {
    checks.task_log_last_entry_valid = { pass: true, note: 'skipped — no phase/plan provided' };
  }

  // ── 6. Task log hashes ↔ SUMMARY ## Task Commits agreement ────────────────
  if (phase && plan) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    let summaryAgreement = { pass: true, note: 'no_summary' };

    if (phaseInfo) {
      const summaryFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-SUMMARY.md`);
      const logFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-TASK-LOG.jsonl`);

      if (fs.existsSync(summaryFile) && fs.existsSync(logFile)) {
        const summaryContent = fs.readFileSync(summaryFile, 'utf-8');
        const summaryInfo = extractTaskCommitHashes(summaryContent);
        const proofIndexInfo = extractStructuredProofIndex(summaryContent);
        const summaryHashSet = new Set(summaryInfo.hashes);

        const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
        const logHashes = [];
        const logEntries = [];
        for (const line of lines) {
          let entry = null;
          try { entry = JSON.parse(line); } catch { continue; }
          if (!entry) continue;
          logEntries.push(normalizeProofEntry(entry));
          if (entry?.hash) logHashes.push(entry.hash);
        }
        const logHashSet = new Set(logHashes);

        const inLogNotSummary = logHashes.filter(h => !summaryHashSet.has(h));
        const inSummaryNotLog = summaryInfo.hashes.filter(h => !logHashSet.has(h));
        const requiresStructuredProof = parseInt(String(phase), 10) >= 71;
        const summaryProofEntries = proofIndexInfo.entries.map(normalizeProofEntry);
        const summaryByTask = new Map(summaryProofEntries.map(entry => [entry.task, entry]));
        const structuredMismatches = [];
        if (requiresStructuredProof) {
          for (const entry of logEntries) {
            const summaryEntry = summaryByTask.get(entry.task);
            if (!summaryEntry) {
              structuredMismatches.push({ task: entry.task, reason: 'missing task entry in Proof Index' });
              continue;
            }
            const filesMatch = JSON.stringify([...entry.files].sort()) === JSON.stringify([...summaryEntry.files].sort());
            const evidencePresent = Array.isArray(summaryEntry.evidence) && summaryEntry.evidence.length > 0;
            const verifyPresent = Boolean(summaryEntry.verify);
            const commitMatches = (entry.canonical_commit || null) === (summaryEntry.canonical_commit || null);
            if (!commitMatches) structuredMismatches.push({ task: entry.task, reason: 'canonical commit mismatch' });
            if (!filesMatch) structuredMismatches.push({ task: entry.task, reason: 'files mismatch' });
            if (!verifyPresent) structuredMismatches.push({ task: entry.task, reason: 'missing verify command' });
            if (!evidencePresent) structuredMismatches.push({ task: entry.task, reason: 'missing evidence' });
            if (entry.runtime_required && (!summaryEntry.runtime_proof || summaryEntry.runtime_proof.length === 0)) {
              structuredMismatches.push({ task: entry.task, reason: 'missing runtime proof' });
            }
          }
          if (!proofIndexInfo.sectionPresent) {
            structuredMismatches.push({ task: null, reason: 'missing Proof Index section' });
          }
        }

        summaryAgreement = {
          pass: inLogNotSummary.length === 0 && inSummaryNotLog.length === 0 && structuredMismatches.length === 0,
          log_count: logHashes.length,
          summary_count: summaryInfo.hashes.length,
          in_log_not_summary: inLogNotSummary,
          in_summary_not_log: inSummaryNotLog,
          structured_mismatches: structuredMismatches,
          proof_index_present: proofIndexInfo.sectionPresent,
        };
        if (inLogNotSummary.length > 0) {
          errors.push(`${inLogNotSummary.length} task log hash(es) absent from SUMMARY ## Task Commits: ${inLogNotSummary.join(', ')}`);
        }
        if (inSummaryNotLog.length > 0) {
          warnings.push(`${inSummaryNotLog.length} hash(es) in SUMMARY ## Task Commits not found in task log (may be legitimate if log was reset): ${inSummaryNotLog.join(', ')}`);
        }
        if (structuredMismatches.length > 0) {
          errors.push(`Structured proof index mismatch: ${structuredMismatches.map(item => `task ${item.task} ${item.reason}`).join('; ')}`);
        }
      }
    }
    checks.task_log_summary_agreement = summaryAgreement;
  } else {
    checks.task_log_summary_agreement = { pass: true, note: 'skipped — no phase/plan provided' };
  }

  // ── 7. All task log hashes are ancestors of HEAD (history rewrite / cherry-pick / branch divergence) ──
  if (phase && plan) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    let ancestryCheck = { pass: true, checked: 0, not_ancestor: [], note: 'no_task_log' };

    if (phaseInfo) {
      const logFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-TASK-LOG.jsonl`);
      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
        const notAncestor = [];
        let checked = 0;
        for (const line of lines) {
          let entry = null;
          try { entry = JSON.parse(line); } catch { continue; }
          if (!entry?.hash) continue;
          checked++;
          const r = execGit(cwd, ['merge-base', '--is-ancestor', entry.hash, 'HEAD']);
          if (r.exitCode !== 0) {
            notAncestor.push({ task: entry.task, hash: entry.hash });
          }
        }
        ancestryCheck = { pass: notAncestor.length === 0, checked, not_ancestor: notAncestor };
        if (notAncestor.length > 0) {
          errors.push(`${notAncestor.length} task log hash(es) are not ancestors of HEAD — history may have been rewritten, cherry-picked, or recorded on a different branch: ${notAncestor.map(e => e.hash).join(', ')}`);
        }
      }
    }
    checks.task_log_ancestry = ancestryCheck;
  } else {
    checks.task_log_ancestry = { pass: true, note: 'skipped — no phase/plan provided' };
  }

  // ── 8. Branch consistency — task log entries recorded on current branch ────
  if (phase && plan) {
    const phaseInfo = findPhaseInternal(cwd, phase);
    let branchCheck = { pass: true, note: 'no_task_log' };

    if (phaseInfo) {
      const logFile = path.join(cwd, phaseInfo.directory, `${phase}-${plan}-TASK-LOG.jsonl`);
      if (fs.existsSync(logFile)) {
        const currentBranchResult = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
        const currentBranch = currentBranchResult.exitCode === 0 ? currentBranchResult.stdout.trim() : null;

        const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
        const foreignBranchEntries = [];
        for (const line of lines) {
          let entry = null;
          try { entry = JSON.parse(line); } catch { continue; }
          if (entry?.branch && currentBranch && entry.branch !== currentBranch) {
            foreignBranchEntries.push({ task: entry.task, hash: entry.hash, recorded_branch: entry.branch });
          }
        }

        const hasBranchData = lines.some(l => { try { return !!JSON.parse(l)?.branch; } catch { return false; } });
        branchCheck = {
          pass: foreignBranchEntries.length === 0,
          current_branch: currentBranch,
          foreign_entries: foreignBranchEntries,
          note: hasBranchData ? undefined : 'no_branch_field — legacy entries predate branch tracking',
        };
        if (foreignBranchEntries.length > 0) {
          warnings.push(`${foreignBranchEntries.length} task log entry(entries) were recorded on a different branch (${[...new Set(foreignBranchEntries.map(e => e.recorded_branch))].join(', ')}) — task log may have been carried across a branch switch`);
        }
      }
    }
    checks.task_log_branch_consistency = branchCheck;
  } else {
    checks.task_log_branch_consistency = { pass: true, note: 'skipped — no phase/plan provided' };
  }

  // ── 9. STATE.md current_phase ↔ roadmap active phase ───────────────────────
  {
    const statePath = path.join(cwd, '.planning', 'STATE.md');
    const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
    let stateRoadmapCheck = { pass: true, note: 'files_missing' };

    if (fs.existsSync(statePath) && fs.existsSync(roadmapPath)) {
      const stateFm = extractFrontmatter(fs.readFileSync(statePath, 'utf-8'));
      const statePhase = stateFm?.current_phase ? String(stateFm.current_phase) : null;
      const roadmapContent = stripShippedMilestones(fs.readFileSync(roadmapPath, 'utf-8'));
      // In-progress phases are marked with [ ] (not [x]) in ROADMAP
      const inProgressPattern = /\[\s\]\s+\*\*Phase\s+([0-9]+(?:\.[0-9]+)?)\b/gi;
      const inProgressPhases = [];
      let m;
      while ((m = inProgressPattern.exec(roadmapContent)) !== null) {
        inProgressPhases.push(m[1]);
      }
      const statePhaseInRoadmap = statePhase ? inProgressPhases.some(p => p === statePhase || p === statePhase.replace(/^0+/, '')) : null;
      stateRoadmapCheck = {
        pass: statePhase === null || inProgressPhases.length === 0 || statePhaseInRoadmap === true,
        state_phase: statePhase,
        roadmap_in_progress: inProgressPhases,
        agreement: statePhaseInRoadmap,
      };
      if (statePhase && inProgressPhases.length > 0 && statePhaseInRoadmap === false) {
        warnings.push(`STATE.md current_phase (${statePhase}) is not listed as in-progress in ROADMAP.md (in-progress: ${inProgressPhases.join(', ')})`);
      }
    }
    checks.state_roadmap_agreement = stateRoadmapCheck;
  }

  // ── 10. Classify warning severity (ignorable vs stop-the-line) ─────────────
  // Annotate each error/warning with a severity tag so callers don't have to guess.
  // errors are always stop-the-line. warnings get a severity field.
  const classifiedWarnings = warnings.map(w => {
    // Stale gates older than 1h — stop-the-line (may block the whole execution)
    if (/stale pending gate/i.test(w)) return { message: w, severity: 'stop' };
    // Branch mismatch — stop-the-line (may corrupt task log continuity)
    if (/task log.*different branch|carried across.*branch/i.test(w)) return { message: w, severity: 'stop' };
    // Summary/log hash discrepancy from summary side — ignorable if log was explicitly reset
    if (/in SUMMARY.*not found in task log/i.test(w)) return { message: w, severity: 'ignorable' };
    // STATE ↔ roadmap disagreement — ignorable, often races between state writes
    if (/STATE\.md current_phase.*not listed/i.test(w)) return { message: w, severity: 'ignorable' };
    return { message: w, severity: 'ignorable' };
  });

  const coherent = errors.length === 0;
  return { coherent, checks, errors, warnings: classifiedWarnings };
}

function cmdVerifyIntegrity(cwd, options, raw) {
  const result = runVerifyIntegrity(cwd, options);
  output(result, raw, result.coherent ? 'coherent' : 'incoherent');
}

function cmdVerifyBypass(cwd, filePath, raw) {
  const { verifySignature } = require('./authority.cjs');
  if (!filePath) {
    error('file path required');
  }

  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) {
    error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const result = verifySignature(content);

  if (raw) {
    process.stdout.write(JSON.stringify({ path: filePath, ...result }, null, 2) + '\n');
  } else {
    if (result.valid) {
      process.stdout.write(`✅ AUTHORIZED: ${filePath} (Phase ${result.phase}, Plan ${result.plan}, Wave ${result.wave})\n`);
    } else {
      process.stdout.write(`❌ BYPASS DETECTED: ${filePath} - ${result.reason}\n`);
      process.exit(1);
    }
  }
}

module.exports = {
  cmdVerifySummary,
  cmdVerifyWorkColdStart,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyTaskCommit,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
  cmdVerifyContextContract,
  cmdVerifyResearchContract,
  cmdVerifyCheckpointResponse,
  cmdVerifyRequirementCoverage,
  cmdVerifyCrossPlanDataContracts,
  cmdVerifyDeadExports,
  cmdVerifyPlanQuality,
  cmdVerifyWorkflowReadiness,
  cmdVerifyOrphanedState,
  cmdVerifyCheckpointCoverage,
  runVerifyIntegrity,
  cmdVerifyIntegrity,
  cmdValidateConsistency,
  cmdValidateHealth,
  cmdVerifyBypass,
};
