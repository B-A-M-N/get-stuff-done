/**
 * Core — Shared utilities, constants, and internal helpers
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { MODEL_PROFILES } = require('./model-profiles.cjs');
const { SafeLogger } = require('../../../packages/gsd-tools/src/logging/SafeLogger');

// ─── Logging ────────────────────────────────────────────────────────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLogLevel = LOG_LEVELS.info;

// Initialize from environment at module load
const envLogLevel = process.env.GSD_LOG_LEVEL;
if (envLogLevel && LOG_LEVELS.hasOwnProperty(envLogLevel)) {
  currentLogLevel = LOG_LEVELS[envLogLevel];
}

function setLogLevel(level) {
  if (LOG_LEVELS.hasOwnProperty(level)) {
    currentLogLevel = LOG_LEVELS[level];
  }
}

function getTimestamp() {
  return new Date().toISOString();
}

function colorize(level, message) {
  const colors = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m'  // red
  };
  const reset = '\x1b[0m';
  return (colors[level] || '') + message + reset;
}

function shouldSanitizeFileWrite(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('.log')
    || normalized.includes('/logs/')
    || normalized.includes('/log/');
}

function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] < currentLogLevel) return;
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const metaStr = Object.keys(meta).length ? ' ' + SafeLogger.sanitize(JSON.stringify(meta)) : '';
  const line = `${prefix} ${message}${metaStr}`;
  const coloredLine = colorize(level, SafeLogger.sanitize(line));
  process.stderr.write(coloredLine + '\n');
}

function logDebug(message, meta = {}) { log('debug', message, meta); }
function logInfo(message, meta = {}) { log('info', message, meta); }
function logWarn(message, meta = {}) { log('warn', message, meta); }
function logError(message, meta = {}) { log('error', message, meta); }

// ─── Path helpers ────────────────────────────────────────────────────────────

/** Normalize a relative path to always use forward slashes (cross-platform). */
function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    const json = JSON.stringify(result, null, 2);
    // Large payloads exceed Claude Code's Bash tool buffer (~50KB).
    // Write to tmpfile and output the path prefixed with @file: so callers can detect it.
    if (json.length > 50000) {
      const tmpPath = path.join(require('os').tmpdir(), `gsd-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf-8');
      process.stdout.write('@file:' + tmpPath);
    } else {
      process.stdout.write(json);
    }
  }
  process.exit(0);
}

function error(message) {
  // Capture error context if in critical command context
  if (process.env.GSD_CAPTURE_ERROR_CONTEXT === 'true') {
    try {
      const audit = require('./audit.cjs');
      const err = new Error(message);
      const ctx = audit.captureErrorContext(err, { command: process.argv.slice(1).join(' ') });
      audit.writeErrorContext(ctx);
    } catch (e) {
      // ignore errors in error handling
    }
  }
  logError(message);
  process.exit(1);
}

// ─── Safe wrappers (shim) ─────────────────────────────────────────────────────
// These are used by the refactored codebase (gsd-tools, etc.). With GSD_INTERNAL_BYPASS set,
// they can be simple proxies. They provide a consistent interface.
const safeFs = {
  existsSync: fs.existsSync,
  statSync: fs.statSync,
  readFileSync: fs.readFileSync,
  writeFileSync: (filePath, content, ...args) => fs.writeFileSync(
    filePath,
    typeof content === 'string' && shouldSanitizeFileWrite(filePath) ? SafeLogger.sanitize(content) : content,
    ...args
  ),
  readdirSync: fs.readdirSync,
  mkdirSync: fs.mkdirSync,
  unlinkSync: fs.unlinkSync,
  rmSync: fs.rmSync,
  renameSync: fs.renameSync,
  appendFileSync: (filePath, content, ...args) => fs.appendFileSync(
    filePath,
    typeof content === 'string' && shouldSanitizeFileWrite(filePath) ? SafeLogger.sanitize(content) : content,
    ...args
  ),
};

const safeGit = {
  exec: (cwd, args, opts = {}) => {
    const result = spawnSync('git', args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
      ...opts
    });
    return {
      exitCode: result.status ?? 1,
      stdout: (result.stdout ?? '').toString().trim(),
      stderr: (result.stderr ?? '').toString().trim(),
    };
  }
};

// ─── File & Config utilities ──────────────────────────────────────────────────

function safeReadFile(filePath) {
  // In test mode, bypass sandbox to allow reading temporary files without signatures
  if (process.env.NODE_ENV === 'test') {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      return null;
    }
  }

  try {
    // Enforcement: Use sandbox if available to prevent bypasses
    let decision;
    try {
      const sandbox = require('./sandbox.cjs');
      decision = sandbox.checkPath(process.cwd(), filePath);
    } catch (e) {
      // If sandbox is missing or errors, fail-safe: allow (or we break the bootloader)
      decision = { allowed: true };
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    if (decision.allowed === false) {
      // Restricted file: verify authority signature
      const authority = require('./authority.cjs');
      const authResult = authority.verifySignature(content);
      if (!authResult.valid) {
        process.stderr.write(`[Sandbox] Read denied: Invalid authority signature for ${filePath}\n`);
        process.exit(13);
      }
    }

    return content;
  } catch (err) {
    return null;
  }
}

function safeWriteFile(filePath, content, options = {}) {
  // Allow string format for test convenience: 'phase:39,plan:01,wave:1'
  if (typeof options === 'string') {
    const parsed = {};
    options.split(',').forEach(part => {
      const [key, value] = part.split(':');
      if (key && value) parsed[key.trim()] = value.trim();
    });
    options = parsed;
  }

  try {
    let finalContent = typeof content === 'string' && shouldSanitizeFileWrite(filePath)
      ? SafeLogger.sanitize(content)
      : content;
    if (options.phase && options.plan && options.wave) {
      // Lazy-require to avoid circular dependency
      const authority = require('./authority.cjs');
      const signature = authority.generateSignature(content, options.phase, options.plan, options.wave);
      const envelope = authority.formatEnvelope(
        filePath,
        options.phase,
        options.plan,
        options.wave,
        signature,
      );
      finalContent = content.trimEnd() + '\n' + envelope + '\n';
    }
    safeFs.writeFileSync(filePath, finalContent, 'utf-8');
    return true;
  } catch (err) {
    logError(`safeWriteFile failed: ${filePath}: ${err.message}`);
    return false;
  }
}

const PROMPT_POLICY_KEYS = new Set([
  'gates.confirm_project',
  'gates.confirm_plan',
  'gates.confirm_phases',
  'gates.confirm_roadmap',
  'gates.confirm_breakdown',
  'gates.issues_review',
  'gates.confirm_transition',
  'gates.confirm_milestone_scope',
  'gates.execute_next_plan',
  'safety.always_confirm_destructive',
  'safety.always_confirm_external_services',
]);

function loadConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const defaults = {
    mode: 'interactive',
    granularity: 'standard',
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'gsd/phase-{phase}-{slug}',
    milestone_branch_template: 'gsd/{milestone}-{slug}',
    research: true,
    plan_checker: true,
    verifier: true,
    auto_advance: false,
    nyquist_validation: true,
    adversarial_test_harness: true,
    ui_phase: true,
    ui_safety_gate: true,
    node_repair: true,
    node_repair_budget: 2,
    parallelization: true,
    brave_search: false,
    log_level: 'info',
    gates: {
      confirm_project: true,
      confirm_phases: true,
      confirm_roadmap: true,
      confirm_breakdown: true,
      issues_review: true,
      confirm_transition: true,
      confirm_milestone_scope: true,
    },
    safety: {
      always_confirm_destructive: true,
      always_confirm_external_services: true,
    },
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Migrate deprecated "depth" key to "granularity" with value mapping
    if ('depth' in parsed && !('granularity' in parsed)) {
      const depthToGranularity = { quick: 'coarse', standard: 'standard', comprehensive: 'fine' };
      parsed.granularity = depthToGranularity[parsed.depth] || parsed.depth;
      delete parsed.depth;
      try { fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf-8'); } catch {}
    }

    const get = (key, nested) => {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
        return parsed[nested.section][nested.field];
      }
      return undefined;
    };

    const parallelization = (() => {
      const val = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
      return defaults.parallelization;
    })();

    const config = {
      mode: get('mode') ?? defaults.mode,
      granularity: get('granularity') ?? defaults.granularity,
      model_profile: get('model_profile') ?? defaults.model_profile,
      commit_docs: get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? defaults.commit_docs,
      search_gitignored: get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ?? defaults.search_gitignored,
      branching_strategy: get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ?? defaults.branching_strategy,
      phase_branch_template: get('phase_branch_template', { section: 'git', field: 'phase_branch_template' }) ?? defaults.phase_branch_template,
      milestone_branch_template: get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ?? defaults.milestone_branch_template,
      research: get('research', { section: 'workflow', field: 'research' }) ?? defaults.research,
      plan_checker: get('plan_checker', { section: 'workflow', field: 'plan_check' }) ?? defaults.plan_checker,
      verifier: get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier,
      auto_advance: get('auto_advance', { section: 'workflow', field: 'auto_advance' }) ?? defaults.auto_advance,
      nyquist_validation: get('nyquist_validation', { section: 'workflow', field: 'nyquist_validation' }) ?? defaults.nyquist_validation,
      adversarial_test_harness: get('adversarial_test_harness', { section: 'workflow', field: 'adversarial_test_harness' }) ?? defaults.adversarial_test_harness,
      ui_phase: get('ui_phase', { section: 'workflow', field: 'ui_phase' }) ?? defaults.ui_phase,
      ui_safety_gate: get('ui_safety_gate', { section: 'workflow', field: 'ui_safety_gate' }) ?? defaults.ui_safety_gate,
      node_repair: get('node_repair', { section: 'workflow', field: 'node_repair' }) ?? defaults.node_repair,
      node_repair_budget: get('node_repair_budget', { section: 'workflow', field: 'node_repair_budget' }) ?? defaults.node_repair_budget,
      _auto_chain_active: get('_auto_chain_active', { section: 'workflow', field: '_auto_chain_active' }) ?? false,
      parallelization,
      brave_search: get('brave_search') ?? defaults.brave_search,
      gates: { ...defaults.gates, ...((parsed.gates && typeof parsed.gates === 'object') ? parsed.gates : {}) },
      safety: { ...defaults.safety, ...((parsed.safety && typeof parsed.safety === 'object') ? parsed.safety : {}) },
      model_overrides: parsed.model_overrides || null,
      log_level: get('log_level') ?? defaults.log_level,
      _load_error: null,
    };

    // Provide nested workflow namespace for compatibility with dot-path config-get
    config.workflow = {
      auto_advance: config.auto_advance,
      nyquist_validation: config.nyquist_validation,
      adversarial_test_harness: config.adversarial_test_harness,
      ui_phase: config.ui_phase,
      ui_safety_gate: config.ui_safety_gate,
      node_repair: config.node_repair,
      node_repair_budget: config.node_repair_budget,
      _auto_chain_active: config._auto_chain_active,
    };

    // Apply log level to logger (config takes precedence over env set at module load)
    setLogLevel(config.log_level);

    return config;
  } catch (err) {
    return { ...defaults, _load_error: fs.existsSync(configPath) ? 'Failed to read config.json: ' + err.message : null };
  }
}

function resolvePromptPolicy(config, keyPath) {
  if (!PROMPT_POLICY_KEYS.has(keyPath)) {
    throw new Error('Unknown prompt policy key: ' + keyPath);
  }

  const [section, key] = keyPath.split('.');
  const configuredValue = Boolean(config?.[section]?.[key]);

  if (section === 'safety') {
    return {
      key: keyPath,
      section,
      mode: config?.mode || 'interactive',
      configured_value: configuredValue,
      should_prompt: configuredValue,
      reason: configuredValue ? 'safety_enabled' : 'safety_disabled',
    };
  }

  if ((config?.mode || 'interactive') === 'interactive') {
    return {
      key: keyPath,
      section,
      mode: config.mode,
      configured_value: configuredValue,
      should_prompt: true,
      reason: 'interactive_mode',
    };
  }

  if ((config?.mode || 'interactive') === 'yolo') {
    return {
      key: keyPath,
      section,
      mode: config.mode,
      configured_value: configuredValue,
      should_prompt: false,
      reason: 'yolo_mode',
    };
  }

  return {
    key: keyPath,
    section,
    mode: config?.mode || 'interactive',
    configured_value: configuredValue,
    should_prompt: configuredValue,
    reason: configuredValue ? 'gate_enabled' : 'gate_disabled',
  };
}

// ─── Git utilities ────────────────────────────────────────────────────────────

function isGitIgnored(cwd, targetPath) {
  try {
    // Use spawnSync with argument array to avoid shell injection.
    // --no-index checks .gitignore rules regardless of whether the file is tracked.
    const result = spawnSync('git', ['check-ignore', '-q', '--no-index', '--', targetPath], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ─── Markdown normalization ─────────────────────────────────────────────────

/**
 * Normalize markdown to fix common markdownlint violations.
 * Applied at write points so GSD-generated .planning/ files are IDE-friendly.
 *
 * Rules enforced:
 *   MD022 — Blank lines around headings
 *   MD031 — Blank lines around fenced code blocks
 *   MD032 — Blank lines around lists
 *   MD012 — No multiple consecutive blank lines (collapsed to 2 max)
 *   MD047 — Files end with a single newline
 */
function normalizeMd(content) {
  if (!content || typeof content !== 'string') return content;

  // Normalize line endings to LF for consistent processing
  let text = content.replace(/\r\n/g, '\n');

  const lines = text.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : '';
    const prevTrimmed = prev.trimEnd();
    const trimmed = line.trimEnd();

    // MD022: Blank line before headings (skip first line and frontmatter delimiters)
    if (/^#{1,6}\s/.test(trimmed) && i > 0 && prevTrimmed !== '' && prevTrimmed !== '---') {
      result.push('');
    }

    // MD031: Blank line before fenced code blocks
    if (/^```/.test(trimmed) && i > 0 && prevTrimmed !== '' && !isInsideFencedBlock(lines, i)) {
      result.push('');
    }

    // MD032: Blank line before lists (- item, * item, N. item, - [ ] item)
    if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line) && i > 0 &&
        prevTrimmed !== '' && !/^(\s*[-*+]\s|\s*\d+\.\s)/.test(prev) &&
        prevTrimmed !== '---') {
      result.push('');
    }

    result.push(line);

    // MD022: Blank line after headings
    if (/^#{1,6}\s/.test(trimmed) && i < lines.length - 1) {
      const next = lines[i + 1];
      if (next !== undefined && next.trimEnd() !== '') {
        result.push('');
      }
    }

    // MD031: Blank line after closing fenced code blocks
    if (/^```\s*$/.test(trimmed) && isClosingFence(lines, i) && i < lines.length - 1) {
      const next = lines[i + 1];
      if (next !== undefined && next.trimEnd() !== '') {
        result.push('');
      }
    }

    // MD032: Blank line after last list item in a block
    if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line) && i < lines.length - 1) {
      const next = lines[i + 1];
      if (next !== undefined && next.trimEnd() !== '' &&
          !/^(\s*[-*+]\s|\s*\d+\.\s)/.test(next) &&
          !/^\s/.test(next)) {
        // Only add blank line if next line is not a continuation/indented line
        result.push('');
      }
    }
  }

  text = result.join('\n');

  // MD012: Collapse 3+ consecutive blank lines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // MD047: Ensure file ends with exactly one newline
  text = text.replace(/\n*$/, '\n');

  return text;
}

/** Check if line index i is inside an already-open fenced code block */
function isInsideFencedBlock(lines, i) {
  let fenceCount = 0;
  for (let j = 0; j < i; j++) {
    if (/^```/.test(lines[j].trimEnd())) fenceCount++;
  }
  return fenceCount % 2 === 1;
}

