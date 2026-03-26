#!/usr/bin/env node
/**
 * Analyze coverage gaps for critical modules
 * Reads coverage-summary.json and coverage-final.json
 * Outputs coverage-gaps.json with file, lines_pct, branches_pct, uncovered_branches (line numbers)
 */

const fs = require('fs');
const path = require('path');

const coverageDir = path.join(process.cwd(), 'coverage');
const finalPath = path.join(coverageDir, 'coverage-final.json');
const summaryPath = path.join(coverageDir, 'coverage-summary.json');
const gapsPath = path.join(process.cwd(), 'coverage-gaps.json');

if (!fs.existsSync(finalPath) || !fs.existsSync(summaryPath)) {
  console.error('Coverage files not found. Run coverage first.');
  process.exit(1);
}

const finalData = JSON.parse(fs.readFileSync(finalPath, 'utf-8'));
const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

const LINE_THRESHOLD = 85;
const BRANCH_THRESHOLD = 80;

const gaps = [];

// Iterate over summaryData (keys are absolute file paths)
for (const [absPath, summary] of Object.entries(summaryData)) {
  if (absPath === 'total') continue;

  const linesPct = summary.lines?.pct ?? 0;
  const branchesPct = summary.branches?.pct ?? 100;

  if (linesPct < LINE_THRESHOLD || branchesPct < BRANCH_THRESHOLD) {
    // Get detailed coverage for this file
    const fileData = finalData[absPath];
    const uncoveredBranches = [];

    if (fileData && fileData.branchMap && fileData.b) {
      for (const [branchId, branchInfo] of Object.entries(fileData.branchMap)) {
        const hitCounts = fileData.b[branchId];
        // hitCounts is an array; in c8 JSON it may be [count] or [falseCount, trueCount]
        // We assume branch is considered covered if any hit > 0
        // For uncovered, we check if the sum of counts is 0.
        const totalHits = Array.isArray(hitCounts) ? hitCounts.reduce((sum, c) => sum + c, 0) : 0;
        if (totalHits === 0) {
          uncoveredBranches.push(branchInfo.line);
        }
      }
    }

    // Deduplicate and sort
    const uniqueLines = [...new Set(uncoveredBranches)].sort((a, b) => a - b);

    gaps.push({
      file: path.basename(absPath),
      lines_pct: Math.round(linesPct * 100) / 100,
      branches_pct: Math.round(branchesPct * 100) / 100,
      uncovered_branches: uniqueLines
    });
  }
}

// Sort by lines_pct ascending
gaps.sort((a, b) => a.lines_pct - b.lines_pct);

// Write
fs.writeFileSync(gapsPath, JSON.stringify(gaps, null, 2));
console.log(`Generated coverage-gaps.json with ${gaps.length} undercovered module(s)`);
process.exit(0);
