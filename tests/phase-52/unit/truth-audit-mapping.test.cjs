const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { TruthAuditor } = require('../../../packages/gsd-tools/src/audit/TruthAuditor');

test('TruthAuditor loads requirements and finds evidence mappings', () => {
  const auditor = new TruthAuditor({ rootDir: path.join(__dirname, '..', '..', '..') });
  const requirements = auditor.loadRequirements();
  assert.ok(requirements.find(item => item.id === 'QUALITY-01'));
  assert.ok(auditor.findImplementation('QUALITY-02').includes('packages/gsd-tools/src/logging/SafeLogger.js'));
  assert.ok(auditor.findTests('QUALITY-04').includes('tests/phase-52/integration/audit-kill.test.cjs'));
});

test('TruthAuditor returns empty arrays for unknown requirements', () => {
  const auditor = new TruthAuditor({ rootDir: path.join(__dirname, '..', '..', '..') });
  assert.deepEqual(auditor.findImplementation('UNKNOWN-01'), []);
  assert.deepEqual(auditor.findTests('UNKNOWN-01'), []);
});

test('TruthAuditor generateAudit marks proven and unproven requirements', () => {
  const rootDir = path.join(__dirname, '..', '..', '..');
  const auditor = new TruthAuditor({ rootDir });
  const audit = auditor.generateAudit();

  assert.ok(audit.total_requirements >= audit.proven);
  assert.ok(Array.isArray(audit.failures));
  assert.ok(audit.requirements.some((item) => item.id === 'QUALITY-01'));
});

test('TruthAuditor handles missing requirements file and missing enforcement markers', () => {
  const rootDir = path.join(__dirname, '..', '..', '..');
  const auditor = new TruthAuditor({
    rootDir,
    requirementsPath: path.join(rootDir, '.planning', 'DOES-NOT-EXIST.md'),
    mapping: {
      'QUALITY-X': {
        implementation: ['package.json'],
        tests: ['tests/phase-52/unit/truth-audit-mapping.test.cjs'],
        enforcementMarkers: ['definitely-not-present'],
      },
    },
  });

  assert.deepEqual(auditor.loadRequirements(), []);
  assert.strictEqual(auditor.assessEnforcement('QUALITY-X', ['package.json']), 'missing');
  assert.deepEqual(auditor.generateAudit(), {
    total_requirements: 0,
    proven: 0,
    unproven: 0,
    failures: [],
    requirements: [],
  });
});