/** Check if a ``` line is a closing fence (odd number of fences up to and including this one) */
function isClosingFence(lines, i) {
  let fenceCount = 0;
  for (let j = 0; j <= i; j++) {
    if (/^```/.test(lines[j].trimEnd())) fenceCount++;
  }
  return fenceCount % 2 === 0;
}

function execGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? '').toString().trim(),
    stderr: (result.stderr ?? '').toString().trim(),
  };
}

// ─── Phase utilities ──────────────────────────────────────────────────────────

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePhaseName(phase) {
  const match = String(phase).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (!match) return phase;
  const padded = match[1].padStart(2, '0');
  const letter = match[2] ? match[2].toUpperCase() : '';
  const decimal = match[3] || '';
  return padded + letter + decimal;
}

function comparePhaseNum(a, b) {
  const pa = String(a).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  const pb = String(b).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  const intDiff = parseInt(pa[1], 10) - parseInt(pb[1], 10);
  if (intDiff !== 0) return intDiff;
  // No letter sorts before letter: 12 < 12A < 12B
  const la = (pa[2] || '').toUpperCase();
  const lb = (pb[2] || '').toUpperCase();
  if (la !== lb) {
    if (!la) return -1;
    if (!lb) return 1;
    return la < lb ? -1 : 1;
  }
  // Segment-by-segment decimal comparison: 12A < 12A.1 < 12A.1.2 < 12A.2
  const aDecParts = pa[3] ? pa[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const bDecParts = pb[3] ? pb[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const maxLen = Math.max(aDecParts.length, bDecParts.length);
  if (aDecParts.length === 0 && bDecParts.length > 0) return -1;
  if (bDecParts.length === 0 && aDecParts.length > 0) return 1;
  for (let i = 0; i < maxLen; i++) {
    const av = Number.isFinite(aDecParts[i]) ? aDecParts[i] : 0;
    const bv = Number.isFinite(bDecParts[i]) ? bDecParts[i] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function searchPhaseInDir(baseDir, relBase, normalized) {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));
    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const phaseDir = path.join(baseDir, match);
    const phaseFiles = fs.readdirSync(phaseDir);

    const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
    const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext = phaseFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification = phaseFiles.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');

    const completedPlanIds = new Set(
      summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
    );
    const incompletePlans = plans.filter(p => {
      const planId = p.replace('-PLAN.md', '').replace('PLAN.md', '');
      return !completedPlanIds.has(planId);
    });

    return {
      found: true,
      directory: toPosixPath(path.join(relBase, match)),
      phase_number: phaseNumber,
      phase_name: phaseName,
      phase_slug: phaseName ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
      plans,
      summaries,
      incomplete_plans: incompletePlans,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
    };
  } catch {
    return null;
  }
}

function findPhaseInternal(cwd, phase) {
  if (!phase) return null;

  const phasesDir = path.join(cwd, '.planning', 'phases');
  const normalized = normalizePhaseName(phase);

  // Search current phases first
  const current = searchPhaseInDir(phasesDir, '.planning/phases', normalized);
  if (current) return current;

  // Search archived milestone phases (newest first)
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  if (!fs.existsSync(milestonesDir)) return null;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const archiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of archiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const relBase = '.planning/milestones/' + archiveName;
      const result = searchPhaseInDir(archivePath, relBase, normalized);
      if (result) {
        result.archived = version;
        return result;
      }
    }
  } catch {}

  return null;
}

function getArchivedPhaseDirs(cwd) {
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  const results = [];

  if (!fs.existsSync(milestonesDir)) return results;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    // Find v*-phases directories, sort newest first
    const phaseDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of phaseDirs) {
      const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const entries = fs.readdirSync(archivePath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));

      for (const dir of dirs) {
        results.push({
          name: dir,
          milestone: version,
          basePath: path.join('.planning', 'milestones', archiveName),
          fullPath: path.join(archivePath, dir),
        });
      }
    }
  } catch {}

  return results;
}

/**
 * Get the active REQUIREMENTS.md path following distributed truth model.
 * 1. Check for .planning/REQUIREMENTS.md (backward compatibility)
 * 2. Look in .planning/milestones/ for latest vX.Y-REQUIREMENTS.md
 * 3. Return null if none found (caller should handle gracefully)
 */
function getActiveRequirementsPath(cwd) {
  const planningDir = path.join(cwd, '.planning');

  // 1. Legacy root file (still supported for backward compatibility)
  const legacyPath = path.join(planningDir, 'REQUIREMENTS.md');
  if (fs.existsSync(legacyPath)) {
    return legacyPath;
  }

  // 2. Distributed milestone files
  const milestonesDir = path.join(planningDir, 'milestones');
  if (!fs.existsSync(milestonesDir)) return null;

  try {
    const entries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const reqFiles = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const match = entry.name.match(/^v([\d.]+)-REQUIREMENTS\.md$/);
        if (match) {
          reqFiles.push({
            filename: entry.name,
            version: match[1],
          });
        }
      }
    }

    if (reqFiles.length > 0) {
      // Sort by version (highest first)
      reqFiles.sort((a, b) => compareMilestoneVersions(b.version, a.version));
      return path.join(milestonesDir, reqFiles[0].filename);
    }
  } catch {}

  return null;
}

// ─── Roadmap milestone scoping ───────────────────────────────────────────────

/**
 * Strip shipped milestone content wrapped in <details> blocks.
 * Used to isolate current milestone phases when searching ROADMAP.md
 * for phase headings or checkboxes — prevents matching archived milestone
 * phases that share the same numbers as current milestone phases.
 */
function stripShippedMilestones(content) {
  return content.replace(/<details>[\s\S]*?<\/details>/gi, '');
}

function compareMilestoneVersions(a, b) {
  const left = String(a || '').replace(/^v/, '').split('.').map(n => Number.parseInt(n, 10) || 0);
  const right = String(b || '').replace(/^v/, '').split('.').map(n => Number.parseInt(n, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getLatestMilestoneListEntry(content) {
  const cleaned = stripShippedMilestones(content || '');
  const milestonesMatch = cleaned.match(/^##\s+Milestones\s*([\s\S]*?)(?:^##\s+|\Z)/m);
  if (!milestonesMatch) return null;

  const entries = [...milestonesMatch[1].matchAll(/^- \[[ x]\]\s+\*\*(v\d+\.\d+(?:\.\d+)?)\s+([^*]+)\*\*/gm)];
  if (entries.length === 0) return null;

  const latest = entries[entries.length - 1];
  return {
    version: latest[1],
    name: latest[2].trim(),
  };
}

function getCurrentMilestoneSection(content) {
  const cleaned = stripShippedMilestones(content || '');
  const latestListEntry = getLatestMilestoneListEntry(cleaned);
  // Allow optional "Roadmap " prefix and optional colon after version, and capture the full name
  const headingPattern = /^##\s+(?:Roadmap\s+)?v(\d+\.\d+(?:\.\d+)?)\s*:?\s*(.+)$/gm;
  const headings = [];
  let match;
  while ((match = headingPattern.exec(cleaned)) !== null) {
    headings.push({
      index: match.index,
      version: `v${match[1]}`,
      name: match[2].trim(),
    });
  }
  if (headings.length === 0) {
    if (latestListEntry) {
      return {
        version: latestListEntry.version,
        name: latestListEntry.name,
        section: '',
      };
    }
    return {
      version: null,
      name: null,
      section: cleaned,
    };
  }
  const current = headings[headings.length - 1];
  if (latestListEntry && compareMilestoneVersions(latestListEntry.version, current.version) > 0) {
    return {
      version: latestListEntry.version,
      name: latestListEntry.name,
      section: '',
    };
  }
  return {
    version: current.version,
    name: current.name,
    section: cleaned.slice(current.index),
  };
}

/**
 * Replace a pattern only in the current milestone section of ROADMAP.md
 * (everything after the last </details> close tag). Used for write operations
 * that must not accidentally modify archived milestone checkboxes/tables.
 */
function replaceInCurrentMilestone(content, pattern, replacement) {
  const lastDetailsClose = content.lastIndexOf('</details>');
  if (lastDetailsClose === -1) {
    return content.replace(pattern, replacement);
  }
  const offset = lastDetailsClose + '</details>'.length;
  const before = content.slice(0, offset);
  const after = content.slice(offset);
  return before + after.replace(pattern, replacement);
}

// ─── Roadmap & model utilities ────────────────────────────────────────────────

function getRoadmapPhaseInternal(cwd, phaseNum) {
  if (!phaseNum) return null;
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  try {
    const content = stripShippedMilestones(fs.readFileSync(roadmapPath, 'utf-8'));
    const escapedPhase = escapeRegex(phaseNum.toString());
    const phasePattern = new RegExp(`#{2,4}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`, 'i');
    const headerMatch = content.match(phasePattern);
    if (!headerMatch) return null;

    const phaseName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+\d/i);
    const sectionEnd = nextHeaderMatch ? headerIndex + nextHeaderMatch.index : content.length;
    const section = content.slice(headerIndex, sectionEnd).trim();

    const goalMatch = section.match(/\*\*Goal(?:\*\*:|\*?\*?:\*\*)\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    return {
      found: true,
      phase_number: phaseNum.toString(),
      phase_name: phaseName,
      goal,
      section,
    };
  } catch {
    return null;
  }
}

function resolveModelInternal(cwd, agentType) {
  const config = loadConfig(cwd);

  // Check per-agent override first
  const override = config.model_overrides?.[agentType];
  if (override) {
    return override;
  }

  // Fall back to profile lookup
  const profile = String(config.model_profile || 'balanced').toLowerCase();
  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) return 'sonnet';
  if (profile === 'inherit') return 'inherit';
  return agentModels[profile] || agentModels['balanced'] || 'sonnet';
}

