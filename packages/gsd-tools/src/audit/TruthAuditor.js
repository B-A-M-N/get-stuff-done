const fs = require('fs');
const path = require('path');

const DEFAULT_MAPPING = {
  'QUALITY-01': {
    implementation: [
      '.nycrc',
      'package.json',
      'scripts/run-tests.cjs',
      'scripts/analyze-coverage-gaps.cjs',
    ],
    tests: [
      'tests/phase-52/unit/coverage-criticalpaths.test.cjs',
      'tests/phase-52/unit/coverage-edgecases.test.cjs',
    ],
    traces: [
      'coverage/phase-52-coverage.json',
      '.planning/phases/52-truth-enforcement-hardening/coverage-gaps.json',
    ],
    enforcement: [
      {
        file: '.nycrc',
        allOf: ['"check-coverage": true', '"lines": 85', '"branches": 85'],
      },
      {
        file: 'package.json',
        allOf: ['test:coverage:phase52', 'c8 --nycrc=.nycrc'],
      },
      {
        file: 'scripts/analyze-coverage-gaps.cjs',
        allOf: ['LINE_THRESHOLD = 85', 'BRANCH_THRESHOLD = 85'],
      },
    ],
  },
  'QUALITY-02': {
    implementation: [
      'packages/gsd-tools/src/logging/SafeLogger.js',
      'get-stuff-done/bin/lib/core.cjs',
      'scripts/validate-secret-scan.js',
    ],
    tests: [
      'tests/phase-52/unit/safelogger-secrets.test.cjs',
      'tests/phase-52/integration/safelogger-end-to-end.test.cjs',
    ],
    traces: [
      '.planning/phases/52-truth-enforcement-hardening/secret-scan-clean.txt',
    ],
    enforcement: [
      {
        file: 'packages/gsd-tools/src/logging/SafeLogger.js',
        allOf: ['static sanitize', '[REDACTED]', 'SECRET_PATTERNS'],
      },
      {
        file: 'get-stuff-done/bin/lib/core.cjs',
        allOf: ['SafeLogger.sanitize', 'shouldSanitizeFileWrite'],
      },
      {
        file: 'tests/phase-52/integration/safelogger-end-to-end.test.cjs',
        allOf: ['SafeLogger.sanitize = input => String(input)', 'assert.throws'],
      },
    ],
  },
  'QUALITY-03': {
    implementation: [
      'packages/gsd-tools/src/validation/ProofHarness.js',
      'scripts/generate-all-proofs.js',
      '.planning/phases/52-truth-enforcement-hardening/schemas/proof-schema.json',
    ],
    tests: [
      'tests/phase-52/unit/proof-harness.test.cjs',
      'tests/phase-52/integration/adversarial-scenarios.test.cjs',
    ],
    traces: [
      '.planning/phases/52-truth-enforcement-hardening/proofs/json_validator.proof.json',
      '.planning/phases/52-truth-enforcement-hardening/proofs/config_validator.proof.json',
      '.planning/phases/52-truth-enforcement-hardening/proofs/phase_input_validator.proof.json',
      '.planning/phases/52-truth-enforcement-hardening/proofs/contract_validator.proof.json',
    ],
    enforcement: [
      {
        file: 'packages/gsd-tools/src/validation/ProofHarness.js',
        allOf: ['false_negatives', 'false_positives', 'throw new Error'],
      },
      {
        file: 'scripts/generate-all-proofs.js',
        allOf: ['throw new Error(`Validator module not found', 'Generated proof failed verification'],
      },
      {
        file: 'tests/phase-52/integration/adversarial-scenarios.test.cjs',
        allOf: ['Contract hash mismatch', 'Signature mismatch', 'Validator removal'],
      },
    ],
  },
  'QUALITY-04': {
    implementation: [
      '.planning/REQUIREMENTS.md',
      'packages/gsd-tools/src/audit/TruthAuditor.js',
      'scripts/generate-truth-audit.js',
    ],
    tests: [
      'tests/phase-52/unit/truth-audit-mapping.test.cjs',
      'tests/phase-52/integration/audit-kill.test.cjs',
    ],
    traces: [
      '.planning/audit/truth_audit.json',
      '.planning/audit/52-TRUTH-AUDIT.md',
    ],
    enforcement: [
      {
        file: 'packages/gsd-tools/src/audit/TruthAuditor.js',
        allOf: ['loadRequirements()', 'generateAudit()', "status: proven ? 'PROVEN' : 'UNPROVEN'"],
      },
      {
        file: 'scripts/generate-truth-audit.js',
        allOf: ['process.exit(1)', 'truth_audit.json', '52-TRUTH-AUDIT.md'],
      },
      {
        file: 'tests/phase-52/integration/audit-kill.test.cjs',
        allOf: ['audit.unproven', "status, 'UNPROVEN'"],
      },
    ],
  },
};

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        stack.push(next);
      } else {
        files.push(toPosix(path.relative(rootDir, next)));
      }
    }
  }
  return files;
}

