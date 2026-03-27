/**
 * Commands — Standalone utility commands
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { safeReadFile, loadConfig, isGitIgnored, execGit, normalizePhaseName, comparePhaseNum, getArchivedPhaseDirs, generateSlugInternal, getMilestoneInfo, getMilestonePhaseFilter, resolveModelInternal, stripShippedMilestones, toPosixPath, output, error, findPhaseInternal } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { MODEL_PROFILES } = require('./model-profiles.cjs');
const authority = require('./authority.cjs');
const checkpointPlaneSync = require('./checkpoint-plane-sync.cjs');
const secondBrain = require('./second-brain.cjs');
const openBrain = require('./open-brain.cjs');

function stripFrontmatter(content) {
  return String(content || '').replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, '');
}

function extractSummaryExcerpt(content) {
  const lines = stripFrontmatter(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (line.startsWith('## ')) break;
    return line.replace(/^\*\*|\*\*$/g, '');
  }

  return 'Execution summary recorded.';
}

function parseSummaryRef(relPath) {
  const match = path.basename(relPath).match(/^(\d+(?:\.\d+)?)-(\d+)-SUMMARY\.md$/);
  if (!match) return null;
  return {
    phase: match[1],
    plan: match[2],
  };
}

function buildCheckpointMemoryEntry(phase, options, relPath) {
  const checkpointTitle = options.task_name
    ? `Checkpoint: ${options.task_name}`
    : `Checkpoint: Phase ${phase} Plan ${options.plan || '?'}`;
  const bodyLines = [
    `Why blocked: ${options.why_blocked}`,
    `What is uncertain: ${options.what_is_uncertain}`,
    options.resume_condition ? `Resume condition: ${options.resume_condition}` : null,
    options.choices ? `Choices: ${options.choices}` : null,
  ].filter(Boolean);

  return {
    phase: String(phase),
    plan: options.plan != null ? String(options.plan).padStart(2, '0') : null,
    memory_kind: 'checkpoint',
    title: checkpointTitle,
    body_markdown: bodyLines.join('\n'),
    source_ref: relPath,
    created_by: 'executor-checkpoint',
    importance: 4,
  };
}

function buildSummaryMemoryEntry(cwd, relPath) {
  const absolutePath = path.join(cwd, relPath);
  const content = safeReadFile(absolutePath);
  if (!content) {
    return null;
  }

  const planRef = parseSummaryRef(relPath);
  if (!planRef) {
    return null;
  }

  const headingMatch = stripFrontmatter(content).match(/^#\s+(.+)$/m);
  const heading = headingMatch ? headingMatch[1].trim() : `Phase ${planRef.phase} Plan ${planRef.plan} Summary`;
  const excerpt = extractSummaryExcerpt(content);
  const frontmatter = extractFrontmatter(content);

  return {
    phase: planRef.phase,
    plan: planRef.plan,
    title: heading,
    body_markdown: excerpt,
    source_ref: relPath,
    created_by: 'executor-summary',
    importance: Number.isFinite(Number(frontmatter.importance)) ? Number(frontmatter.importance) : 4,
  };
}

async function writeCheckpointLifecycleMemory(cwd, phase, options, relPath) {
  const memoryWriteback = await secondBrain.writeModelFacingMemoryCheckpoint(
    buildCheckpointMemoryEntry(phase, options, relPath)
  );
  const recallOutcome = await openBrain.recordWorkflowRecallOutcome({
    cwd,
    workflow: 'execute-plan',
    phase: String(phase),
    plan: options.plan != null ? String(options.plan).padStart(2, '0') : null,
    outcome: 'unused',
    source_ref: relPath,
  });
  return {
    ...memoryWriteback,
    recall_outcome: recallOutcome,
  };
}

async function writeSummaryLifecycleMemory(cwd, relPath) {
  const entry = buildSummaryMemoryEntry(cwd, relPath);
  if (!entry) {
    return null;
  }
  const memoryWriteback = await secondBrain.writeModelFacingMemorySummary(entry);
  const recallOutcome = await openBrain.recordWorkflowRecallOutcome({
    cwd,
    workflow: 'execute-plan',
    phase: entry.phase,
    plan: entry.plan,
    outcome: 'helpful',
    source_ref: relPath,
  });
  return {
    ...memoryWriteback,
    recall_outcome: recallOutcome,
  };
}

function getProofDir(cwd) {
  return path.join(cwd, '.proof');
}

function getGlobalProofLogPath(cwd) {
  return path.join(getProofDir(cwd), 'task-log.jsonl');
}

function getProofFailureLogPath(cwd) {
  return path.join(getProofDir(cwd), 'failures.jsonl');
}

function appendJsonlRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
}

function normalizeStringArray(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function normalizeProofType(proofType, proofOnly, files = []) {
  if (proofType) return String(proofType).trim().toLowerCase();
  if (proofOnly) return 'audit';
  return 'artifact';
}

function inferRuntimeSurface(files = []) {
  const runtimePatterns = [
    /(^|\/)get-stuff-done\/bin\//,
    /(^|\/)bin\//,
    /(^|\/)cmd\//,
    /(^|\/)scripts\//,
    /(^|\/)docs\/commands\.md$/,
    /(^|\/)docs\/readme\.md$/,
    /(^|\/)readme\.md$/,
  ];
  return files.some((file) => {
    const normalized = String(file || '').replace(/\\/g, '/').toLowerCase();
    return runtimePatterns.some(pattern => pattern.test(normalized));
  });
}

function resolveChangedFilesForCommit(cwd, hash) {
  if (!hash) return [];
  const result = execGit(cwd, ['show', '--pretty=format:', '--name-only', hash]);
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(file => file.replace(/\\/g, '/'));
}

function buildProofRecord(cwd, hash, subject, scope, files, options = {}) {
  const branchResult = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : null;
  const changedFiles = hash ? resolveChangedFilesForCommit(cwd, hash) : files.map(file => String(file).replace(/\\/g, '/'));
  const ancestorCommits = normalizeStringArray(options.ancestor_commits);
  if (options.prev_hash && !ancestorCommits.includes(options.prev_hash)) {
    ancestorCommits.unshift(options.prev_hash);
  }

  return {
    phase: options.phase != null ? String(options.phase).padStart(2, '0') : null,
    plan: options.plan != null ? String(options.plan).padStart(2, '0') : null,
    task: options.task != null ? Number(options.task) : null,
    scope,
    subject,
    proof_type: normalizeProofType(options.proof_type, options.proof_only, files),
    proof_mode: options.proof_only ? 'proof_only' : 'commit',
    canonical_commit: hash || null,
    hash: hash || null,
    ancestor_commits: ancestorCommits,
    files: changedFiles,
    declared_files: files.map(file => String(file).replace(/\\/g, '/')),
    verify_command: options.verify_command ? String(options.verify_command).trim() : null,
    evidence: normalizeStringArray(options.evidence),
    runtime_required: Boolean(options.runtime_surface) || inferRuntimeSurface(changedFiles),
    runtime_proof: normalizeStringArray(options.runtime_proof),
    branch,
    ts: new Date().toISOString(),
  };
}

function validateProofRecord(record) {
  const errors = [];

  if (!record.scope) errors.push('Proof record missing scope');
  if (!Array.isArray(record.files) || record.files.length === 0) errors.push('Proof record missing changed file set');

  if (record.proof_mode === 'commit') {
    if (!record.canonical_commit) errors.push('Commit-backed proof requires a canonical commit');
  } else if (record.proof_mode === 'proof_only') {
    if (record.canonical_commit) errors.push('Proof-only tasks must not record a canonical commit');
    if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
      errors.push('Proof-only tasks require explicit replacement evidence');
    }
  }

  if (record.proof_type === 'behavioral') {
    if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
      errors.push('Behavior-changing tasks require execution evidence');
    }
    if (!record.verify_command) {
      errors.push('Behavior-changing tasks require a verification command');
    }
  }

  if (record.proof_type === 'audit') {
    if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
      errors.push('Audit/no-op tasks require explicit evidence');
    }
    if (!record.verify_command) {
      errors.push('Audit/no-op tasks require a verification command');
    }
  }

  if (record.runtime_required && (!Array.isArray(record.runtime_proof) || record.runtime_proof.length === 0)) {
    errors.push('Runtime-facing tasks require installed/runtime proof');
  }

  return errors;
}

function emitProofFailureArtifact(cwd, record, errors) {
  const artifact = {
    ...record,
    status: 'INVALID',
    errors: normalizeStringArray(errors),
    ts: new Date().toISOString(),
  };
  const filePath = getProofFailureLogPath(cwd);
  appendJsonlRecord(filePath, artifact);
  return filePath;
}

function cmdGenerateSlug(text, raw) {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const result = { slug };
  output(result, raw, slug);
}

function cmdCurrentTimestamp(format, raw) {
  const now = new Date();
  let result;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

function cmdListTodos(cwd, area, raw) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');

  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);

        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        // Apply area filter if specified
        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: toPosixPath(path.join('.planning', 'todos', 'pending', file)),
        });
      } catch {}
    }
  } catch {}

  const result = { count, todos };
  output(result, raw, count.toString());
}

function cmdVerifyPathExists(cwd, targetPath, raw) {
  if (!targetPath) {
    error('path required for verification');
  }

  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

  try {
    const stats = fs.statSync(fullPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

function cmdHistoryDigest(cwd, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const digest = { phases: {}, decisions: [], tech_stack: new Set() };

  // Collect all phase directories: archived + current
  const allPhaseDirs = [];

  // Add archived phases first (oldest milestones first)
  const archived = getArchivedPhaseDirs(cwd);
  for (const a of archived) {
    allPhaseDirs.push({ name: a.name, fullPath: a.fullPath, milestone: a.milestone });
  }

  // Add current phases
  if (fs.existsSync(phasesDir)) {
    try {
      const currentDirs = fs.readdirSync(phasesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
      for (const dir of currentDirs) {
        allPhaseDirs.push({ name: dir, fullPath: path.join(phasesDir, dir), milestone: null });
      }
    } catch {}
  }

  if (allPhaseDirs.length === 0) {
    digest.tech_stack = [];
    output(digest, raw);
    return;
  }

  try {
    for (const { name: dir, fullPath: dirPath } of allPhaseDirs) {
      const summaries = fs.readdirSync(dirPath).filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        try {
          const content = fs.readFileSync(path.join(dirPath, summary), 'utf-8');
          const fm = extractFrontmatter(content);

          const phaseNum = fm.phase || dir.split('-')[0];

          if (!digest.phases[phaseNum]) {
            digest.phases[phaseNum] = {
              name: fm.name || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set(),
              affects: new Set(),
              patterns: new Set(),
            };
          }

          // Merge provides
          if (fm['dependency-graph'] && fm['dependency-graph'].provides) {
            fm['dependency-graph'].provides.forEach(p => digest.phases[phaseNum].provides.add(p));
          } else if (fm.provides) {
            fm.provides.forEach(p => digest.phases[phaseNum].provides.add(p));
          }

          // Merge affects
          if (fm['dependency-graph'] && fm['dependency-graph'].affects) {
            fm['dependency-graph'].affects.forEach(a => digest.phases[phaseNum].affects.add(a));
          }

          // Merge patterns
          if (fm['patterns-established']) {
            fm['patterns-established'].forEach(p => digest.phases[phaseNum].patterns.add(p));
          }

          // Merge decisions
          if (fm['key-decisions']) {
            fm['key-decisions'].forEach(d => {
              digest.decisions.push({ phase: phaseNum, decision: d });
            });
          }

          // Merge tech stack
          if (fm['tech-stack'] && fm['tech-stack'].added) {
            fm['tech-stack'].added.forEach(t => digest.tech_stack.add(typeof t === 'string' ? t : t.name));
          }

        } catch (e) {
          // Skip malformed summaries
        }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.phases).forEach(p => {
      digest.phases[p].provides = [...digest.phases[p].provides];
      digest.phases[p].affects = [...digest.phases[p].affects];
      digest.phases[p].patterns = [...digest.phases[p].patterns];
    });
    digest.tech_stack = [...digest.tech_stack];

    output(digest, raw);
  } catch (e) {
    error('Failed to generate history digest: ' + e.message);
  }
}

function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';
  const model = resolveModelInternal(cwd, agentType);

  const agentModels = MODEL_PROFILES[agentType];
  const result = agentModels
    ? { model, profile }
    : { model, profile, unknown_agent: true };
  output(result, raw, model);
}

async function cmdCommit(cwd, message, files, raw, amend) {
  if (!message && !amend) {
    error('commit message required');
  }

  const config = loadConfig(cwd);

  // Check commit_docs config
  if (!config.commit_docs) {
    const result = { committed: false, hash: null, reason: 'skipped_commit_docs_false' };
    output(result, raw, 'skipped');
    return;
  }

  // Check if .planning is gitignored
  if (isGitIgnored(cwd, '.planning')) {
    const result = { committed: false, hash: null, reason: 'skipped_gitignored' };
    output(result, raw, 'skipped');
    return;
  }

  // Stage files
  const filesToStage = files && files.length > 0 ? files : ['.planning/'];
  for (const file of filesToStage) {
    const addResult = execGit(cwd, ['add', file]);
    if (addResult.exitCode !== 0) {
      const result = { committed: false, hash: null, reason: 'git_add_failed', error: addResult.stderr || addResult.stdout, file };
      output(result, raw, 'failed');
      return;
    }
  }

  // Commit
  const commitArgs = amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message];
  const commitResult = execGit(cwd, commitArgs);
  if (commitResult.exitCode !== 0) {
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      const result = { committed: false, hash: null, reason: 'nothing_to_commit' };
      output(result, raw, 'nothing');
      return;
    }
    const result = { committed: false, hash: null, reason: 'nothing_to_commit', error: commitResult.stderr };
    output(result, raw, 'nothing');
    return;
  }

  // Get short hash
  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
  const summaryFiles = filesToStage.filter((file) => /(^|\/)\d+(?:\.\d+)?-\d+-SUMMARY\.md$/.test(file));
  const memory_writebacks = [];
  for (const summaryFile of summaryFiles) {
    try {
      const writeback = await writeSummaryLifecycleMemory(cwd, summaryFile);
      if (writeback) {
        memory_writebacks.push({
          source_ref: summaryFile,
          ...writeback,
        });
      }
    } catch (err) {
      memory_writebacks.push({
        source_ref: summaryFile,
        available: false,
        blocked: false,
        error: err.message,
      });
    }
  }

  const result = { committed: true, hash, reason: 'committed', memory_writebacks };
  output(result, raw, hash || 'committed');
}

function cmdCommitTask(cwd, message, files, scope, options, raw) {
  // options = { phase?, plan?, task? } — all optional; when provided, append to task log
  if (typeof options === 'boolean' || options == null) {
    // backward-compat: called as (cwd, message, files, scope, raw)
    raw = options;
    options = {};
  }
  if (!message) error('commit message required');
  if (!scope) error('--scope required for commit-task');
  if (!files || files.length === 0) error('--files required for commit-task');

  // Pre-commit continuity check: if --prev-hash provided, verify it is still HEAD
  // before touching the working tree. Catches any commit that slipped in between tasks
  // (manual commits, wrong-scope commits, bypassed enforcement) without requiring a
  // separate verify step.
  if (options.prev_hash) {
    const headResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
    const currentHead = headResult.exitCode === 0 ? headResult.stdout.trim() : null;
    if (currentHead !== options.prev_hash) {
      process.stdout.write(JSON.stringify({
        committed: false,
        verified: false,
        hash: null,
        subject: null,
        scope,
        scope_matches: false,
        errors: [
          `Continuity check failed: previous task commit ${options.prev_hash} is no longer HEAD (HEAD is ${currentHead || 'unknown'}) — an out-of-band commit occurred between tasks`,
        ],
      }, null, 2));
      process.exit(1);
    }
  }

  let hash = null;
  let committed = false;
  let subject = message;
  let scopeMatches = true;
  let commitErrors = [];

  if (!options.proof_only) {
    for (const file of files) {
      if (options.phase && options.plan) {
        const wave = options.wave || options.task || '1';
        const filePath = path.isAbsolute(file) ? file : path.join(cwd, file);
        if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
          authority.signFile(filePath, options.phase, options.plan, wave);
        }
      }

      const addResult = execGit(cwd, ['add', file]);
      if (addResult.exitCode !== 0) {
        output({
          committed: false, verified: false, hash: null, subject: null,
          scope, scope_matches: false,
          errors: [`git add failed for ${file}: ${addResult.stderr || addResult.stdout}`],
        }, raw, 'failed');
        return;
      }
    }

    const commitResult = execGit(cwd, ['commit', '-m', message]);
    if (commitResult.exitCode !== 0) {
      if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
        process.stdout.write(JSON.stringify({ committed: false, verified: false, hash: null, subject: null, scope, scope_matches: false, errors: ['nothing to commit'] }, null, 2));
        process.exit(1);
      }
      output({ committed: false, verified: false, hash: null, subject: null, scope, scope_matches: false, errors: [commitResult.stderr || 'commit failed'] }, raw, 'failed');
      return;
    }

    const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
    if (hashResult.exitCode !== 0) {
      output({ committed: true, verified: false, hash: null, subject: null, scope, scope_matches: false, errors: ['could not resolve HEAD hash'] }, raw, 'failed');
      return;
    }
    hash = hashResult.stdout.trim();
    committed = true;

    const typeResult = execGit(cwd, ['cat-file', '-t', hash]);
    const exists = typeResult.exitCode === 0 && typeResult.stdout.trim() === 'commit';

    const headResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
    const isHead = headResult.exitCode === 0 && headResult.stdout.trim() === hash;

    const subjectResult = execGit(cwd, ['log', '-1', '--format=%s', hash]);
    subject = subjectResult.exitCode === 0 ? subjectResult.stdout.trim() : null;
    const openParen = subject ? subject.indexOf('(') : -1;
    const closeParen = subject ? subject.indexOf('):') : -1;
    const subjectScope = openParen !== -1 && closeParen !== -1 && closeParen > openParen
      ? subject.slice(openParen + 1, closeParen)
      : null;
    scopeMatches = subjectScope === scope;

    if (!exists) commitErrors.push('Commit hash not found in git history');
    if (exists && !isHead) commitErrors.push('Task commit is not the current HEAD');
    if (!scopeMatches) commitErrors.push(`Task commit subject does not match expected scope ${scope}`);
  }

  const proofRecord = buildProofRecord(cwd, hash, subject, scope, files, options);
  const proofErrors = validateProofRecord(proofRecord);
  const errors = [...commitErrors, ...proofErrors];

  let task_log_path = null;
  let proof_log_path = null;
  let failure_artifact_path = null;
  if (errors.length === 0 && options.phase && options.plan) {
    const phaseInfo = findPhaseInternal(cwd, options.phase);
    if (phaseInfo) {
      const logFile = `${options.phase}-${options.plan}-TASK-LOG.jsonl`;
      const absDir = path.join(cwd, phaseInfo.directory);
      task_log_path = path.join(absDir, logFile);
      proof_log_path = getGlobalProofLogPath(cwd);
      try {
        appendJsonlRecord(task_log_path, proofRecord);
        appendJsonlRecord(proof_log_path, proofRecord);
      } catch (appendErr) {
        const result = {
          committed,
          verified: false,
          hash,
          subject,
          scope,
          errors: [`Task log append failed: ${appendErr.message} — commit ${hash || 'proof-only task'} was not recorded. Run: task-log reconstruct --phase ${options.phase} --plan ${options.plan}`],
        };
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        process.exit(1);
      }
    }
  } else if (errors.length > 0) {
    failure_artifact_path = emitProofFailureArtifact(cwd, proofRecord, errors);
  }

  const result = {
    committed,
    verified: errors.length === 0,
    hash,
    subject,
    scope,
    scope_matches: scopeMatches,
    task_log_path,
    proof_log_path,
    failure_artifact_path,
    proof_type: proofRecord.proof_type,
    proof_mode: proofRecord.proof_mode,
    runtime_required: proofRecord.runtime_required,
    errors,
  };

  // Exit 1 when verification fails so bash `if !` blocks halt without requiring JSON parsing.
  if (errors.length > 0) {
    process.stdout.write(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  output(result, raw, hash);
}

/**
 * complete-task — Non-bypassable single-call task completion primitive.
 *
 * Stricter than commit-task:
 *  - --phase, --plan, --task are all REQUIRED (no optional log)
 *  - Auto-injects --prev-hash from the last task log entry (no manual passing)
 *  - Enforces sequential task numbers (task N must follow task N-1 in log)
 *
 * Agents should prefer complete-task over commit-task to ensure continuity
 * checks and log recording cannot be accidentally omitted.
 */
