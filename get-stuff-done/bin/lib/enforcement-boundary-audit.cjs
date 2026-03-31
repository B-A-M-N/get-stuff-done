const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const { signFile } = require('./authority.cjs');

const SANCTIONED_INTERFACES_PATH = '.planning/policy/sanctioned-interfaces.yaml';
const REQUIRED_VALIDATORS_PATH = '.planning/policy/required-validators.yaml';
const AUDIT_ARTIFACT_PATH = '.planning/audit/enforcement-boundary.json';
const VERIFICATION_ARTIFACT_PATH = '.planning/phases/76-enforcement-boundary-audit/76-VERIFICATION.md';
const TOOLS_PATH = path.join(__dirname, '..', 'gsd-tools.cjs');

const SOURCE_ROOTS = [
  'get-stuff-done/bin',
  'get-stuff-done/bin/lib',
];

function stripAuthorityEnvelope(content) {
  if (!content) return content;
  return content.replace(/\n(?:#|\/\/|<!--)\s*GSD-AUTHORITY:[\s\S]*$/m, '').trim();
}

function readPolicyJson(cwd, relPath) {
  const target = path.join(cwd, relPath);
  const raw = fs.readFileSync(target, 'utf-8');
  return JSON.parse(stripAuthorityEnvelope(raw));
}

function loadSanctionedInterfaces(cwd) {
  return readPolicyJson(cwd, SANCTIONED_INTERFACES_PATH);
}

function loadRequiredValidators(cwd) {
  return readPolicyJson(cwd, REQUIRED_VALIDATORS_PATH);
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const stack = [rootDir];
  const files = [];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && full.endsWith('.cjs')) {
        files.push(full);
      }
    }
  }
  return files.sort();
}

