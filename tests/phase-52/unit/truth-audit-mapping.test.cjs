const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TruthAuditor } = require('../../../packages/gsd-tools/src/audit/TruthAuditor');

function writeFixture(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-audit-map-'));
  const requirementsPath = path.join(rootDir, '.planning', 'REQUIREMENTS.md');

  writeFixture(
    rootDir,
    '.planning/REQUIREMENTS.md',
    [
      'QUALITY-01: Coverage MUST stay above the hard threshold. | source: docs/quality.md',
      'QUALITY-02: Sanitization SHALL redact secrets before logging. | source: docs/logging.md',
      'QUALITY-03: Proof generation MUST reject tampered artifacts. | source: docs/proofs.md',
      '# QUALITY-88 @deprecated',
      'QUALITY-88: Deprecated requirement MUST be ignored. | source: docs/old.md',
      '',
    ].join('\n')
  );

  writeFixture(rootDir, 'src/coverage.js', 'if (coverage < 85) { throw new Error("coverage"); }\n');
  writeFixture(rootDir, 'src/logging.js', 'function sanitize() { return "[REDACTED]"; }\n');
  writeFixture(rootDir, 'src/logging-boundary.js', 'function writeLog() { return sanitize("secret"); }\n');
  writeFixture(rootDir, 'src/proofs.js', 'function verify() { throw new Error("tampered"); }\n');
  writeFixture(rootDir, 'tests/coverage.test.cjs', 'require("node:assert").ok(true);\n');
  writeFixture(rootDir, 'tests/logging.test.cjs', 'require("node:assert").ok(true);\n');
  writeFixture(rootDir, 'tests/proofs.test.cjs', 'require("node:assert").ok(true);\n');
  writeFixture(rootDir, 'traces/proofs.json', '{"ok":true}\n');

  const mapping = {
    'QUALITY-01': {
      implementation: ['src/coverage.js'],
      tests: ['tests/coverage.test.cjs'],
      traces: [],
      enforcement: [{ file: 'src/coverage.js', allOf: ['throw new Error'] }],
    },
    'QUALITY-02': {
      implementation: ['src/logging.js', 'src/logging-boundary.js'],
      tests: ['tests/logging.test.cjs'],
      traces: [],
      enforcement: [{ file: 'src/logging.js', allOf: ['[REDACTED]'] }],
    },
    'QUALITY-03': {
      implementation: ['src/proofs.js'],
      tests: ['tests/proofs.test.cjs'],
      traces: ['traces/proofs.json'],
      enforcement: [{ file: 'src/proofs.js', allOf: ['throw new Error'] }],
    },
  };

  return { rootDir, requirementsPath, mapping };
}

test('TruthAuditor.loadRequirements parses requirement ids, claims, and sources', () => {
  const { rootDir, requirementsPath, mapping } = createFixture();
  const auditor = new TruthAuditor({ rootDir, requirementsPath, mapping });
  const requirements = auditor.loadRequirements();

  assert.equal(requirements.length, 3);
  assert.deepEqual(requirements.map((item) => item.id), ['QUALITY-01', 'QUALITY-02', 'QUALITY-03']);
  assert.equal(requirements[0].source, 'docs/quality.md');
  assert.match(requirements[1].claim, /SHALL redact secrets/);
});

test('TruthAuditor.findImplementation returns explicit mappings for a requirement', () => {
  const { rootDir, requirementsPath, mapping } = createFixture();
  const auditor = new TruthAuditor({ rootDir, requirementsPath, mapping });

  assert.deepEqual(auditor.findImplementation('QUALITY-01'), ['src/coverage.js']);
  assert.deepEqual(
    auditor.findImplementation('QUALITY-02'),
    ['src/logging.js', 'src/logging-boundary.js']
  );
});

test('TruthAuditor.findTests returns mapped test files and handles missing ids', () => {
  const { rootDir, requirementsPath, mapping } = createFixture();
  const auditor = new TruthAuditor({ rootDir, requirementsPath, mapping });

  assert.deepEqual(auditor.findTests('QUALITY-03'), ['tests/proofs.test.cjs']);
  assert.deepEqual(auditor.findTests('QUALITY-99'), []);
});

test('TruthAuditor.generateAudit proves mapped requirements with explicit enforcement', () => {
  const { rootDir, requirementsPath, mapping } = createFixture();
  const auditor = new TruthAuditor({ rootDir, requirementsPath, mapping });
  const audit = auditor.generateAudit();

  assert.equal(audit.total_requirements, 3);
  assert.equal(audit.unproven, 0);
  assert.equal(audit.failures.length, 0);
  assert.deepEqual(audit.requirements.map((item) => item.status), ['PROVEN', 'PROVEN', 'PROVEN']);
});

test('TruthAuditor.generateAudit flags missing enforcement evidence', () => {
  const { rootDir, requirementsPath, mapping } = createFixture();
  const auditor = new TruthAuditor({
    rootDir,
    requirementsPath,
    mapping: {
      ...mapping,
      'QUALITY-03': {
        ...mapping['QUALITY-03'],
        enforcement: [{ file: 'src/proofs.js', allOf: ['process.exit(1)'] }],
      },
    },
  });

  const audit = auditor.generateAudit();
  const failed = audit.failures.find((item) => item.id === 'QUALITY-03');
  assert.equal(audit.unproven, 1);
  assert.ok(failed);
  assert.deepEqual(failed.missing, ['enforcement']);
});