function cmdCompleteTask(cwd, message, files, scope, options, raw) {
  if (!message) error('commit message required');
  if (!scope) error('--scope required for complete-task');
  if (!files || files.length === 0) error('--files required for complete-task');
  if (!options.phase) error('--phase required for complete-task');
  if (!options.plan) error('--plan required for complete-task');
  if (options.task == null) error('--task required for complete-task');

  const taskNum = Number(options.task);
  if (isNaN(taskNum) || taskNum < 1) {
    process.stdout.write(JSON.stringify({
      committed: false, verified: false, hash: null, subject: null, scope,
      errors: [`--task must be a positive integer (got: ${options.task})`],
    }, null, 2));
    process.exit(1);
  }

  // Read last task log entry to auto-inject prev-hash and enforce sequential numbering.
  let auto_prev_hash = null;
  const phaseInfoForLog = findPhaseInternal(cwd, options.phase);
  if (phaseInfoForLog) {
    const logFile = path.join(cwd, phaseInfoForLog.directory, `${options.phase}-${options.plan}-TASK-LOG.jsonl`);
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
      if (lines.length > 0) {
        let lastEntry = null;
        try { lastEntry = JSON.parse(lines[lines.length - 1]); } catch {}
        if (lastEntry) {
          // Enforce sequential task numbering.
          const lastTask = lastEntry.task != null ? Number(lastEntry.task) : null;
          if (lastTask !== null && taskNum !== lastTask + 1) {
            process.stdout.write(JSON.stringify({
              committed: false, verified: false, hash: null, subject: null, scope,
              errors: [`Task number gap: expected task ${lastTask + 1} but got task ${taskNum} — task log requires sequential numbering`],
            }, null, 2));
            process.exit(1);
          }
          if (lastEntry.hash) {
            auto_prev_hash = lastEntry.hash;
          }
        }
      } else if (taskNum !== 1) {
        // Log exists but is empty — only task 1 is valid.
        process.stdout.write(JSON.stringify({
          committed: false, verified: false, hash: null, subject: null, scope,
          errors: [`Task number gap: task log is empty but task number is ${taskNum} — expected task 1`],
        }, null, 2));
        process.exit(1);
      }
    } else if (taskNum !== 1) {
      // No log yet — only task 1 is valid as the first entry.
      process.stdout.write(JSON.stringify({
        committed: false, verified: false, hash: null, subject: null, scope,
        errors: [`Task number gap: no task log found but task number is ${taskNum} — expected task 1 for first entry`],
      }, null, 2));
      process.exit(1);
    }
  }

  // Auto-manage Second Brain: Normalize modified files before commit
  try {
    const { cmdContextNormalize } = require('./context.cjs');
    for (const file of files) {
      if (fs.existsSync(path.resolve(cwd, file))) {
        // Run normalize (which triggers Second Brain ingest)
        cmdContextNormalize(cwd, `file://${file}`, file, { silent: true });
      }
    }
  } catch (e) {
    // Ignore normalization errors to prevent blocking the commit, but log it
    process.stderr.write(`[complete-task] Warning: Auto-normalization failed: ${e.message}\n`);
  }

  // Delegate to commit-task with auto-injected prev-hash.
  cmdCommitTask(cwd, message, files, scope, {
    phase: options.phase,
    plan: options.plan,
    task: options.task,
    prev_hash: options.prev_hash || auto_prev_hash,
    proof_type: options.proof_type,
    evidence: options.evidence,
    verify_command: options.verify_command,
    runtime_proof: options.runtime_proof,
    runtime_surface: options.runtime_surface,
    ancestor_commits: options.ancestor_commits,
    proof_only: options.proof_only,
  }, raw);
}

