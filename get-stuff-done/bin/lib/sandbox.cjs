/**
 * Sandbox — Context boundary enforcement
 *
 * Provides runtime checks to ensure orchestration remains within sanctioned
 * boundaries. Prevents accidental or malicious access to sensitive paths.
 */

const path = require('path');
const fs = require('fs');

const DENY_LIST = [
  '.planning/',
  '.env',
  '.git/',
  'node_modules/',
];

/**
 * Check if a path is allowed to be accessed/modified.
 *
 * @param {string} cwd The current working directory (project root usually)
 * @param {string} targetPath The path being checked
 * @returns {{ allowed: boolean, reason: string | null }}
 */
function checkPath(cwd, targetPath) {
  if (!targetPath) {
    return { allowed: false, reason: 'No path provided' };
  }

  // Resolve target path relative to cwd
  const absoluteCwd = path.resolve(cwd);
  const absoluteTarget = path.resolve(cwd, targetPath);

  // Ensure target is within cwd (basic jail)
  if (!absoluteTarget.startsWith(absoluteCwd)) {
    return { allowed: false, reason: 'Path is outside project root' };
  }

  // Get relative path from project root for pattern matching
  const relativePath = path.relative(absoluteCwd, absoluteTarget);

  // Check against deny-list
  for (const pattern of DENY_LIST) {
    // Normalize pattern
    const normalizedPattern = pattern.replace(/\/$/, ''); // Remove trailing slash for matching
    
    if (relativePath === normalizedPattern || 
        relativePath.startsWith(normalizedPattern + path.sep)) {
      return { allowed: false, reason: `Path "${targetPath}" is in the deny-list (${pattern})` };
    }
    
    // Also check if the pattern is a directory and the path is inside it
    if (pattern.endsWith('/') && relativePath.startsWith(normalizedPattern + '/')) {
        return { allowed: false, reason: `Path "${targetPath}" is inside a denied directory (${pattern})` };
    }
  }

  return { allowed: true, reason: null };
}

module.exports = {
  checkPath,
  DENY_LIST,
};
