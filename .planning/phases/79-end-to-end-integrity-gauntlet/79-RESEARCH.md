---
phase: 79
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 76
    reason: "The gauntlet must attack the sanctioned-interface and validator boundaries already formalized by the enforcement audit."
  - phase: 77
    reason: "CLI consequence behavior under degraded and unsafe posture must be proven through the command-governance layer rather than bypassed."
  - phase: 78
    reason: "Phase truth is now the phase-level synthesis artifact that the gauntlet must validate, corrupt, and classify under adversarial conditions."
---

# Phase 79 Research: End-to-End Integrity Gauntlet

## Summary

Phase 79 should be implemented as a deterministic adversarial gauntlet harness that drives the real CLI and truth-bearing artifact pipeline through seeded corruption scenarios, then records expected versus observed truth outcomes in machine-auditable artifacts.

Primary recommendation:
- keep the authoritative validation surface at the CLI and emitted artifact layer
- add one dedicated gauntlet harness module that can seed realistic corruption without replacing the real enforcement path
- organize scenarios as a catalog with explicit expected outcomes and required artifacts
- execute each scenario in deterministic local mode by default, with optional live integration replays when real Postgres, Firecrawl, and Plane are available
- emit separate artifacts for scenario definitions, raw execution results, drift findings, coverage mapping, and final verification
- treat Node.js with `node:sqlite` support as a runtime prerequisite for authoritative deterministic mode because memory fallback and audit surfaces depend on it

The repo already contains most of the enforcement stack required for this phase:
- CLI routing and truth-bearing workflows in `get-stuff-done/bin/gsd-tools.cjs` and `get-stuff-done/bin/lib/commands.cjs`
- degraded policy and workflow blocking in `get-stuff-done/bin/lib/degraded-mode.cjs`
- command consequence classification in `get-stuff-done/bin/lib/command-governance.cjs`
- enforcement-boundary audit helpers and fixture generation in `get-stuff-done/bin/lib/enforcement-boundary-audit.cjs`
- phase truth generation and update hooks in `get-stuff-done/bin/lib/phase-truth.cjs`
- memory truth behavior in `get-stuff-done/bin/lib/second-brain.cjs`

What is missing is the hostile orchestrator that intentionally corrupts these surfaces, runs the sanctioned commands, and judges whether the system stayed truthful.

## Current Reality

### Existing usable primitives

- `get-stuff-done/bin/gsd-tools.cjs`
  - already centralizes CLI dispatch and is the only acceptable authoritative proof surface
  - already carries command-governance and degraded-mode consequence behavior from earlier phases
- `get-stuff-done/bin/lib/verify.cjs`
  - already owns evidence-first verification and integrity judgment
  - already consults degraded-mode posture for truth-bearing verification routes
  - should remain the final verification authority for gauntlet closeout
- `get-stuff-done/bin/lib/phase-truth.cjs`
  - already derives phase truth from summaries, verification, drift, reconciliation, and degraded state
  - gives Phase 79 a concrete target for false-acceptance and downgrade scenarios
- `get-stuff-done/bin/lib/degraded-mode.cjs`
  - already computes workflow blocking and warning decisions from current system posture
  - already defines canonical workflow dependencies such as `context:plan-phase` and `verify:integrity`
- `get-stuff-done/bin/lib/command-governance.cjs`
  - already maps route classifications and consequences on top of degraded truth
  - is the correct place to prove recovery-only, warn-only, and hard-gated semantics under attack
- `get-stuff-done/bin/lib/second-brain.cjs`
  - already exposes canonical-versus-fallback memory truth and explicit degraded reason fields
  - is the correct authority for Postgres-vs-SQLite mismatch scenarios
- `get-stuff-done/bin/lib/enforcement-boundary-audit.cjs`
  - already includes audit-time probe project creation and fixture seeding logic
  - provides a concrete pattern for temporary project creation and truth-artifact corruption tests
- existing tests:
  - `tests/degraded-mode-enforcement.test.cjs`
  - `tests/command-governance-enforcement.test.cjs`
  - `tests/workflow-scenario.test.cjs`
  - `tests/phase-truth-hooks.test.cjs`
  - these already demonstrate how to run real CLI commands against temporary projects and inspect emitted artifacts

### Missing pieces

- no dedicated Phase 79 scenario catalog
- no gauntlet harness that combines corruption seeding, CLI execution, and artifact/result collection
- no shared scenario outcome schema for `INVALID`, `CONDITIONAL`, `RECONCILIATION_REQUIRED`, and `BLOCK`
- no artifact family for gauntlet spec, results, coverage mapping, and drift discoveries
- no deterministic-vs-live comparison surface
- no release-gating verification that summarizes all scenario outcomes as final truth
- no explicit runtime contract aligning deterministic mode with the repo’s `node:sqlite` dependency

## Standard Stack