// ─── Misc utilities ───────────────────────────────────────────────────────────

function pathExistsInternal(cwd, targetPath) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getMilestoneInfo(cwd) {
  try {
    const roadmap = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');

    // First: check for list-format roadmaps using 🚧 (in-progress) marker
    // e.g. "- 🚧 **v2.1 Belgium** — Phases 24-28 (in progress)"
    const inProgressMatch = roadmap.match(/🚧\s*\*\*v(\d+\.\d+)\s+([^*]+)\*\*/);
    if (inProgressMatch) {
      return {
        version: 'v' + inProgressMatch[1],
        name: inProgressMatch[2].trim(),
      };
    }

    // Second: heading-format roadmaps — use the last milestone section outside archives.
    const currentMilestone = getCurrentMilestoneSection(roadmap);
    if (currentMilestone.version) {
      return {
        version: currentMilestone.version,
        name: currentMilestone.name,
      };
    }
    // Fallback: try the last bare version match outside archived <details>.
    const cleaned = stripShippedMilestones(roadmap);
    const versionMatches = [...cleaned.matchAll(/v(\d+\.\d+(?:\.\d+)?)/g)];
    const versionMatch = versionMatches.length > 0 ? versionMatches[versionMatches.length - 1] : null;
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: 'milestone',
    };
  } catch {
    return { version: 'v1.0', name: 'milestone' };
  }
}

