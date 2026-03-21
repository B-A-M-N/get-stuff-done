#!/usr/bin/env node

/**
 * gsd-shell — Interceptor and sandbox for GSD shell commands.
 * 
 * This proof-of-concept shell interceptor demonstrates how to wrap 
 * arbitrary shell execution with security policies defined in sandbox.cjs.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const { checkPath } = require('./lib/sandbox.cjs');

// Get command and arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  process.exit(0);
}

const command = args[0];
const cmdArgs = args.slice(1);
const cwd = process.cwd();

// Analyze arguments for potential paths
// Simple POC: any argument that doesn't start with '-' is treated as a path.
for (const arg of cmdArgs) {
  if (!arg.startsWith('-')) {
    const check = checkPath(cwd, arg);
    if (!check.allowed) {
      console.error(`ERROR: Access to path "${arg}" denied. Reason: ${check.reason}`);
      process.exit(13);
    }
  }
}

// Special case: check if the command itself is targeting a denied path if it's a single argument command
// or if we're just checking the command's arguments.

// Execute the command if all checks passed
const result = spawnSync(command, cmdArgs, {
  stdio: 'inherit',
  shell: true
});

process.exit(result.status ?? 0);