- Node.js stdlib only
- existing repo helpers and patterns:
  - `core.cjs`
  - `verify.cjs`
  - `phase.cjs`
  - `degraded-mode.cjs`
  - `command-governance.cjs`
  - `phase-truth.cjs`
  - `second-brain.cjs`
  - `enforcement-boundary-audit.cjs`
  - `tests/helpers.cjs`
- Node test runner for deterministic scenario execution
- temporary git-backed fixture projects for end-to-end CLI proof

No new dependency is justified. This phase is hostile orchestration and artifact discipline, not a new platform capability.

Runtime note:
- the repo currently declares `"node": ">=16.7.0"` in `package.json`
- the repo also already uses `node:sqlite` in `second-brain.cjs`, `itl-audit.cjs`, and `audit.cjs`
- authoritative deterministic gauntlet runs should therefore assume a Node runtime with `node:sqlite` support, effectively Node 22+
- Phase 79 should not plan around older runtime semantics that cannot execute the repo’s canonical fallback truth paths

## Architecture Patterns

### 1. Scenario catalog plus executable harness

Recommended structure:
- `get-stuff-done/bin/lib/integrity-gauntlet.cjs`
  - scenario loading
  - fixture project creation
  - corruption seeding
  - CLI execution
  - result normalization
  - artifact writing
- `.planning/phases/79-end-to-end-integrity-gauntlet/79-GAUNTLET-SPEC.md`
  - human-readable authoritative scenario definitions
- machine-readable scenario catalog embedded in code or checked in as adjacent JSON/YAML if helpful

Recommended behavior:
- every scenario has:
  - id
  - failure class
  - seed mode
  - target surfaces
  - command sequence
  - expected classification
  - expected artifact consequences
- the harness runs each scenario against a real temporary project and records the observed evidence

This keeps planning and verification aligned around explicit scenario truth rather than prose.

### 2. Corruption seeding should reuse existing fixture patterns

Recommended source of implementation patterns:
- `tests/command-governance-enforcement.test.cjs`
- `tests/degraded-mode-enforcement.test.cjs`
- `tests/phase-truth-hooks.test.cjs`
- `get-stuff-done/bin/lib/enforcement-boundary-audit.cjs`

Recommended harness split:
- setup helper creates a temp repo and baseline `.planning/` tree
- seed helper applies one of:
  - artifact corruption
  - CLI misuse
  - subsystem degradation
  - drift contradiction
- execution helper runs the real CLI using `spawnSync`
- assertion helper normalizes stdout, stderr, exit code, and resulting artifacts into one machine record

This is the right level of indirection: strong enough to seed failures, still grounded in the sanctioned command surface.

### 3. Separate raw results from final truth judgment

Recommended artifact split:
- `79-GAUNTLET-RESULTS.md`
  - scenario-by-scenario raw outcomes, evidence paths, exit codes, and emitted artifacts
- `79-DRIFT-REPORT.md`
  - contradictions or newly surfaced drift patterns discovered by the gauntlet
- `79-VERIFICATION.md`
  - final evidence-first verdict on whether the release gate passed

Recommended anti-pattern rule:
- do not collapse scenario logs and final verdict into one document
- do not let `79-VERIFICATION.md` become an execution transcript

This matches the repo’s existing separation between execution evidence, truth synthesis, and verification judgment.

### 4. Deterministic local mode is the source of reproducibility

Recommended default:
- every required scenario must run in deterministic local mode
- local mode should stub external availability only through realistic failure conditions already used by the repo:
  - forcing SQLite mode for memory
  - missing or stale drift/reconciliation artifacts
  - disconnected planning or Plane conditions
  - malformed or contradictory verification and summary artifacts

Recommended live mode:
- only re-run scenarios whose semantics depend on real integrations
- record environment availability explicitly
- compare only the classification and truth consequences, not incidental output text

This keeps the release gate reproducible while still allowing optional parity checks against real services.

### 5. Outcome normalization needs one shared enum and one shared record shape

Recommended result record:
- `scenario_id`
- `mode`
- `seed_summary`
- `commands`
- `observed_exit_codes`
- `observed_artifacts`
- `observed_truth_status`
- `observed_phase_truth_status`
- `observed_governance_classification`
- `expected_outcome`
- `actual_outcome`
- `matched`
- `failure_reason`

Recommended classification rules:
- `INVALID` when false truth acceptance, missing required proof, or undeclared degraded truth is observed
- `CONDITIONAL` when declared degraded posture correctly limits certainty
- `RECONCILIATION_REQUIRED` when contradiction is detected and the system requires canonical downgrade work
- `BLOCK` when authoritative progression is correctly stopped before lying

This avoids ad hoc case-by-case interpretation in later verification.

## Recommended Scope

### Required

- add a dedicated integrity gauntlet helper module
- add a scenario catalog covering at least fifteen scenarios
- implement deterministic fixture setup and corruption seeding
- execute real CLI commands for every scenario
- normalize results into one machine-consumable record shape
- write all required phase artifacts:
  - `79-GAUNTLET-SPEC.md`
  - `79-GAUNTLET-RESULTS.md`
  - `79-COVERAGE-MAP.md`
  - `79-DRIFT-REPORT.md`
  - `79-VERIFICATION.md`
