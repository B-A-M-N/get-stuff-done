/**
 * GSD Next Step — scratch pad for cross-session command continuity
 *
 * Persists the recommended next command to `.planning/.gsd-next.json`.
 * A UserPromptSubmit hook reads and consumes this file in fresh sessions,
 * injecting the suggestion into Claude's context automatically.
 *
 * Usage:
 *   next-step set <command> [--hint <text>]   Write next command to scratch pad
 *   next-step get                             Read scratch pad (JSON, non-destructive)
 *   next-step consume                         Read, output for hook injection, delete
 *   next-step clear                           Delete scratch pad silently
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { output, error } = require('./core.cjs');

const SCRATCH_FILE = '.planning/.gsd-next.json';

function getScratchPath(cwd) {
  return path.join(cwd, SCRATCH_FILE);
}

/** Write next command to scratch pad */
function cmdSet(cwd, command, hint, raw) {
  if (!command) {
    error('Usage: next-step set <command> [--hint <text>]');
  }

  const scratchPath = getScratchPath(cwd);
  const planningDir = path.dirname(scratchPath);

  if (!fs.existsSync(planningDir)) {
    output({ ok: false, message: 'No .planning/ directory found — not a GSD project' }, raw, 'error');
    return;
  }

  const record = {
    command,
    hint: hint || null,
    written_at: new Date().toISOString(),
  };

  fs.writeFileSync(scratchPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
  output({ ok: true, command, hint: hint || null, path: SCRATCH_FILE }, raw, 'ok');
}

/** Read scratch pad without deleting */
function cmdGet(cwd, raw) {
  const scratchPath = getScratchPath(cwd);

  if (!fs.existsSync(scratchPath)) {
    output({ ok: true, found: false, command: null, hint: null }, raw, 'empty');
    return;
  }

  let record;
  try {
    record = JSON.parse(fs.readFileSync(scratchPath, 'utf8'));
  } catch {
    output({ ok: false, found: false, message: 'Scratch pad file is malformed' }, raw, 'error');
    return;
  }

  output({ ok: true, found: true, ...record }, raw, 'ok');
}

/**
 * Consume scratch pad — read, emit hook injection text to stdout, delete.
 * Called by the UserPromptSubmit hook on session start.
 * Outputs nothing if no scratch pad exists (silent no-op for normal sessions).
 */
function cmdConsume(cwd, raw) {
  const scratchPath = getScratchPath(cwd);

  if (!fs.existsSync(scratchPath)) {
    // No scratch pad — do not output anything; hook is a no-op
    return;
  }

  let record;
  try {
    record = JSON.parse(fs.readFileSync(scratchPath, 'utf8'));
  } catch {
    // Malformed — delete and silently bail
    try { fs.unlinkSync(scratchPath); } catch { /* ignore */ }
    return;
  }

  // Delete before outputting so a crash doesn't re-inject on next prompt
  try { fs.unlinkSync(scratchPath); } catch { /* ignore */ }

  const hint = record.hint ? `\n${record.hint}` : '';

  // Parse phase number and base command from suggested command for redirect resolution
  const cmdMatch = record.command.match(/\/gsd:(\S+)\s+(\S+)/);
  const baseCmd = cmdMatch ? cmdMatch[1] : '';
  const phaseArg = cmdMatch ? cmdMatch[2] : '';
  const redirectNote = phaseArg
    ? [
        '',
        'Redirect examples (user overrides suggested command):',
        `  "Continue but research"  → /gsd:research-phase ${phaseArg}`,
        `  "Discuss first"          → /gsd:discuss-phase ${phaseArg}`,
        `  "Execute directly"       → /gsd:execute-phase ${phaseArg}`,
        `  "Skip to next milestone" → /gsd:complete-milestone`,
        'For any other redirect, derive the correct GSD command from user intent and phase number.',
      ].join('\n')
    : '';

  // This text is consumed by Claude Code as injected context (UserPromptSubmit hook stdout)
  const injection = [
    '<gsd-scratch-pad>',
    `GSD suggested next: ${record.command}${hint}`,
    '',
    'This was saved at the end of the previous phase before /clear.',
    "ROUTING RULE: Whatever the user says first in this session, check if it aligns with,",
    'redirects, or overrides the suggested command above — then execute the right one.',
    `  If the user confirms or says nothing specific → run: ${record.command}`,
    `  If the user specifies a DIFFERENT next action → derive the correct /gsd: command`,
    `    and run that instead (do NOT run ${record.command} in that case).${redirectNote}`,
    '</gsd-scratch-pad>',
  ].join('\n');

  // raw mode: output JSON for programmatic use; default: plain text for hook injection
  if (raw) {
    output({ ok: true, found: true, injected: injection, ...record }, raw, 'ok');
  } else {
    process.stdout.write(injection + '\n');
  }
}

/** Delete scratch pad silently */
function cmdClear(cwd, raw) {
  const scratchPath = getScratchPath(cwd);
  if (fs.existsSync(scratchPath)) {
    fs.unlinkSync(scratchPath);
    output({ ok: true, cleared: true }, raw, 'ok');
  } else {
    output({ ok: true, cleared: false, message: 'Nothing to clear' }, raw, 'ok');
  }
}

module.exports = { cmdSet, cmdGet, cmdConsume, cmdClear };
