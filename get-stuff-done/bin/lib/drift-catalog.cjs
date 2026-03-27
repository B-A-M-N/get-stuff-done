/**
 * Drift Catalog — Phase 70 truth-surface inventory and artifact generation
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const { safeWriteFile } = require('./core.cjs');
const { classifyCatalogEntries, groupEntries } = require('./drift-classifier.cjs');

const PHASE_DIR = '.planning/phases/70-drift-surface-mapping';
const CATALOG_PATH = `${PHASE_DIR}/drift_catalog.yaml`;
const SUMMARY_PATH = `${PHASE_DIR}/70-DRIFT-SUMMARY.md`;

function rel(...parts) {
  return path.join(...parts).replace(/\\/g, '/');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getHeadHash(cwd) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function runNodeCli(cwd, cliPath, args) {
  const result = spawnSync('node', [cliPath, ...args], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  const stdout = (result.stdout || '').trim();
  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      parsed = null;
    }
  }

  return {
    ok: result.status === 0,
    exit_code: result.status ?? 1,
    stdout,
    stderr: (result.stderr || '').trim(),
    parsed,
  };
}

function resolveInstalledCli(homeDir = process.env.HOME || '') {
  const candidates = [
    path.join(homeDir, '.codex', 'get-shit-done', 'bin', 'gsd-tools.cjs'),
    path.join(homeDir, '.codex', 'dostuff', 'get-stuff-done', 'bin', 'gsd-tools.cjs'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function countStaticIntegrityClaims(cwd) {
  const target = path.join(cwd, 'get-stuff-done/bin/lib/planning-server.cjs');
  const content = fs.readFileSync(target, 'utf-8');
  const matches = content.match(/narrative_drift_score:\s*1\.0,\s*coherence_check_passed:\s*true/g) || [];
  return matches.length;
}

function buildHistoricalEvidencePaths(cwd) {
  const candidates = [
    '.planning/v0.6.0-MILESTONE-AUDIT.md',
    '.planning/phases/50-plane-integration-observability/50-VERIFICATION.md',
    '.planning/phases/53-second-brain-connection-fallback-hardening/53-VERIFICATION.md',
    '.planning/phases/54-model-facing-second-brain-via-mcp/54-VERIFICATION.md',
    '.planning/phases/55-open-brain-v1-foundations/55-VERIFICATION.md',
  ];
  return candidates.filter((relativePath) => fs.existsSync(path.join(cwd, relativePath)));
}

function collectProbeResults(cwd, options = {}) {
  if (options.probes) return options.probes;

  const repoCli = path.join(cwd, 'get-stuff-done/bin/gsd-tools.cjs');
  const installedCli = resolveInstalledCli();

  const validateConsistency = runNodeCli(cwd, repoCli, ['validate', 'consistency', '--raw']);
  const stateVerify = runNodeCli(cwd, repoCli, ['state', 'verify', '--raw']);
  const degradedMode = runNodeCli(cwd, repoCli, ['health', 'degraded-mode', '--raw']);
  const repoMilestone = runNodeCli(cwd, repoCli, ['init', 'milestone-op', '--raw']);
  const repoBrainStatus = runNodeCli(cwd, repoCli, ['brain', 'status', '--raw']);
  const repoOpenStatus = runNodeCli(cwd, repoCli, ['brain', 'open-status', '--raw']);

  const installedMilestone = installedCli
    ? runNodeCli(cwd, installedCli, ['init', 'milestone-op', '--raw'])
    : null;
  const installedOpenStatus = installedCli
    ? runNodeCli(cwd, installedCli, ['brain', 'open-status', '--raw'])
    : null;

  return {
    repoCli,
    installedCli,
    head: getHeadHash(cwd),
    validateConsistency,
    stateVerify,
    degradedMode,
    repoMilestone,
    installedMilestone,
    repoBrainStatus,
    repoOpenStatus,
    installedOpenStatus,
    staticIntegrityClaimCount: countStaticIntegrityClaims(cwd),
    historicalEvidencePaths: buildHistoricalEvidencePaths(cwd),
  };
}

function evidenceCommand(command, result) {
  return {
    type: 'command',
    ref: command,
    exit_code: result?.exit_code ?? null,
    observed: result?.parsed ?? result?.stdout ?? null,
  };
}

function evidenceFile(relativePath) {
  return {
    type: 'file',
    ref: relativePath,
  };
}

function buildSurfaceEntries(cwd, probes) {
  const historicalPaths = probes.historicalEvidencePaths || buildHistoricalEvidencePaths(cwd);
  const repoOpen = probes.repoOpenStatus?.parsed || {};
  const installedOpen = probes.installedOpenStatus?.parsed || null;
  const repoBrain = probes.repoBrainStatus?.parsed || {};
  const repoMilestone = probes.repoMilestone?.parsed || {};
  const installedMilestone = probes.installedMilestone?.parsed || null;

  const openStatusMismatch = Boolean(installedOpen)
    && stableStringify({
      status: repoOpen.status,
      reason: repoOpen.reason,
      backend_state: repoOpen.backend_state,
    }) !== stableStringify({
      status: installedOpen.status,
      reason: installedOpen.reason,
      backend_state: installedOpen.backend_state,
    });

  const milestoneMismatch = Boolean(installedMilestone)
    && stableStringify({
      milestone_version: repoMilestone.milestone_version,
      phase_count: repoMilestone.phase_count,
    }) !== stableStringify({
      milestone_version: installedMilestone.milestone_version,
      phase_count: installedMilestone.phase_count,
    });

  const integrityClaimDrift = probes.staticIntegrityClaimCount > 0;

  return [
    {
      id: 'phase70-planning-truth-surface',
      requirement_id: 'TRUTH-CLAIM-01',
      surface_category: 'planning_artifact',
      claim: 'Active planning artifacts must remain internally consistent and realizable from observable repo state.',
      implementation: {
        paths: [
          '.planning/ROADMAP.md',
          '.planning/REQUIREMENTS.md',
          '.planning/STATE.md',
          '.planning/phases/70-drift-surface-mapping/70-CONTEXT.md',
          '.planning/phases/70-drift-surface-mapping/70-01-PLAN.md',
          '.planning/phases/70-drift-surface-mapping/70-02-PLAN.md',
        ],
      },
      evidence: [
        evidenceCommand('node get-stuff-done/bin/gsd-tools.cjs validate consistency --raw', probes.validateConsistency),
        evidenceCommand('node get-stuff-done/bin/gsd-tools.cjs state verify --raw', probes.stateVerify),
        evidenceCommand('node get-stuff-done/bin/gsd-tools.cjs init milestone-op --raw', probes.repoMilestone),
      ],
      observed_drift: !(probes.validateConsistency?.ok && probes.stateVerify?.ok),
      impact: 'high',
      exploitability: 'high',
      false_truth_perception: !(probes.validateConsistency?.ok && probes.stateVerify?.ok),
      affects_current_truth: true,
      historical: false,
      notes: 'Healthy when roadmap, state, and phase inventory resolve consistently from current repo state.',
    },
    {
      id: 'phase70-installed-milestone-resolution',
      requirement_id: 'TRUTH-DRIFT-01',
      surface_category: 'installed_runtime',
      claim: 'Repo-local and installed CLI milestone resolution must agree on the current milestone truth surface.',
      implementation: {
        paths: [
          'get-stuff-done/bin/lib/init.cjs',
          probes.installedCli ? probes.installedCli.replace(/\\/g, '/') : '.codex/<missing>/bin/gsd-tools.cjs',
        ],
      },
      evidence: [
        evidenceCommand('node get-stuff-done/bin/gsd-tools.cjs init milestone-op --raw', probes.repoMilestone),
        probes.installedCli
          ? evidenceCommand(`node ${probes.installedCli} init milestone-op --raw`, probes.installedMilestone)
          : { type: 'absence', ref: 'installed_cli', observed: 'missing' },
      ],
      observed_drift: milestoneMismatch,
      impact: 'high',
      exploitability: 'high',
      false_truth_perception: milestoneMismatch,
      affects_current_truth: true,
      historical: false,
      notes: 'This captures installed-runtime truth separately from repo-local truth because closeout drift previously hid there.',
    },
    {
      id: 'phase70-open-brain-runtime-split',
      requirement_id: 'TRUTH-DRIFT-01',
      surface_category: 'runtime_surface',
      claim: 'Repo-local and installed runtime Open Brain status surfaces must agree when reporting current backend truth.',
      implementation: {
        paths: [
          'get-stuff-done/bin/lib/open-brain.cjs',
          'get-stuff-done/bin/lib/brain-manager.cjs',
          probes.installedCli ? probes.installedCli.replace(/\\/g, '/') : '.codex/<missing>/bin/gsd-tools.cjs',
        ],
      },
      evidence: [
        evidenceCommand('node get-stuff-done/bin/gsd-tools.cjs brain open-status --raw', probes.repoOpenStatus),
        probes.installedCli
          ? evidenceCommand(`node ${probes.installedCli} brain open-status --raw`, probes.installedOpenStatus)
          : { type: 'absence', ref: 'installed_cli', observed: 'missing' },
      ],
      observed_drift: openStatusMismatch,
      impact: 'high',
      exploitability: 'high',
      false_truth_perception: openStatusMismatch,
      affects_current_truth: true,
      historical: false,
      notes: 'This is the live runtime/operator split surfaced during the v0.6.0 closeout repair path.',
    },
    {
      id: 'phase70-planning-degraded-mode-surface',
      requirement_id: 'TRUTH-CLAIM-01',
      surface_category: 'degraded_mode',
      claim: 'Planning degraded-mode checks must make fallback assumptions explicit rather than silently passing.',
      implementation: {
        paths: [
          'get-stuff-done/bin/lib/commands.cjs',
          '.planning/STATE.md',
          '.planning/ROADMAP.md',
          '.planning/PROJECT.md',
        ],
      },
      evidence: [
        evidenceCommand('node get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw', probes.degradedMode),
      ],
      observed_drift: probes.degradedMode?.stdout !== 'ok',
      impact: 'high',
      exploitability: 'low',
      false_truth_perception: false,
      affects_current_truth: true,
      historical: false,
      notes: 'This remains healthy when planning fallbacks are surfaced accurately and no pending gates exist.',
    },
    {
      id: 'phase70-planning-server-integrity-claims',
      requirement_id: 'TRUTH-CLAIM-01',
      surface_category: 'verification_surface',
      claim: 'Planning Server integrity fields must not report coherence or narrative-drift values without live proof.',
      implementation: {
        paths: [
          'get-stuff-done/bin/lib/planning-server.cjs',
          'get-stuff-done/bin/lib/context.cjs',
        ],
      },
      evidence: [
        {
          type: 'code-scan',
          ref: 'get-stuff-done/bin/lib/planning-server.cjs',
          observed: {
            static_integrity_claim_count: probes.staticIntegrityClaimCount,
            pattern: 'narrative_drift_score: 1.0, coherence_check_passed: true',
          },
        },
      ],
      observed_drift: integrityClaimDrift,
      impact: 'high',
      exploitability: 'high',
      false_truth_perception: integrityClaimDrift,
      affects_current_truth: true,
      historical: false,
      notes: 'Static optimism in integrity-bearing responses is an active truth risk until later phases replace it with evidence-backed values.',
    },
    {
      id: 'phase70-memory-fail-closed-boundary',
      requirement_id: 'TRUTH-CLAIM-01',
      surface_category: 'memory_boundary',
      claim: 'Model-facing memory must fail closed when trusted backend conditions are unavailable.',
      implementation: {
        paths: [
          'get-stuff-done/bin/lib/brain-manager.cjs',
          'get-stuff-done/bin/lib/open-brain.cjs',
        ],
      },
      evidence: [
        evidenceCommand('node get-stuff-done/bin/gsd-tools.cjs brain status --raw', probes.repoBrainStatus),
        evidenceCommand('node get-stuff-done/bin/gsd-tools.cjs brain open-status --raw', probes.repoOpenStatus),
      ],
      observed_drift: false,
      impact: 'low',
      exploitability: 'low',
      false_truth_perception: false,
      affects_current_truth: true,
      historical: false,
      memory_boundary_state: repoBrain.model_facing_memory?.status === 'blocked'
        ? 'disabled'
        : (repoOpen.status === 'degraded' ? 'degraded' : 'trusted'),
      notes: 'Phase 70 inventories only the trust boundary here, not embedding quality or recall quality.',
    },
    {
      id: 'phase70-recent-structural-history-50-55',
      requirement_id: 'TRUTH-DRIFT-01',
      surface_category: 'historical_structural',
      claim: 'Recent high-impact structural history that previously blocked milestone closeout must remain cataloged as non-blocking historical drift.',
      implementation: {
        paths: historicalPaths,
      },
      evidence: historicalPaths.map(evidenceFile),
      observed_drift: true,
      impact: 'high',
      exploitability: 'high',
      false_truth_perception: true,
      affects_current_truth: false,
      historical: true,
      notes: 'This preserves the repaired 50-55 verification/closeout drift as visible structural history without re-blocking the current milestone.',
    },
  ];
}

function buildCatalog(cwd, options = {}) {
  const probes = collectProbeResults(cwd, options);
  const entries = classifyCatalogEntries(buildSurfaceEntries(cwd, probes));
  const grouped = groupEntries(entries);

  const catalog = {
    schema: 'gsd_drift_catalog',
    phase: '70',
    source_of_truth: CATALOG_PATH,
    coverage: {
      scope: 'full_truth_surface',
      hierarchy: ['evidence', 'code', 'verification', 'roadmap'],
      historical_window: 'recent_plus_structural_history',
    },
    entry_count: entries.length,
    counts: {
      active: grouped.active.length,
      historical: grouped.historical.length,
      healthy: grouped.healthy.length,
    },
    entries,
  };

  catalog.catalog_hash = sha256(stableStringify(catalog.entries));
  return catalog;
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const stringValue = String(value);
  if (/^[A-Za-z0-9_.:/-]+$/.test(stringValue)) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

function toYaml(value, indent = 0) {
  const prefix = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const nested = toYaml(item, indent + 2);
        const nestedLines = nested.split('\n');
        return `${prefix}- ${nestedLines[0].trimStart()}\n${nestedLines.slice(1).join('\n')}`;
      }
      return `${prefix}- ${yamlScalar(item)}`;
    }).join('\n');
  }

  return Object.entries(value).map(([key, item]) => {
    if (Array.isArray(item)) {
      if (item.length === 0) return `${prefix}${key}: []`;
      return `${prefix}${key}:\n${toYaml(item, indent + 2)}`;
    }
    if (item && typeof item === 'object') {
      const nested = toYaml(item, indent + 2);
      return `${prefix}${key}:\n${nested}`;
    }
    return `${prefix}${key}: ${yamlScalar(item)}`;
  }).join('\n');
}

function renderCatalogYaml(catalog) {
  return toYaml(catalog);
}

function writeCatalog(cwd, options = {}) {
  const catalog = buildCatalog(cwd, options);
  const targetPath = path.join(cwd, CATALOG_PATH);
  safeWriteFile(targetPath, renderCatalogYaml(catalog), {
    phase: options.phase || '70',
    plan: options.plan || '01',
    wave: options.wave || '1',
  });
  return {
    path: CATALOG_PATH,
    catalog,
  };
}

function renderSummary(catalog) {
  const grouped = groupEntries(catalog.entries);
  const lines = [
    '# Phase 70 Drift Summary',
    '',
    `Catalog hash: \`${catalog.catalog_hash}\``,
    `Source of truth: \`${catalog.source_of_truth}\``,
    '',
    '## Active Hotspots',
  ];

  if (grouped.active.length === 0) {
    lines.push('- None.');
  } else {
    for (const entry of grouped.active) {
      lines.push(`- \`${entry.id}\` — ${entry.severity} ${entry.drift_type}; requirement \`${entry.requirement_id}\``);
      lines.push(`  Evidence: ${entry.evidence.map((item) => item.ref).join(', ')}`);
    }
  }

  lines.push('', '## Historical Non-Blocking Drift');
  if (grouped.historical.length === 0) {
    lines.push('- None.');
  } else {
    for (const entry of grouped.historical) {
      lines.push(`- \`${entry.id}\` — ${entry.severity} ${entry.drift_type}; non-blocking historical cluster`);
      lines.push(`  Evidence: ${entry.evidence.map((item) => item.ref).join(', ')}`);
    }
  }

  lines.push('', '## Memory Truth Boundaries');
  const memoryEntries = catalog.entries.filter((entry) => entry.surface_category === 'memory_boundary');
  if (memoryEntries.length === 0) {
    lines.push('- None.');
  } else {
    for (const entry of memoryEntries) {
      lines.push(`- \`${entry.id}\` — boundary state \`${entry.memory_boundary_state || 'unknown'}\``);
    }
  }

  lines.push('', '## Healthy Live Surfaces');
  const healthyHighlights = grouped.healthy.filter((entry) => entry.surface_category !== 'memory_boundary');
  if (healthyHighlights.length === 0) {
    lines.push('- None.');
  } else {
    for (const entry of healthyHighlights) {
      lines.push(`- \`${entry.id}\` — ${entry.drift_type} surface currently aligned`);
    }
  }

  lines.push('', '## Installed vs Repo-Local Truth');
  const splitEntries = catalog.entries.filter((entry) => (
    entry.surface_category === 'installed_runtime' || entry.surface_category === 'runtime_surface'
  ));
  for (const entry of splitEntries) {
    lines.push(`- \`${entry.id}\` — activity \`${entry.activity_status}\`, severity \`${entry.severity}\``);
  }

  return lines.join('\n') + '\n';
}

function writeSummary(cwd, options = {}) {
  const catalog = options.catalog || buildCatalog(cwd, options);
  const targetPath = path.join(cwd, SUMMARY_PATH);
  safeWriteFile(targetPath, renderSummary(catalog), {
    phase: options.phase || '70',
    plan: options.plan || '02',
    wave: options.wave || '2',
  });
  return {
    path: SUMMARY_PATH,
    summary: renderSummary(catalog),
  };
}

module.exports = {
  CATALOG_PATH,
  SUMMARY_PATH,
  buildCatalog,
  buildSurfaceEntries,
  collectProbeResults,
  renderCatalogYaml,
  renderSummary,
  writeCatalog,
  writeSummary,
};