function cmdTaskLogRead(cwd, phase, plan, raw) {
  if (!phase) error('--phase required for task-log read');
  if (!plan) error('--plan required for task-log read');

  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo) {
    output({ phase, plan, found: false, tasks: [], count: 0, error: 'Phase not found' }, raw, 'not_found');
    return;
  }

  const logFile = `${phase}-${plan}-TASK-LOG.jsonl`;
  const logPath = path.join(cwd, phaseInfo.directory, logFile);

  if (!fs.existsSync(logPath)) {
    output({ phase, plan, found: false, tasks: [], count: 0, log_path: logPath }, raw, 'not_found');
    return;
  }

  let tasks = [];
  let parseErrors = [];
  try {
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        tasks.push(JSON.parse(line));
      } catch {
        parseErrors.push(line);
      }
    }
  } catch (err) {
    output({ phase, plan, found: false, tasks: [], count: 0, error: err.message }, raw, 'error');
    return;
  }

  output({
    phase,
    plan,
    found: true,
    log_path: logPath,
    tasks,
    count: tasks.length,
    parse_errors: parseErrors.length > 0 ? parseErrors : undefined,
  }, raw, String(tasks.length));
}

function cmdTaskLogReconstruct(cwd, phase, plan, raw) {
  if (!phase) error('--phase required for task-log reconstruct');
  if (!plan) error('--plan required for task-log reconstruct');

  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo) {
    if (raw) {
      process.stdout.write('');
      process.exit(0);
    } else {
      output({ found: false, lines: [] }, raw);
    }
    return;
  }

  const logFile = `${phase}-${plan}-TASK-LOG.jsonl`;
  const logPath = path.join(cwd, phaseInfo.directory, logFile);

  if (!fs.existsSync(logPath)) {
    if (raw) {
      process.stdout.write('');
      process.exit(0);
    } else {
      output({ found: false, lines: [] }, raw);
    }
    return;
  }

  let tasks = [];
  try {
    const fileLines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of fileLines) {
      try {
        tasks.push(JSON.parse(line));
      } catch {
        // skip unparseable lines
      }
    }
  } catch (err) {
    if (raw) {
      process.stdout.write('');
      process.exit(0);
    } else {
      output({ found: false, lines: [] }, raw);
    }
    return;
  }

  if (tasks.length === 0) {
    if (raw) {
      process.stdout.write('');
      process.exit(0);
    } else {
      output({ found: false, lines: [] }, raw);
    }
    return;
  }

  const lines = tasks.map((t, i) => `Task ${t.task != null ? t.task : i + 1}: ${t.hash || t.commit || t.id || JSON.stringify(t)}`);

  if (raw) {
    process.stdout.write(lines.join('\n') + '\n');
    process.exit(0);
  } else {
    output({ found: true, lines, count: lines.length }, raw);
  }
}