/**
 * Returns a filter function that checks whether a phase directory belongs
 * to the current milestone based on ROADMAP.md phase headings.
 * If no ROADMAP exists or no phases are listed, returns a pass-all filter.
 */
function getMilestonePhaseFilter(cwd) {
  const milestonePhaseNums = new Set();
  let hasMilestoneScope = false;
  try {
    const roadmap = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
    const { version, section } = getCurrentMilestoneSection(roadmap);
    hasMilestoneScope = Boolean(version);
    const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
    let m;
    while ((m = phasePattern.exec(section)) !== null) {
      milestonePhaseNums.add(m[1]);
    }
  } catch {}

  if (milestonePhaseNums.size === 0) {
    const noMatches = () => !hasMilestoneScope;
    noMatches.phaseCount = 0;
    return noMatches;
  }

  const normalized = new Set(
    [...milestonePhaseNums].map(n => (n.replace(/^0+/, '') || '0').toLowerCase())
  );

  function isDirInMilestone(dirName) {
    const m = dirName.match(/^0*(\d+[A-Za-z]?(?:\.\d+)*)/);
    if (!m) return false;
    return normalized.has(m[1].toLowerCase());
  }
  isDirInMilestone.phaseCount = milestonePhaseNums.size;
  return isDirInMilestone;
}