function normalizeRel(cwd, fullPath) {
  return path.relative(cwd, fullPath).replace(/\\/g, '/');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectArtifactIdentifiers(content, artifact) {
  const identifiers = new Set();
  const tokenPatterns = [artifact.surface]
    .filter(Boolean)
    .map((token) => escapeRegex(token));

  for (const tokenPattern of tokenPatterns) {
    const literalRegex = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*['"\`][^'"\`]*${tokenPattern}[^'"\`]*['"\`]`, 'g');
    let match;
    while ((match = literalRegex.exec(content)) !== null) {
      identifiers.add(match[1]);
    }

    const joinedRegex = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*path\\.join\\([^\\n]*['"\`][^'"\`]*${tokenPattern}[^'"\`]*['"\`][^\\n]*\\)`, 'g');
    while ((match = joinedRegex.exec(content)) !== null) {
      identifiers.add(match[1]);
    }
  }

  const surfaceBase = path.basename(artifact.surface);
  if (artifact.surface.startsWith('.planning/') && ['STATE.md', 'ROADMAP.md'].includes(surfaceBase)) {
    const planningJoinRegex = new RegExp(
      `(?:const|let|var)\\s+(\\w+)\\s*=\\s*path\\.join\\([^\\n]*(?:cwd|planningDir)[^\\n]*['"\`]\\.planning['"\`][^\\n]*['"\`]${escapeRegex(surfaceBase)}['"\`][^\\n]*\\)`,
      'g'
    );
    let match;
    while ((match = planningJoinRegex.exec(content)) !== null) {
      identifiers.add(match[1]);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const name of Array.from(identifiers)) {
      const derivedRegex = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*path\\.join\\([^\\n]*\\b${escapeRegex(name)}\\b[^\\n]*\\)`, 'g');
      let match;
      while ((match = derivedRegex.exec(content)) !== null) {
        if (!identifiers.has(match[1])) {
          identifiers.add(match[1]);
          changed = true;
        }
      }
    }
  }

  return identifiers;
}

function fileWritesArtifact(content, artifact) {
  const identifiers = collectArtifactIdentifiers(content, artifact);
  for (const identifier of identifiers) {
    const writeRegex = new RegExp(`(?:fs\\.(?:writeFileSync|appendFileSync)|safeWriteFile)\\s*\\(\\s*${escapeRegex(identifier)}\\b`);
    if (writeRegex.test(content)) {
      return true;
    }
  }
  return false;
}

function classifyWriterBypasses(cwd, sanctioned) {
  const findings = [];
  const sourceFiles = SOURCE_ROOTS.flatMap((relRoot) => walkFiles(path.join(cwd, relRoot)));

  for (const fullPath of sourceFiles) {
    const relPath = normalizeRel(cwd, fullPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const directWrite = /fs\.(writeFileSync|appendFileSync)\s*\(/.test(content);
    const managedWrite = /safeWriteFile\s*\(/.test(content);
    if (!directWrite && !managedWrite) continue;

    for (const artifact of sanctioned.artifacts || []) {
      if (!fileWritesArtifact(content, artifact)) continue;

      const allowed = (artifact.sanctioned_writers || []).includes(relPath);
      if (!allowed) {
        findings.push({
          type: 'writer_bypass',
          severity: 'CRITICAL',
          location: relPath,
          surface: artifact.surface,
          path: [relPath, directWrite ? 'fs.writeFileSync' : 'safeWriteFile'],
          repro: `Invoke logic in ${relPath} to write ${artifact.surface} without a sanctioned writer module.`,
          status: 'static_only',
        });
      }
    }
  }

  return dedupeFindings(findings);
}

function classifyValidatorBypasses(cwd, validators) {
  const findings = [];
  for (const operation of validators.operations || []) {
    const missing = [];
    for (const [relPath, patterns] of Object.entries(operation.required_in_files || {})) {
      const fullPath = path.join(cwd, relPath);
      const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';
      const absent = (patterns || []).filter((pattern) => !content.includes(pattern));
      if (absent.length > 0) {
        missing.push({ file: relPath, patterns: absent });
      }
    }

    if (missing.length > 0) {
      findings.push({
        type: operation.type || 'validator_bypass',
        severity: operation.severity || 'CRITICAL',
        location: missing[0].file,
        surface: operation.surface,
        path: missing.map((item) => item.file),
        repro: operation.repro,
        status: 'static_only',
        missing_patterns: missing,
      });
    }
  }
  return dedupeFindings(findings);
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = [finding.type, finding.location, finding.surface, finding.repro].join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createProbeProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-audit-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'drift'), { recursive: true });

  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

  fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n', 'utf-8');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n', 'utf-8');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n', 'utf-8');
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });
  return tmpDir;
}

function applyProbeFixture(tmpDir, fixture = {}) {
  fs.mkdirSync(path.join(tmpDir, '.planning', 'drift'), { recursive: true });
  if (fixture.drift !== false) {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-report.json'), JSON.stringify({
      generated_at: fixture.driftGeneratedAt || new Date().toISOString(),
      findings: [],
      summary: { active: 0 },
    }, null, 2), 'utf-8');
  } else {
    fs.rmSync(path.join(tmpDir, '.planning', 'drift', 'latest-report.json'), { force: true });
  }

  if (fixture.reconciliation !== false) {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'drift', 'latest-reconciliation.json'), JSON.stringify({
      timestamp: fixture.reconciledAt || new Date().toISOString(),
      applied_changes: [],
      unchanged: [],
      reverification_required: [],
      summary: { critical: 0, major: 0, minor: 0 },
    }, null, 2), 'utf-8');
  } else {
    fs.rmSync(path.join(tmpDir, '.planning', 'drift', 'latest-reconciliation.json'), { force: true });
  }
}

function runProbe(definition) {
  const tmpDir = createProbeProject();
  try {
    applyProbeFixture(tmpDir, definition.fixture);
    const result = spawnSync(process.execPath, [TOOLS_PATH, ...definition.args], {
      cwd: tmpDir,
      env: { ...process.env, ...(definition.env || {}) },
      encoding: 'utf-8',
    });
    const stdout = (result.stdout || '').trim();
    let parsed = null;
    try {
      parsed = stdout ? JSON.parse(stdout) : null;
    } catch {}

    const expectedSuccess = definition.expect?.success;
    const successMatched = expectedSuccess === undefined
      ? true
      : Boolean(result.status === 0) === Boolean(expectedSuccess);

    let payloadMatched = true;
    if (parsed && definition.expect) {
      for (const [key, value] of Object.entries(definition.expect)) {
        if (key === 'success') continue;
        if (parsed[key] !== value) {
          payloadMatched = false;
          break;
        }
      }
    } else if (definition.expect && Object.keys(definition.expect).some((key) => key !== 'success')) {
      payloadMatched = false;
    }

    const passed = successMatched && payloadMatched;
    return {
      id: definition.id,
      surface: definition.surface,
      command: definition.args.join(' '),
      status: passed ? 'disproven' : 'proven',
      success: result.status === 0,
      exit_code: result.status,
      expected: definition.expect || {},
      observed: parsed || stdout || (result.stderr || '').trim(),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function summarizeFindings(findings) {
  return findings.reduce((acc, finding) => {
    const sev = finding.severity || 'MINOR';
    acc.total += 1;
    if (sev === 'CRITICAL') acc.critical += 1;
    else if (sev === 'MAJOR') acc.major += 1;
    else acc.minor += 1;
    return acc;
  }, { total: 0, critical: 0, major: 0, minor: 0 });
}

function buildAuditArtifact(cwd, options = {}) {
  const sanctioned = loadSanctionedInterfaces(cwd);
  const validators = loadRequiredValidators(cwd);
  const findings = [
    ...classifyWriterBypasses(cwd, sanctioned),
    ...classifyValidatorBypasses(cwd, validators),
  ];

  const probes = (validators.runtime_probes || []).map((probe) => runProbe(probe));
  for (const probe of probes) {
    if (probe.status === 'proven' && probe.expected?.success === false) {
      findings.push({
        type: 'validator_bypass',
        severity: 'CRITICAL',
        location: probe.command,
        surface: probe.surface,
        path: [probe.command],
        repro: `Runtime probe ${probe.id} succeeded in violating the expected guard.`,
        status: 'proven',
      });
    }
  }

  const summary = summarizeFindings(findings);
  return {
    schema: 'gsd_enforcement_boundary_audit_v1',
    generated_at: options.now || new Date().toISOString(),
    phase: '76',
    policy_paths: {
      sanctioned_interfaces: SANCTIONED_INTERFACES_PATH,
      required_validators: REQUIRED_VALIDATORS_PATH,
    },
    audited_surfaces: (sanctioned.artifacts || []).map((artifact) => artifact.surface),
    findings,
    probes,
    summary,
    final_status: summary.critical === 0 ? 'VALID' : 'INVALID',
  };
}

function writeAuditArtifact(cwd, artifact) {
  const target = path.join(cwd, AUDIT_ARTIFACT_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(artifact, null, 2) + '\n', 'utf-8');
  return target;
}

function renderVerificationMd(artifact) {
  const truths = [
    `- Sanctioned interface policy loaded from \`${SANCTIONED_INTERFACES_PATH}\``,
    `- Required validator policy loaded from \`${REQUIRED_VALIDATORS_PATH}\``,
    `- Authoritative surfaces audited: ${artifact.audited_surfaces.length}`,
    `- Runtime probes executed: ${artifact.probes.length}`,
  ];

  const coverage = artifact.audited_surfaces.map((surface) => `- ${surface}`);
  const findingLines = artifact.findings.length === 0
    ? ['- No bypass findings detected.']
    : artifact.findings.map((finding) => `- ${finding.severity} ${finding.type} on \`${finding.surface}\` at \`${finding.location}\``);

  const probeLines = artifact.probes.map((probe) => `- ${probe.id}: ${probe.status}`);
  const finalStatus = artifact.summary.critical === 0 ? 'VALID' : 'INVALID';

  return `# Phase 76 Verification\n\n## Observable Truths\n\n${truths.join('\n')}\n\n## Coverage\n\n${coverage.join('\n')}\n\n## Findings\n\n${findingLines.join('\n')}\n\n## Runtime Probes\n\n${probeLines.join('\n')}\n\n## Final Status\n\n- Final Status: ${finalStatus}\n- Critical bypasses: ${artifact.summary.critical}\n- Major bypasses: ${artifact.summary.major}\n- Minor bypasses: ${artifact.summary.minor}\n- Machine artifact: \`${AUDIT_ARTIFACT_PATH}\`\n`;
}

function writeVerificationArtifact(cwd, artifact) {
  const target = path.join(cwd, VERIFICATION_ARTIFACT_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, renderVerificationMd(artifact), 'utf-8');
  signFile(target, '76', '01', '1');
  return target;
}

function runEnforcementBoundaryAudit(cwd, options = {}) {
  const artifact = buildAuditArtifact(cwd, options);
  if (options.write) {
    writeAuditArtifact(cwd, artifact);
    writeVerificationArtifact(cwd, artifact);
  }
  return artifact;
}

module.exports = {
  AUDIT_ARTIFACT_PATH,
  REQUIRED_VALIDATORS_PATH,
  SANCTIONED_INTERFACES_PATH,
  VERIFICATION_ARTIFACT_PATH,
  buildAuditArtifact,
  classifyValidatorBypasses,
  classifyWriterBypasses,
  loadRequiredValidators,
  loadSanctionedInterfaces,
  renderVerificationMd,
  runEnforcementBoundaryAudit,
  writeAuditArtifact,
  writeVerificationArtifact,
};
