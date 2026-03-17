/**
 * GSD Tools Tests - Summary Contract (Phase 20)
 *
 * This test validates that real-world SUMMARY.md artifacts conform to the
 * executionSummarySchema contract.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { executionSummarySchema } = require('../get-stuff-done/bin/lib/artifact-schema.cjs');
const { extractFrontmatter } = require('../get-stuff-done/bin/lib/frontmatter.cjs');

describe('SUMMARY.md contract validation', () => {
  test('Phase 19 Plan 01 Summary conforms to schema', () => {
    const summaryPath = path.join(__dirname, '..', '.planning', 'phases', '19-workflow-surface-hardening', '19-01-SUMMARY.md');
    
    if (!fs.existsSync(summaryPath)) {
      console.warn('⚠️ Phase 19 summary not found, skipping specific file test.');
      return;
    }

    const content = fs.readFileSync(summaryPath, 'utf-8');
    const fm = extractFrontmatter(content);
    
    const result = executionSummarySchema.safeParse(fm);
    
    if (!result.success) {
      console.error('Schema validation failed for Phase 19 Summary:', JSON.stringify(result.error.issues, null, 2));
    }
    
    assert.strictEqual(result.success, true, 'Phase 19 Summary should be valid according to executionSummarySchema');
  });

  test('rejects summary with missing mandatory fields', () => {
    const invalidFm = {
      phase: '01',
      // plan: '01', // missing
      subsystem: 'auth',
      tags: ['jwt'],
      provides: ['nothing'],
      duration: '10min',
      completed: '2024-01-01'
    };

    const result = executionSummarySchema.safeParse(invalidFm);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.path.includes('plan')));
  });
});
