/**
 * Gate — Hard enforcement for prompt policy gates
 *
 * Converts soft `policy should-prompt` checks into hard exit-code enforcement
 * with tamper-evident pending/released file artifacts under .planning/gates/.
 *
 * Commands:
 *   gate enforce --key <key>   Exit 1 (write pending file) when gate is active; exit 0 when clear
 *   gate release --key <key>   Acknowledge gate — remove pending, write released artifact
 *   gate check --key <key>     Report gate state without modifying it
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, resolvePromptPolicy, output, error } = require('./core.cjs');
const sandbox = require('./sandbox.cjs');

/** Convert dotted policy key to a safe filename fragment (e.g. gates.confirm_roadmap → gates.confirm_roadmap) */
function keyToFilename(key) {
  return key.replace(/\./g, '_');
}

function gatesDir(cwd) {
  return path.join(cwd, '.planning', 'gates');
}

function pendingPath(cwd, key) {
  return path.join(gatesDir(cwd), `${keyToFilename(key)}-pending.json`);
}

function releasedPath(cwd, key) {
  return path.join(gatesDir(cwd), `${keyToFilename(key)}-released.json`);
}

/**
 * Check if a path is allowed by the sandbox.
 * Exits 0 if allowed, exits 13 if denied.
 */
function cmdGateCheckPath(cwd, targetPath, raw) {
  if (!targetPath) {
    error('Path argument required (e.g. --path .planning/STATE.md)');
  }

  const result = sandbox.checkPath(cwd, targetPath);

  if (!result.allowed) {
    const payload = { allowed: false, path: targetPath, reason: result.reason };
    if (raw) {
      process.stdout.write('denied');
    } else {
      process.stdout.write(JSON.stringify(payload, null, 2));
    }
    process.exit(13); // Exit code 13 as per plan
  } else {
    output({ allowed: true, path: targetPath, reason: null }, raw, 'allowed');
  }
}

/**
 * Resolve gate policy and enforce it via exit code.
 * - should_prompt: false → exit 0 (clear)
 * - should_prompt: true  → write pending artifact, exit 1 (blocked)
 *
 * Orchestrators should call `gate enforce` in an `if !` block:
 *   if ! node gsd-tools.cjs gate enforce --key gates.confirm_roadmap; then
 *     # Present banner, wait for human, then call gate release
 *   fi
 */
function cmdGateEnforce(cwd, key, options, raw) {
  if (typeof options === 'boolean' || options == null) {
    raw = options;
  }
  if (!key) {
    error('policy key required (e.g. gates.confirm_roadmap)');
  }

  let result;
  try {
    result = resolvePromptPolicy(loadConfig(cwd), key);
  } catch (err) {
    error(err.message);
  }

  if (result.should_prompt) {
    // Write pending artifact for audit trail
    const dir = gatesDir(cwd);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const record = {
        key,
        blocked_at: new Date().toISOString(),
        reason: result.reason,
      };
      fs.writeFileSync(pendingPath(cwd, key), JSON.stringify(record, null, 2), 'utf-8');
    } catch {
      // Non-fatal: enforce still exits 1 even if artifact write fails
    }

    // Output then exit 1 (hard stop)
    const payload = { blocked: true, key, reason: result.reason };
    if (raw) {
      process.stdout.write('blocked');
    } else {
      process.stdout.write(JSON.stringify(payload, null, 2));
    }
    process.exit(1);
  } else {
    output({ blocked: false, key, reason: result.reason }, raw, 'clear');
  }
}

/**
 * Release a gate after the human has responded.
 * Removes the pending file, writes a released artifact.
 * Safe to call even if no pending file exists (idempotent).
 */
function cmdGateRelease(cwd, key, options, raw) {
  if (typeof options === 'boolean' || options == null) {
    raw = options;
  }
  if (!key) {
    error('policy key required');
  }

  const dir = gatesDir(cwd);
  const pending = pendingPath(cwd, key);
  const released = releasedPath(cwd, key);

  let pendingData = {};
  const wasBlocked = fs.existsSync(pending);
  if (wasBlocked) {
    try { pendingData = JSON.parse(fs.readFileSync(pending, 'utf-8')); } catch {}
    try { fs.unlinkSync(pending); } catch {}
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
    const record = {
      key,
      blocked_at: pendingData.blocked_at || null,
      released_at: new Date().toISOString(),
      reason: pendingData.reason || null,
    };
    fs.writeFileSync(released, JSON.stringify(record, null, 2), 'utf-8');
  } catch (err) {
    error(`Failed to write released artifact: ${err.message}`);
  }

  output({ released: true, key, was_blocked: wasBlocked }, raw, 'released');
}

/**
 * Check gate state without modifying it.
 * Returns { clear, pending, released, key }.
 * clear: true = no pending gate, safe to continue.
 */
function cmdGateCheck(cwd, key, raw) {
  if (!key) {
    error('policy key required');
  }

  const hasPending = fs.existsSync(pendingPath(cwd, key));
  const hasReleased = fs.existsSync(releasedPath(cwd, key));

  let releasedAt = null;
  if (hasReleased) {
    try {
      const data = JSON.parse(fs.readFileSync(releasedPath(cwd, key), 'utf-8'));
      releasedAt = data.released_at || null;
    } catch {}
  }

  output({
    clear: !hasPending,
    pending: hasPending,
    released: hasReleased,
    released_at: releasedAt,
    key,
  }, raw, !hasPending ? 'clear' : 'pending');
}

module.exports = {
  cmdGateEnforce,
  cmdGateRelease,
  cmdGateCheck,
  cmdGateCheckPath,
};
