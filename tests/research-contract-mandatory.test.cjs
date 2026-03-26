const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

describe('Research Contract Mandatory Verification', () => {
  let tempDir;
  const projectRoot = path.join(os.tmpdir(), `gsd-test-${Date.now()}`);
  const planningDir = path.join(projectRoot, '.planning', 'phases', '51-test');
  const contextPath = path.join(planningDir, '51-CONTEXT.md');
  const researchPath = path.join(planningDir, '51-RESEARCH.md');

  test('setUp', () => {
    // Create temporary project structure
    fs.mkdirSync(planningDir, { recursive: true });
    // Create a minimal CONTEXT.md with an unresolved ambiguity
    fs.writeFileSync(contextPath, `# Phase 51: Test

<decisions>
## Implementation Decisions
- None
</decisions>

<domain>
## Unresolved Ambiguities
- This is an ambiguity that must be addressed
</domain>
`);
    // Create a RESEARCH.md that does NOT address the ambiguity (violation)
    fs.writeFileSync(researchPath, `# Research

## Findings
Some findings.
`);
  });

  test('fails when research does not carry forward ambiguity', () => {
    const gsdToolsPath = path.resolve(process.cwd(), 'get-stuff-done/bin/gsd-tools.cjs');
    const result = spawnSync('node', [
      gsdToolsPath,
      'verify', 'research-contract',
      '51-CONTEXT.md', '--research', '51-RESEARCH.md'
    ], { cwd: planningDir, encoding: 'utf-8' });
    // Should exit with non-zero
    assert.notEqual(result.status, 0, 'Command should exit with non-zero status');
    const output = result.stdout + result.stderr;
    assert.ok(output.includes('Research Contract Violation') || result.stdout.includes('invalid'), 'Output should indicate failure');
  });

  test('passes when research addresses ambiguity', () => {
    // Modify RESEARCH.md to include carry-forward of the ambiguity
    fs.writeFileSync(researchPath, `# Research

## Findings
Some findings.

## Unresolved Ambiguities
- This is an ambiguity that must be addressed: we will defer to a later phase.
`);
    const gsdToolsPath = path.resolve(process.cwd(), 'get-stuff-done/bin/gsd-tools.cjs');
    const result = spawnSync('node', [
      gsdToolsPath,
      'verify', 'research-contract',
      '51-CONTEXT.md', '--research', '51-RESEARCH.md'
    ], { cwd: planningDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, 'Command should exit with status 0');
    assert.ok(result.stdout.includes('valid'), 'Output should indicate valid');
  });
});
