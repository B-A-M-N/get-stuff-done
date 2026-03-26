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
      '# QUALITY-04 needs-clarification',
      'QUALITY-04: Clarify the audit behavior before proofing. | source: docs/clarify.md',
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
  writeFixture(rootDir, '.git/ignored.js', 'module.exports = "ignored";\n');
  writeFixture(rootDir, 'node_modules/pkg/index.js', 'module.exports = "ignored";\n');

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
    'QUALITY-04': {
      implementation: [],
      tests: [],
      traces: [],
      enforcement: [],
    },
  };

  return { rootDir, requirementsPath, mapping };
}

test('TruthAuditor.loadRequirements parses requirement ids, claims, and sources', () => {
  const { rootDir, requirementsPath, mapping } = createFixture();
  const auditor = new TruthAuditor({ rootDir, requirementsPath, mapping });
  const requirements = auditor.loadRequirements();

  assert.equal(requirements.length, 4);
  assert.deepEqual(requirements.map((item) => item.id), ['QUALITY-01', 'QUALITY-02', 'QUALITY-03', 'QUALITY-04']);
  assert.equal(requirements[0].source, 'docs/quality.md');
  assert.match(requirements[1].claim, /SHALL redact secrets/);
  assert.equal(requirements[3].needsClarification, true);
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

  assert.equal(audit.total_requirements, 4);
  assert.equal(audit.unproven, 1);
  assert.equal(audit.failures.length, 1);
  assert.deepEqual(audit.requirements.map((item) => item.status), ['PROVEN', 'PROVEN', 'PROVEN', 'UNPROVEN']);
  assert.deepEqual(audit.failures[0].missing, ['implementation', 'test', 'enforcement']);
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
  assert.equal(audit.unproven, 2);
  assert.ok(failed);
  assert.deepEqual(failed.missing, ['enforcement']);
});

test('TruthAuditor.assessEnforcement reports missing rules and missing files explicitly', () => {
  const { rootDir, requirementsPath } = createFixture();
  const auditor = new TruthAuditor({
    rootDir,
    requirementsPath,
    mapping: {
      'QUALITY-10': {
        implementation: [],
        tests: [],
        traces: [],
        enforcement: [],
      },
      'QUALITY-11': {
        implementation: [],
        tests: [],
        traces: [],
        enforcement: [{ file: 'src/does-not-exist.js', allOf: ['throw new Error'] }],
      },
    },
  });

  assert.deepEqual(auditor.assessEnforcement('QUALITY-10'), {
    status: 'missing',
    matched: [],
    missing: ['No enforcement rules defined'],
  });
  assert.deepEqual(auditor.assessEnforcement('QUALITY-11'), {
    status: 'missing',
    matched: [],
    missing: ['src/does-not-exist.js missing'],
  });
});

test('TruthAuditor ignores .git and node_modules and handles a missing requirements file', () => {
  const { rootDir, mapping } = createFixture();
  const missingRequirementsPath = path.join(rootDir, '.planning', 'MISSING.md');
  const auditor = new TruthAuditor({
    rootDir,
    requirementsPath: missingRequirementsPath,
    mapping,
  });

  const index = auditor.getFileIndex();
  assert.equal(index.has('.git/ignored.js'), false);
  assert.equal(index.has('node_modules/pkg/index.js'), false);
  assert.deepEqual(auditor.loadRequirements(), []);
});
