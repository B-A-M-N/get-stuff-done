const fs = require('fs');
const path = require('path');

const degradedMode = require('./degraded-mode.cjs');

const COMMAND_GOVERNANCE_PATH = '.planning/policy/command-governance.yaml';
const GOVERNANCE_CLASSES = new Set([
  'ungated_execution',
  'warn_only',
  'hard_gated_state_transition',
  'recovery_only',
]);

function stripAuthorityEnvelope(content) {
  if (!content) return content;
  return content.replace(/\n(?:#|\/\/|<!--)\s*GSD-AUTHORITY:[\s\S]*$/m, '').trim();
}

function normalizeToken(value) {
  const raw = String(value || '').trim();
  return raw ? raw.toLowerCase() : null;
}

function normalizeRoute(route = {}) {
  return {
    command: normalizeToken(route.command),
    subcommand: normalizeToken(route.subcommand),
    mode: normalizeToken(route.mode),
  };
}

function buildRouteFromArgs(args = []) {
  const command = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const subcommand = args[1] && !args[1].startsWith('--') ? args[1] : null;
  let mode = null;

  if (command === 'context' && subcommand === 'build') {
    const workflowIdx = args.indexOf('--workflow');
    mode = workflowIdx !== -1 ? args[workflowIdx + 1] : null;
  }

  return normalizeRoute({ command, subcommand, mode });
}

function loadGovernancePolicy(cwd) {
  const target = path.join(cwd, COMMAND_GOVERNANCE_PATH);
  if (!fs.existsSync(target)) {
    return { default_class: 'warn_only', routes: [] };
  }
  const raw = fs.readFileSync(target, 'utf-8');
  const parsed = JSON.parse(stripAuthorityEnvelope(raw));
  return {
    default_class: GOVERNANCE_CLASSES.has(parsed.default_class) ? parsed.default_class : 'warn_only',
    routes: Array.isArray(parsed.routes) ? parsed.routes : [],
  };
}

function routeMatches(definition, route) {
  return (!definition.command || normalizeToken(definition.command) === route.command)
    && (!definition.subcommand || normalizeToken(definition.subcommand) === route.subcommand)
    && (!definition.mode || normalizeToken(definition.mode) === route.mode);
}

function resolveCommandGovernance(cwd, route, options = {}) {
  const normalizedRoute = normalizeRoute(route);
  const policy = options.policy || loadGovernancePolicy(cwd);
  const routes = policy.routes || [];

  const exact = routes.find((entry) => routeMatches(entry, normalizedRoute));
  const fallback = routes.find((entry) => (
    normalizeToken(entry.command) === normalizedRoute.command
      && normalizeToken(entry.subcommand) === normalizedRoute.subcommand
      && !normalizeToken(entry.mode)
  ));
  const commandOnly = routes.find((entry) => (
    normalizeToken(entry.command) === normalizedRoute.command
      && !normalizeToken(entry.subcommand)
      && !normalizeToken(entry.mode)
  ));
  const match = exact || fallback || commandOnly || null;

  return {
    route: normalizedRoute,
    classification: GOVERNANCE_CLASSES.has(match?.class) ? match.class : policy.default_class || 'warn_only',
    workflow: match?.workflow || null,
    matched: Boolean(match),
  };
}

function findRelevantSubsystem(snapshot, workflow) {
  const blocked = workflow
    ? (snapshot.blocked_workflows || []).find((entry) => entry.workflow === workflow)
    : (snapshot.blocked_workflows || [])[0];
  if (blocked) {
    return {
      subsystem: blocked.subsystem,
      state: blocked.canonical_state,
      implication: blocked.implications?.[0] || 'Current truth posture cannot be treated as trustworthy for this workflow.',
      reason: blocked.reason,
    };
  }

  const warning = workflow
    ? (snapshot.warning_workflows || []).find((entry) => entry.workflow === workflow)
    : (snapshot.warning_workflows || [])[0];
  if (warning) {
    return {
      subsystem: warning.subsystem,
      state: warning.canonical_state,
      implication: warning.reason || 'Current truth posture is degraded; outputs may be incomplete.',
      reason: warning.reason,
    };
  }

  const subsystemEntry = Object.entries(snapshot.subsystems || {}).find(([, value]) => value?.canonical_state !== 'HEALTHY');
  if (subsystemEntry) {
    const [subsystem, value] = subsystemEntry;
    return {
      subsystem,
      state: value.canonical_state,
      implication: value.detail || 'Current truth posture is not fully healthy.',
      reason: value.reason,
    };
  }

  return {
    subsystem: 'system',
    state: snapshot.aggregate_state,
    implication: 'Current truth posture is not fully healthy.',
    reason: 'aggregate_state_nonhealthy',
  };
}

function buildWarningPayload(routeDecision, snapshot) {
  if (!snapshot || snapshot.aggregate_state === 'HEALTHY') return null;
  const relevant = findRelevantSubsystem(snapshot, routeDecision.workflow);
  return {
    route: routeDecision.route,
    classification: routeDecision.classification,
    subsystem: relevant.subsystem,
    state: relevant.state,
    implication: relevant.implication,
    reason: relevant.reason,
  };
}

function buildGenericBlock(routeDecision, snapshot) {
  const relevant = findRelevantSubsystem(snapshot, routeDecision.workflow);
  return {
    allowed: false,
    route: routeDecision.route,
    classification: routeDecision.classification,
    workflow: routeDecision.workflow,
    subsystem: relevant.subsystem,
    canonical_state: degradedMode.normalizePolicyState(relevant.state),
    aggregate_state: snapshot.aggregate_state,
    reason: relevant.reason || 'unsafe_truth_posture',
    implications: [
      relevant.implication,
      'Continuing would let the system mutate or assert authoritative truth from an unsafe posture.',
    ],
    next_options: [
      'Run recovery-only diagnostic commands to inspect the degraded dependency.',
      'Restore the canonical dependency or refresh degraded, drift, and reconciliation truth first.',
    ],
    warning: null,
  };
}

async function evaluateCommandGovernance(cwd, route, options = {}) {
  const routeDecision = resolveCommandGovernance(cwd, route, options);
  if (routeDecision.classification === 'recovery_only' || routeDecision.classification === 'ungated_execution') {
    return {
      allowed: true,
      ...routeDecision,
      aggregate_state: null,
      warning: null,
    };
  }

  const snapshot = options.snapshot || await degradedMode.buildDegradedState(cwd, options.degradedOptions || {});
  if (options.persist !== false) {
    degradedMode.writeLatestDegradedState(cwd, snapshot);
  }

  if (routeDecision.classification === 'hard_gated_state_transition') {
    if (routeDecision.workflow) {
      const workflowDecision = degradedMode.evaluateWorkflow(snapshot, routeDecision.workflow);
      return {
        ...workflowDecision,
        ...routeDecision,
        aggregate_state: snapshot.aggregate_state,
        warning: workflowDecision.allowed ? buildWarningPayload(routeDecision, snapshot) : null,
      };
    }

    if (snapshot.aggregate_state === 'UNSAFE') {
      return buildGenericBlock(routeDecision, snapshot);
    }

    return {
      allowed: true,
      ...routeDecision,
      aggregate_state: snapshot.aggregate_state,
      warning: buildWarningPayload(routeDecision, snapshot),
    };
  }

  return {
    allowed: true,
    ...routeDecision,
    aggregate_state: snapshot.aggregate_state,
    warning: buildWarningPayload(routeDecision, snapshot),
  };
}

function emitGovernanceWarning(decision, raw) {
  if (!decision?.warning) return;
  const payload = { warning: decision.warning };
  if (raw) {
    process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }
  process.stderr.write(`[governance] ${decision.warning.state}: ${decision.warning.implication}\n`);
}

module.exports = {
  COMMAND_GOVERNANCE_PATH,
  GOVERNANCE_CLASSES,
  buildRouteFromArgs,
  emitGovernanceWarning,
  evaluateCommandGovernance,
  loadGovernancePolicy,
  normalizeRoute,
  resolveCommandGovernance,
};