- add focused automated tests for the harness and representative scenarios
- make the final verification artifact release-gating rather than informational
- carry an explicit Node runtime prerequisite into harness execution and documentation so deterministic mode cannot silently run on a runtime that lacks canonical SQLite fallback support

### Strongly recommended

- reuse existing temp-project and signing helpers rather than inventing a second fixture framework
- keep scenario definitions declarative enough that adding future adversarial cases is low-risk
- add one machine-readable summary block to the results artifact so verification can consume it deterministically
- include mode parity fields for deterministic versus live runs when live mode is attempted
- fail fast at gauntlet startup when the runtime cannot provide `node:sqlite` support required by the repo’s deterministic truth surfaces

### Out of scope

- generic chaos engineering outside truth-bearing surfaces
- broad UI verification
- redesigning memory or Plane systems beyond what is required to expose truthful degraded behavior
- replacing existing verification, drift, or governance modules with gauntlet-specific logic

## Common Pitfalls

- testing helpers directly instead of the sanctioned CLI path
  - this would prove internals, not truth behavior
- using mock-only failures that can never happen through the real artifact stack
  - the whole point is realistic corruption
- mixing deterministic and live mode semantics into one expected-outcome contract
  - local mode should stay authoritative for reproducibility
- treating warnings as sufficient for truth violations
  - the locked Phase 79 contract explicitly disallows this
- hiding mixed-failure behavior behind single-failure-only coverage
  - real failure modes compose and Phase 79 must prove the system still does not lie
- writing only human narrative results
  - verification must be able to consume structured outcome evidence
- assuming the declared Node engine floor is sufficient for authoritative local-mode proof
  - the actual repo truth surfaces already depend on `node:sqlite`

## Open Questions / Assumptions

- Assumption: one plan is enough if it is split into harness foundation, scenario execution, and artifact/verification closeout tasks.
- Assumption: current fixture helpers plus new targeted corruption helpers are sufficient; a separate external test runner is unnecessary.
- Assumption: Plane live-mode checks can be optional at runtime but must be represented in the coverage map so absence is explicit.
- Open question worth resolving in planning: whether the machine-readable scenario catalog should live in code as a constant or as a checked-in `.json`/`.yaml` artifact beside the phase outputs.
- Open question worth resolving in follow-up repo work: whether `package.json` engine metadata should be updated to match the repo’s real runtime floor, though that metadata correction is not required to plan Phase 79 safely.

## Don't Hand-Roll

- do not create a second truth-classification vocabulary
- do not bypass `gsd-tools.cjs` for the authoritative proof path
- do not let the harness mutate authoritative artifacts in ways impossible under the repo’s real file and signing model
- do not bury drift discoveries inside scenario prose
- do not make live integration availability a prerequisite for local release-gating proof
- do not rely on runtime behavior older than the repo’s actual `node:sqlite`-capable execution floor

## Code Examples

### Recommended scenario shape

```javascript
const scenario = {
  id: 'fake-verification-missing-proof',
  class: 'fake_verification',
  mode: 'deterministic',
  seed(project) {
    corruptVerificationArtifact(project, { finalStatus: 'VALID', missingEvidence: true });
  },
  commands: [
    ['verify', 'verification-artifact', '.planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md'],
    ['verify', 'integrity', '--raw'],
  ],
  expected: {
    outcome: 'INVALID',
    exitCode: 1,
  },
};
```

### Recommended execution shell

```javascript
function runScenario(cwd, scenario, options = {}) {
  const project = createGauntletProject(cwd, scenario, options);
  scenario.seed(project);
  const runs = scenario.commands.map((args) => runCli(project.cwd, args, options));
  return normalizeScenarioResult(project, scenario, runs, options);
}
```

### Recommended result normalization

```javascript
function normalizeScenarioResult(project, scenario, runs, options) {
  return {
    scenario_id: scenario.id,
    mode: options.mode || 'deterministic',
    commands: runs.map((run) => run.args),
    observed_exit_codes: runs.map((run) => run.status),
    observed_artifacts: collectTruthArtifacts(project.cwd),
    actual_outcome: classifyObservedOutcome(project.cwd, runs),
    expected_outcome: scenario.expected.outcome,
  };
}
```

## Bottom Line

Phase 79 should not add another layer of theory. It should codify the hostile proof that the existing truth stack cannot silently accept corruption.

The correct implementation shape is:
- one declarative scenario catalog
- one reusable corruption-and-execution harness
- CLI and emitted artifacts as the authoritative proof surface
- deterministic local execution as the release gate
- optional live parity runs when integrations exist
- separate artifacts for spec, results, drift discoveries, coverage, and final verification
- an explicit runtime assumption that deterministic mode runs on a Node version with `node:sqlite` support

That will let the final milestone closeout say something stronger than “tests passed.” It will say the system stayed truthful under attack.
