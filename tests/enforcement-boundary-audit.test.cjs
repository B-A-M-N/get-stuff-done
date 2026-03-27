const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  AUDIT_ARTIFACT_PATH,
  REQUIRED_VALIDATORS_PATH,
  SANCTIONED_INTERFACES_PATH,
  VERIFICATION_ARTIFACT_PATH,
  buildAuditArtifact,
  loadRequiredValidators,
  loadSanctionedInterfaces,
  runEnforcementBoundaryAudit,
} = require('../get-stuff-done/bin/lib/enforcement-boundary-audit.cjs');
const { runGsdTools, createTempGitProject, cleanup } = require('./helpers.cjs');

describe('enforcement boundary audit', () => {
  test('policy files load and expose authoritative surfaces and validator operations', () => {
    const sanctioned = loadSanctionedInterfaces(process.cwd());
    const validators = loadRequiredValidators(process.cwd());

    assert.strictEqual(sanctioned.schema, 'gsd_sanctioned_interfaces_v1');
    assert.ok(sanctioned.artifacts.some((item) => item.surface === '.planning/STATE.md'));
    assert.strictEqual(validators.schema, 'gsd_required_validators_v1');
    assert.ok(validators.operations.some((item) => item.id === 'verify_integrity_truth_claim'));
  });

  test('buildAuditArtifact returns typed findings and runtime probes', () => {
    const artifact = buildAuditArtifact(process.cwd());

    assert.strictEqual(artifact.schema, 'gsd_enforcement_boundary_audit_v1');
    assert.ok(Array.isArray(artifact.findings));
    assert.ok(Array.isArray(artifact.probes));
    assert.ok(artifact.probes.length >= 2);
    for (const finding of artifact.findings) {
      assert.ok(['validator_bypass', 'writer_bypass', 'execution_bypass', 'truth_claim_bypass'].includes(finding.type));
      assert.ok(['CRITICAL', 'MAJOR', 'MINOR'].includes(finding.severity));
    }
  });

  test('audit command writes machine and verification artifacts', () => {
    const tmpDir = createTempGitProject();
    try {
      const policyDir = path.join(tmpDir, '.planning', 'policy');
      fs.mkdirSync(policyDir, { recursive: true });
      fs.copyFileSync(path.join(process.cwd(), SANCTIONED_INTERFACES_PATH), path.join(tmpDir, SANCTIONED_INTERFACES_PATH));
      fs.copyFileSync(path.join(process.cwd(), REQUIRED_VALIDATORS_PATH), path.join(tmpDir, REQUIRED_VALIDATORS_PATH));

      const result = runGsdTools(['audit', 'enforcement-boundary', '--write', '--raw'], tmpDir);
      assert.strictEqual(result.success, true);
      const out = JSON.parse(result.output);
      assert.strictEqual(out.schema, 'gsd_enforcement_boundary_audit_v1');
      assert.strictEqual(fs.existsSync(path.join(tmpDir, AUDIT_ARTIFACT_PATH)), true);
      assert.strictEqual(fs.existsSync(path.join(tmpDir, VERIFICATION_ARTIFACT_PATH)), true);
    } finally {
      cleanup(tmpDir);
    }
  });
});