function cmdSummaryExtract(cwd, summaryPath, fields, raw) {
  if (!summaryPath) {
    error('summary-path required for summary-extract');
  }

  const fullPath = path.join(cwd, summaryPath);

  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: summaryPath }, raw);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);

  // Parse key-decisions into structured format
  const parseDecisions = (decisionsList) => {
    if (!decisionsList || !Array.isArray(decisionsList)) return [];
    return decisionsList.map(d => {
      const colonIdx = d.indexOf(':');
      if (colonIdx > 0) {
        return {
          summary: d.substring(0, colonIdx).trim(),
          rationale: d.substring(colonIdx + 1).trim(),
        };
      }
      return { summary: d, rationale: null };
    });
  };

  // Build full result
  const fullResult = {
    path: summaryPath,
    one_liner: fm['one-liner'] || null,
    key_files: fm['key-files'] || [],
    tech_added: (fm['tech-stack'] && fm['tech-stack'].added) || [],
    patterns: fm['patterns-established'] || [],
    decisions: parseDecisions(fm['key-decisions']),
    requirements_completed: fm['requirements-completed'] || [],
  };

  // If fields specified, filter to only those fields
  if (fields && fields.length > 0) {
    const filtered = { path: summaryPath };
    for (const field of fields) {
      if (fullResult[field] !== undefined) {
        filtered[field] = fullResult[field];
      }
    }
    output(filtered, raw);
    return;
  }

  output(fullResult, raw);
}

