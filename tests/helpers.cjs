/**
 * GSD Tools Test Helpers
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS_PATH = path.join(__dirname, '..', 'get-stuff-done', 'bin', 'gsd-tools.cjs');
const { signFile } = require('../get-stuff-done/bin/lib/authority.cjs');
const CANONICAL_MEMORY_ENV_KEYS = [
  'GSD_MEMORY_MODE',
  'PGHOST',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
  'DATABASE_URL',
];

function signPlanningMarkdown(rootDir) {
  const planningDir = path.join(rootDir, '.planning');
  if (!fs.existsSync(planningDir)) return;

  const stack = [planningDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!/\.(md|ya?ml)$/i.test(entry.name)) continue;
      signFile(fullPath, '01', '01', '1');
    }
  }
}

/**
 * Run gsd-tools command.
 *
 * @param {string|string[]} args - Command string (shell-interpreted) or array
 *   of arguments (shell-bypassed via execFileSync, safe for JSON and dollar signs).
 * @param {string} cwd - Working directory.
 * @param {{ env?: Record<string, string> }} options - Optional child-process overrides.
 */
function runGsdTools(args, cwd = process.cwd(), options = {}) {
  const command = Array.isArray(args) ? args[0] : String(args).trim().split(/\s+/)[0];
  if (command === 'verify') {
    signPlanningMarkdown(cwd);
  }
  const execOptions = {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(options.env ? { env: { ...process.env, ...options.env } } : {}),
  };

  try {
    let result;
    if (Array.isArray(args)) {
      result = execFileSync(process.execPath, [TOOLS_PATH, ...args], execOptions);
    } else {
      result = execSync(`node "${TOOLS_PATH}" ${args}`, execOptions);
    }
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

// Create temp directory structure
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

// Create temp directory with initialized git repo and at least one commit
function createTempGitProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'drift'), { recursive: true });

  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'PROJECT.md'),
    '# Project\n\nTest project.\n'
  );
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Milestones\n\n'
  );
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    '# State\n'
  );
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'drift', 'latest-report.json'),
    JSON.stringify({
      generated_at: new Date().toISOString(),
      findings: [],
      summary: { active: 0 },
    }, null, 2)
  );
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'drift', 'latest-reconciliation.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      applied_changes: [],
      unchanged: [],
      reverification_required: [],
      summary: { critical: 0, major: 0, minor: 0 },
    }, null, 2)
  );

  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return tmpDir;
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function snapshotEnv(keys = CANONICAL_MEMORY_ENV_KEYS) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function buildCanonicalDegradedMemoryEnv(overrides = {}) {
  return {
    ...process.env,
    GSD_MEMORY_MODE: undefined,
    PGHOST: '127.0.0.1',
    PGPORT: '1',
    PGDATABASE: 'gsd_unavailable',
    PGUSER: 'gsd_unavailable',
    PGPASSWORD: 'gsd_unavailable',
    DATABASE_URL: '',
    ...overrides,
  };
}

function applyCanonicalDegradedMemoryEnv(overrides = {}) {
  const snapshot = snapshotEnv();
  const env = buildCanonicalDegradedMemoryEnv(overrides);
  for (const key of CANONICAL_MEMORY_ENV_KEYS) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return snapshot;
}

function parseTrailingJson(text) {
  const match = String(text).match(/(\{[\s\S]*\})\s*$/);
  if (!match) {
    throw new Error(`No JSON object found in output: ${text}`);
  }
  return JSON.parse(match[1]);
}

module.exports = {
  applyCanonicalDegradedMemoryEnv,
  buildCanonicalDegradedMemoryEnv,
  cleanup,
  createTempGitProject,
  createTempProject,
  parseTrailingJson,
  restoreEnv,
  runGsdTools,
  snapshotEnv,
  TOOLS_PATH,
};

// GSD-AUTHORITY: 80.1-01-1:ac4f79155222e07c6df96016bc255bd04f788d4b986c3bdf347f31673b1ec266
