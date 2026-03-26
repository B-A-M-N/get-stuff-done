const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TruthAuditor } = require('../../../packages/gsd-tools/src/audit/TruthAuditor');

function writeFile(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

test('TruthAuditor kill test flags a requirement as unproven when enforcement is removed', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-audit-kill-'));
  const requirementsPath = path.join(rootDir, '.planning', 'REQUIREMENTS.md');

  writeFile(
    rootDir,
    '.planning/REQUIREMENTS.md',
    'QUALITY-99: The audit MUST fail when the enforcement gate is removed. | source: fixtures/QUALITY-99.md\n'
  );
  writeFile(
    rootDir,
    'src/enforcer.js',
    "function enforce() { throw new Error('blocked'); }\nmodule.exports = { enforce };\n"
  );
  writeFile(rootDir, 'tests/quality-99.test.cjs', "require('node:assert').ok(true);\n");
  writeFile(rootDir, 'traces/quality-99.json', '{"status":"observed"}\n');

  const mapping = {
    'QUALITY-99': {
      implementation: ['src/enforcer.js'],
      tests: ['tests/quality-99.test.cjs'],
      traces: ['traces/quality-99.json'],
      enforcement: [
        {
          file: 'src/enforcer.js',
          allOf: ['throw new Error'],
        },
      ],
    },
  };

  const auditor = new TruthAuditor({ rootDir, requirementsPath, mapping });
  const baseline = auditor.generateAudit();
  assert.equal(baseline.unproven, 0);
  assert.equal(baseline.requirements[0].status, 'PROVEN');

  writeFile(
    rootDir,
    'src/enforcer.js',
    "function enforce() { console.warn('soft warning only'); }\nmodule.exports = { enforce };\n"
  );

  const regressed = new TruthAuditor({ rootDir, requirementsPath, mapping }).generateAudit();
  assert.equal(regressed.unproven, 1);
  assert.equal(regressed.requirements[0].status, 'UNPROVEN');
  assert.ok(regressed.failures[0].evidence.enforcement_missing[0].includes('missing markers'));
});