function cmdProgressRender(cwd, format, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const milestone = getMilestoneInfo(cwd);

  const phases = [];
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)*)-?(.*)/);
      const phaseNum = dm ? dm[1] : dir;
      const phaseName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalPlans += plans;
      totalSummaries += summaries;

      let status;
      if (plans === 0) status = 'Pending';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      phases.push({ number: phaseNum, name: phaseName, plans, summaries, status });
    }
  } catch {}

  const percent = totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0;

  if (format === 'table') {
    // Render markdown table
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name}\n\n`;
    out += `**Progress:** [${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)\n\n`;
    out += `| Phase | Name | Plans | Status |\n`;
    out += `|-------|------|-------|--------|\n`;
    for (const p of phases) {
      out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
    }
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalPlans }, raw, text);
  } else {
    // JSON format
    output({
      milestone_version: milestone.version,
      milestone_name: milestone.name,
      phases,
      total_plans: totalPlans,
      total_summaries: totalSummaries,
      percent,
    }, raw);
  }
}

function cmdTodoComplete(cwd, filename, raw) {
  if (!filename) {
    error('filename required for todo complete');
  }

  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  const completedDir = path.join(cwd, '.planning', 'todos', 'completed');
  const sourcePath = path.join(pendingDir, filename);

  if (!fs.existsSync(sourcePath)) {
    error(`Todo not found: ${filename}`);
  }

  // Ensure completed directory exists
  fs.mkdirSync(completedDir, { recursive: true });

  // Read, add completion timestamp, move
  let content = fs.readFileSync(sourcePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  content = `completed: ${today}\n` + content;

  fs.writeFileSync(path.join(completedDir, filename), content, 'utf-8');
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

function cmdScaffold(cwd, type, options, raw) {
  const { phase, name } = options;
  const padded = phase ? normalizePhaseName(phase) : '00';
  const today = new Date().toISOString().split('T')[0];

  // Find phase directory
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
  const phaseDir = phaseInfo ? path.join(cwd, phaseInfo.directory) : null;

  if (phase && !phaseDir && type !== 'phase-dir') {
    error(`Phase ${phase} directory not found`);
  }

  let filePath, content;

  switch (type) {
    case 'context': {
      filePath = path.join(phaseDir, `${padded}-CONTEXT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Context\n\n## Decisions\n\n_Decisions will be captured during /gsd:discuss-phase ${phase}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
      break;
    }
    case 'uat': {
      filePath = path.join(phaseDir, `${padded}-UAT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — User Acceptance Testing\n\n## Test Results\n\n| # | Test | Status | Notes |\n|---|------|--------|-------|\n\n## Summary\n\n_Pending UAT_\n`;
      break;
    }
    case 'verification': {
      filePath = path.join(phaseDir, `${padded}-VERIFICATION.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nverified: ${today}T00:00:00Z\nstatus: CONDITIONAL\nscore: 0/0 requirements verified\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Verification\n\n**Phase Goal:** [From ROADMAP.md]\n**Verified:** ${today}T00:00:00Z\n**Status:** CONDITIONAL\n\n## Observable Truths\n\n| # | Truth | Status | Evidence |\n|---|-------|--------|----------|\n| 1 | [Claimed truth] | CONDITIONAL | [Direct evidence ref] |\n\n## Requirement Coverage\n\n| Requirement | Status | Evidence | Gap |\n|-------------|--------|----------|-----|\n| [REQ-ID] | CONDITIONAL | [commit/file/test/runtime proof] | [missing_evidence if any] |\n\n## Anti-Pattern Scan\n\n| File | Pattern | Classification | Impact |\n|------|---------|----------------|--------|\n| None | - | - | - |\n\n## Drift Analysis\n\n\`\`\`json\n[\n  {\n    "type": "verification_drift",\n    "description": "Replace this placeholder with real drift classification or [] when none remain."\n  }\n]\n\`\`\`\n\n## Escalation\n\n\`\`\`json\n{\n  "required": false,\n  "type": null,\n  "reason": null,\n  "explanation": null,\n  "options": [],\n  "implications": []\n}\n\`\`\`\n\n## Human Check\n\n\`\`\`json\n{\n  "steps": [],\n  "observed_result": null,\n  "captured_artifact": null\n}\n\`\`\`\n\n## Final Status\n\n\`\`\`json\n{\n  "status": "CONDITIONAL",\n  "reason": "Pending evidence capture and validation."\n}\n\`\`\`\n`;
      break;
    }
    case 'phase-dir': {
      if (!phase || !name) {
        error('phase and name required for phase-dir scaffold');
      }
      const slug = generateSlugInternal(name);
      const dirName = `${padded}-${slug}`;
      const phasesParent = path.join(cwd, '.planning', 'phases');
      fs.mkdirSync(phasesParent, { recursive: true });
      const dirPath = path.join(phasesParent, dirName);
      fs.mkdirSync(dirPath, { recursive: true });
      output({ created: true, directory: `.planning/phases/${dirName}`, path: dirPath }, raw, dirPath);
      return;
    }
    default:
      error(`Unknown scaffold type: ${type}. Available: context, uat, verification, phase-dir`);
  }

  if (fs.existsSync(filePath)) {
    output({ created: false, reason: 'already_exists', path: filePath }, raw, 'exists');
    return;
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  const relPath = toPosixPath(path.relative(cwd, filePath));
  output({ created: true, path: relPath }, raw, relPath);
}

function cmdStats(cwd, format, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const milestone = getMilestoneInfo(cwd);
  const isDirInMilestone = getMilestonePhaseFilter(cwd);

  // Phase & plan stats (reuse progress pattern)
  const phasesByNumber = new Map();
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const roadmapContent = stripShippedMilestones(fs.readFileSync(roadmapPath, 'utf-8'));
    const headingPattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
    let match;
    while ((match = headingPattern.exec(roadmapContent)) !== null) {
      phasesByNumber.set(match[1], {
        number: match[1],
        name: match[2].replace(/\(INSERTED\)/i, '').trim(),
        plans: 0,
        summaries: 0,
        status: 'Not Started',
      });
    }
  } catch {}

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(isDirInMilestone)
      .sort((a, b) => comparePhaseNum(a, b));

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
      const phaseNum = dm ? dm[1] : dir;
      const phaseName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalPlans += plans;
      totalSummaries += summaries;

      let status;
      if (plans === 0) status = 'Not Started';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      const existing = phasesByNumber.get(phaseNum);
      phasesByNumber.set(phaseNum, {
        number: phaseNum,
        name: existing?.name || phaseName,
        plans,
        summaries,
        status,
      });
    }
  } catch {}

  const phases = [...phasesByNumber.values()].sort((a, b) => comparePhaseNum(a.number, b.number));
  const completedPhases = phases.filter(p => p.status === 'Complete').length;
  const planPercent = totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0;
  const percent = phases.length > 0 ? Math.min(100, Math.round((completedPhases / phases.length) * 100)) : 0;

  // Requirements stats
  let requirementsTotal = 0;
  let requirementsComplete = 0;
  try {
    if (fs.existsSync(reqPath)) {
      const reqContent = fs.readFileSync(reqPath, 'utf-8');
      const checked = reqContent.match(/^- \[x\] \*\*/gm);
      const unchecked = reqContent.match(/^- \[ \] \*\*/gm);
      requirementsComplete = checked ? checked.length : 0;
      requirementsTotal = requirementsComplete + (unchecked ? unchecked.length : 0);
    }
  } catch {}

  // Last activity from STATE.md
  let lastActivity = null;
  try {
    if (fs.existsSync(statePath)) {
      const stateContent = fs.readFileSync(statePath, 'utf-8');
      const activityMatch = stateContent.match(/^last_activity:\s*(.+)$/im)
        || stateContent.match(/\*\*Last Activity:\*\*\s*(.+)/i)
        || stateContent.match(/^Last Activity:\s*(.+)$/im)
        || stateContent.match(/^Last activity:\s*(.+)$/im);
      if (activityMatch) lastActivity = activityMatch[1].trim();
    }
  } catch {}

  // Git stats
  let gitCommits = 0;
  let gitFirstCommitDate = null;
  const commitCount = execGit(cwd, ['rev-list', '--count', 'HEAD']);
  if (commitCount.exitCode === 0) {
    gitCommits = parseInt(commitCount.stdout, 10) || 0;
  }
  const rootHash = execGit(cwd, ['rev-list', '--max-parents=0', 'HEAD']);
  if (rootHash.exitCode === 0 && rootHash.stdout) {
    const firstCommit = rootHash.stdout.split('\n')[0].trim();
    const firstDate = execGit(cwd, ['show', '-s', '--format=%as', firstCommit]);
    if (firstDate.exitCode === 0) {
      gitFirstCommitDate = firstDate.stdout || null;
    }
  }

  const result = {
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    phases,
    phases_completed: completedPhases,
    phases_total: phases.length,
    total_plans: totalPlans,
    total_summaries: totalSummaries,
    percent,
    plan_percent: planPercent,
    requirements_total: requirementsTotal,
    requirements_complete: requirementsComplete,
    git_commits: gitCommits,
    git_first_commit_date: gitFirstCommitDate,
    last_activity: lastActivity,
  };

  if (format === 'table') {
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name} \u2014 Statistics\n\n`;
    out += `**Progress:** [${bar}] ${completedPhases}/${phases.length} phases (${percent}%)\n`;
    if (totalPlans > 0) {
      out += `**Plans:** ${totalSummaries}/${totalPlans} complete (${planPercent}%)\n`;
    }
    out += `**Phases:** ${completedPhases}/${phases.length} complete\n`;
    if (requirementsTotal > 0) {
      out += `**Requirements:** ${requirementsComplete}/${requirementsTotal} complete\n`;
    }
    out += '\n';
    out += `| Phase | Name | Plans | Completed | Status |\n`;
    out += `|-------|------|-------|-----------|--------|\n`;
    for (const p of phases) {
      out += `| ${p.number} | ${p.name} | ${p.plans} | ${p.summaries} | ${p.status} |\n`;
    }
    if (gitCommits > 0) {
      out += `\n**Git:** ${gitCommits} commits`;
      if (gitFirstCommitDate) out += ` (since ${gitFirstCommitDate})`;
      out += '\n';
    }
    if (lastActivity) out += `**Last activity:** ${lastActivity}\n`;
    output({ rendered: out }, raw, out);
  } else {
    output(result, raw);
  }
}

/**
 * Checkpoint write — atomic primitive for checkpoint tasks.
 *
 * Writes CHECKPOINT.md to the phase directory, commits it, and returns the
 * structured checkpoint payload. Replaces the multi-step prompt-obedience pattern
 * of "write file manually, then commit, then format JSON" with one non-bypassable call.
 *
 * Returns: { written, committed, hash, path, type, why_blocked, what_is_uncertain }
 */
async function cmdCheckpointWrite(cwd, phase, options, raw) {
  if (!phase) error('--phase required for checkpoint write');
  if (!options || !options.type) error('--type required (human-verify|decision|human-action)');
  if (!options.why_blocked) error('--why-blocked required');
  if (!options.what_is_uncertain) error('--what-is-uncertain required');

  const validTypes = ['human-verify', 'decision', 'human-action'];
  if (!validTypes.includes(options.type)) {
    error(`--type must be one of: ${validTypes.join(', ')}`);
  }

  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo) {
    error(`Phase directory not found for phase: ${phase}`);
  }

  const phaseDir = path.join(cwd, phaseInfo.directory);
  const checkpointPath = path.join(phaseDir, 'CHECKPOINT.md');
  const relPath = path.join(phaseInfo.directory, 'CHECKPOINT.md');

  const allowFreeform = options.allow_freeform !== false;
  const choices = options.choices || '';
  const resumeCondition = options.resume_condition || 'User provides explicit confirmation';
  const taskNum = options.task || null;
  const taskName = options.task_name || '';

  const content = [
    '---',
    'status: pending',
    `type: ${options.type}`,
    `why_blocked: "${options.why_blocked.replace(/"/g, '\\"')}"`,
    `what_is_uncertain: "${options.what_is_uncertain.replace(/"/g, '\\"')}"`,
    `choices: "${choices.replace(/"/g, '\\"')}"`,
    `allow_freeform: ${allowFreeform}`,
    `resume_condition: "${resumeCondition.replace(/"/g, '\\"')}"`,
    'resolved_at: ~',
    '---',
    '',
    '## Checkpoint Details',
    '',
    `**Type:** ${options.type}`,
    taskNum ? `**Blocked at:** Task ${taskNum}${taskName ? ' — ' + taskName : ''}` : '',
    '',
    `**Why blocked:** ${options.why_blocked}`,
    '',
    `**What is uncertain:** ${options.what_is_uncertain}`,
    choices ? `\n**Choices:** ${choices}` : '',
  ].filter(line => line !== undefined).join('\n').trimEnd() + '\n';

  try {
    fs.writeFileSync(checkpointPath, content, 'utf-8');
  } catch (err) {
    error(`Failed to write CHECKPOINT.md: ${err.message}`);
  }

  // Commit the checkpoint artifact
  const addResult = execGit(cwd, ['add', relPath]);
  if (addResult.exitCode !== 0) {
    error(`git add failed: ${addResult.stderr || addResult.stdout}`);
  }

  const commitMsg = `chore(${phase}-checkpoint): write checkpoint artifact${taskNum ? ` [task ${taskNum}]` : ''}`;
  const commitResult = execGit(cwd, ['commit', '-m', commitMsg]);
  if (commitResult.exitCode !== 0) {
    // If nothing changed (e.g., same content), treat as written-but-not-committed
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      output({ written: true, committed: false, hash: null, path: relPath, type: options.type,
        why_blocked: options.why_blocked, what_is_uncertain: options.what_is_uncertain,
        note: 'nothing_to_commit — CHECKPOINT.md already up-to-date' }, raw, 'written');
      return;
    }
    error(`git commit failed: ${commitResult.stderr || 'unknown error'}`);
  }

  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout.trim() : null;
  let memory_writeback = null;

  try {
    memory_writeback = await writeCheckpointLifecycleMemory(cwd, phase, options, relPath);
  } catch (err) {
    memory_writeback = {
      available: false,
      blocked: false,
      error: err.message,
    };
  }

  checkpointPlaneSync.notifyCheckpointWrite(phase, checkpointPath).catch(() => {});

  output({
    written: true,
    committed: true,
    hash,
    path: relPath,
    type: options.type,
    why_blocked: options.why_blocked,
    what_is_uncertain: options.what_is_uncertain,
    resume_condition: resumeCondition,
    choices,
    allow_freeform: allowFreeform,
    memory_writeback,
  }, raw, hash || 'written');
}