class TruthAuditor {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.requirementsPath = options.requirementsPath || path.join(this.rootDir, '.planning', 'REQUIREMENTS.md');
    this.mapping = options.mapping || DEFAULT_MAPPING;
    this.fileCache = null;
  }

  loadRequirements() {
    if (!fs.existsSync(this.requirementsPath)) {
      return [];
    }

    const lines = fs.readFileSync(this.requirementsPath, 'utf8').split('\n');
    const requirements = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const match = line.match(/^([A-Z]+-\d+):\s*(.+)$/);
      if (!match) {
        continue;
      }

      const [, id, remainder] = match;
      const [claimPart, sourcePart] = remainder.split(/\s+\|\s+source:\s+/, 2);
      const claim = (claimPart || '').trim();
      const source = (sourcePart || path.relative(this.rootDir, this.requirementsPath)).trim();
      const nextLine = lines[index + 1] || '';
      const prevLine = lines[index - 1] || '';
      const noteWindow = `${prevLine}\n${line}\n${nextLine}`;
      const deprecated = /@deprecated/i.test(noteWindow);
      const needsClarification = /needs-clarification/i.test(noteWindow) || !/(MUST|SHALL)/.test(claim);

      if (deprecated) {
        continue;
      }

      requirements.push({
        id,
        claim,
        source,
        needsClarification,
        line: index + 1,
      });
    }

    return requirements.sort((left, right) => left.id.localeCompare(right.id));
  }

  getFileIndex() {
    if (!this.fileCache) {
      this.fileCache = new Set(walkFiles(this.rootDir));
    }
    return this.fileCache;
  }

  findImplementation(reqId) {
    const mapped = this.mapping[reqId]?.implementation || [];
    const index = this.getFileIndex();
    return mapped.filter((file) => index.has(file));
  }

  findTests(reqId) {
    const mapped = this.mapping[reqId]?.tests || [];
    const index = this.getFileIndex();
    return mapped.filter((file) => index.has(file));
  }

  findTraces(reqId) {
    const mapped = this.mapping[reqId]?.traces || [];
    const index = this.getFileIndex();
    return mapped.filter((file) => index.has(file));
  }

  assessEnforcement(reqId) {
    const rules = this.mapping[reqId]?.enforcement || [];
    if (rules.length === 0) {
      return { status: 'missing', matched: [], missing: ['No enforcement rules defined'] };
    }

    const matched = [];
    const missing = [];

    for (const rule of rules) {
      const fullPath = path.join(this.rootDir, rule.file);
      if (!fs.existsSync(fullPath)) {
        missing.push(`${rule.file} missing`);
        continue;
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const unmet = (rule.allOf || []).filter((token) => !content.includes(token));
      if (unmet.length > 0) {
        missing.push(`${rule.file} missing markers: ${unmet.join(', ')}`);
        continue;
      }

      matched.push(rule.file);
    }

    return {
      status: missing.length === 0 ? 'enforced' : 'missing',
      matched,
      missing,
    };
  }

  generateAudit() {
    const requirements = this.loadRequirements();
    const clarifications = [];

    const details = requirements.map((requirement) => {
      const implementation = this.findImplementation(requirement.id);
      const test = this.findTests(requirement.id);
      const trace = this.findTraces(requirement.id);
      const enforcement = this.assessEnforcement(requirement.id);
      const missing = [];

      if (requirement.needsClarification) {
        clarifications.push(requirement.id);
      }
      if (implementation.length === 0) {
        missing.push('implementation');
      }
      if (test.length === 0) {
        missing.push('test');
      }
      if (enforcement.status !== 'enforced') {
        missing.push('enforcement');
      }

      const proven = !requirement.needsClarification && missing.length === 0;

      return {
        id: requirement.id,
        claim: requirement.claim,
        source: requirement.source,
        status: proven ? 'PROVEN' : 'UNPROVEN',
        missing,
        evidence: {
          implementation,
          test,
          trace,
          enforcement: enforcement.status,
          enforcement_files: enforcement.matched,
          enforcement_missing: enforcement.missing,
        },
      };
    });

    const failures = details.filter((detail) => detail.status === 'UNPROVEN');
    return {
      total_requirements: details.length,
      proven: details.length - failures.length,
      unproven: failures.length,
      needs_clarification: clarifications,
      failures: failures.map((detail) => ({
        id: detail.id,
        claim: detail.claim,
        source: detail.source,
        missing: detail.missing,
        evidence: detail.evidence,
        status: 'FAIL',
      })),
      requirements: details,
    };
  }
}

module.exports = {
  TruthAuditor,
  DEFAULT_MAPPING,
};