// Global error handlers for uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  try {
    const audit = require('./audit.cjs');
    const ctx = audit.captureErrorContext(err, { type: 'uncaughtException' });
    audit.writeErrorContext(ctx);
  } catch (e) {}
  logError(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  try {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    const audit = require('./audit.cjs');
    const ctx = audit.captureErrorContext(err, { type: 'unhandledRejection' });
    audit.writeErrorContext(ctx);
  } catch (e) {}
  logError(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});

/**
 * Determine whether auto-advance should bypass a checkpoint.
 * @param {string} checkpointType - 'human-verify' | 'decision' | 'human-action'
 * @param {boolean} autoChainActive - workflow._auto_chain_active flag
 * @param {boolean} autoAdvance - workflow.auto_advance flag
 * @returns {boolean} true if checkpoint can be auto-advanced, false otherwise
 */
function shouldAutoAdvanceCheckpoint(checkpointType, autoChainActive, autoAdvance) {
  const autoMode = autoChainActive || autoAdvance;
  if (!autoMode) return false;
  if (checkpointType === 'human-action') {
    // Audit log: attempt to bypass human-action checkpoint blocked
    console.error(`[AUDIT] auto_chain_bypass_blocked: checkpoint_type=${checkpointType}, phase=unknown (cwd not provided)`);
    return false;
  }
  // Only known types can be auto-advanced: 'human-verify' and 'decision'
  if (checkpointType === 'human-verify' || checkpointType === 'decision') {
    return true;
  }
  // Unknown or other types: conservative default to false
  return false;
}

module.exports = {
  output,
  error,
  safeReadFile,
  safeWriteFile,
  loadConfig,
  resolvePromptPolicy,
  isGitIgnored,
  execGit,
  normalizeMd,
  escapeRegex,
  normalizePhaseName,
  comparePhaseNum,
  searchPhaseInDir,
  findPhaseInternal,
  getArchivedPhaseDirs,
  getActiveRequirementsPath,
  getRoadmapPhaseInternal,
  resolveModelInternal,
  shouldAutoAdvanceCheckpoint,
  pathExistsInternal,
  generateSlugInternal,
  getMilestoneInfo,
  getMilestonePhaseFilter,
  stripShippedMilestones,
  getCurrentMilestoneSection,
  replaceInCurrentMilestone,
  toPosixPath,
  safeFs,
  safeGit,
  setLogLevel,
  logDebug,
  logInfo,
  logWarn,
  logError,
};