/**
 * Health degraded-mode check — canonical "am I running on fallback assumptions?" query.
 *
 * Checks:
 *  - config.json loadable (no _load_error)
 *  - Required .planning/ files exist (STATE.md, ROADMAP.md, PROJECT.md)
 *  - Any gates currently pending (stale blocks)
 *
 * Returns: { degraded, warnings, fallbacks, gate_pending_keys }
 */
function cmdHealthDegradedMode(cwd, raw) {
  const config = loadConfig(cwd);
  const warnings = [];
  const fallbacks = [];
  const gatePendingKeys = [];

  // Config degradation
  if (config._load_error) {
    warnings.push(`config.json unreadable: ${config._load_error}`);
    fallbacks.push('All config values are defaults (mode=interactive, all gates=on)');
  }

  // Required planning files
  const required = [
    { file: '.planning/STATE.md', label: 'STATE.md' },
    { file: '.planning/ROADMAP.md', label: 'ROADMAP.md' },
    { file: '.planning/PROJECT.md', label: 'PROJECT.md' },
  ];
  for (const { file, label } of required) {
    if (!fs.existsSync(path.join(cwd, file))) {
      warnings.push(`${label} not found — project may not be initialized`);
      fallbacks.push(`${label} missing: workflows that depend on it will fail`);
    }
  }

  // Pending gates
  const gatesDir = path.join(cwd, '.planning', 'gates');
  if (fs.existsSync(gatesDir)) {
    const pendingFiles = fs.readdirSync(gatesDir).filter(f => f.endsWith('-pending.json'));
    for (const f of pendingFiles) {
      // Convert filename back to key: gates_confirm_roadmap-pending.json → gates.confirm_roadmap
      const key = f.replace('-pending.json', '').replace(/_/g, '.');
      gatePendingKeys.push(key);
      warnings.push(`Gate pending: ${key} — human acknowledgment required before continuing`);
    }
  }

  const degraded = warnings.length > 0;

  output({
    degraded,
    warnings,
    fallbacks,
    gate_pending_keys: gatePendingKeys,
    config_mode: config.mode,
    config_ok: !config._load_error,
  }, raw, degraded ? 'degraded' : 'ok');
}

module.exports = {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdVerifyPathExists,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdCommit,
  cmdCommitTask,
  cmdCompleteTask,
  cmdTaskLogRead,
  cmdTaskLogReconstruct,
  cmdCheckpointWrite,
  cmdHealthDegradedMode,
  cmdSummaryExtract,
  cmdProgressRender,
  cmdTodoComplete,
  cmdScaffold,
  cmdStats,
  buildCheckpointMemoryEntry,
  buildSummaryMemoryEntry,
  writeCheckpointLifecycleMemory,
  writeSummaryLifecycleMemory,
};

// GSD-AUTHORITY: 72-01-1:5f3faf2cd908fbcfa49e94fd5efe21a9b8871b43a018ebafe86bd5482bc9455b
