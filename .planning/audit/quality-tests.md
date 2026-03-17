# Quality & Test Coverage Audit

**Source:** gsd-codebase-mapper agent output

## Test Runner

`scripts/run-tests.cjs` auto-discovers all `*.test.cjs` in `tests/` — no explicit include list. All 30 files run.

## Critical: 5 Uncommitted Test Files

The following test files exist on disk but are **untracked by git** (verified via git status):

- `tests/checkpoint-contract.test.cjs`
- `tests/checkpoint-validator.test.cjs`
- `tests/state-clarification.test.cjs`
- `tests/verify-context-contract.test.cjs`
- `tests/verify-research-contract.test.cjs`

These cover the newest behavior (checkpoint protocol, clarification continuity, context/research contract gates) and will be invisible to any CI that clones a clean checkout.

## Coverage Gaps by Lib File

| Lib File | Test Coverage |
|----------|--------------|
| `model-profiles.cjs` | None — no test file imports or exercises it |
| `profile-output.cjs` | None |
| `profile-pipeline.cjs` | None |
| `template.cjs` | None |
| `itl-adapters.cjs` | Integration only via itl.test.cjs — no isolated adapter tests |

## Missing Function Coverage

- `cmdStateBeginPhase` — called at the start of every phase execution, zero test coverage
- `checkpoint:human-action` task type — `cmdVerifyPlanStructure` validates it but no test exercises it
- Health checks W008, W009, E010 — untested (including home-directory guard and Nyquist key repair action)

## Test Quality Issues

- `tests/dostuff.test.cjs` — all 40+ tests are presence-only string checks against `.md` files, no runtime behavior assertions
- `process.stdout.write` monkey-patching in `checkpoint-validator.test.cjs` is not safe for concurrent test execution — should use the `withMockedVerify` core-mock pattern

## Missing Scenario Tests

1. Full pause→clarify→blocked→resume→resolve behavioral loop
2. Gate rejection: plan-phase refuses when `clarification_status: blocked`
3. Gate rejection: execute-phase refuses when `clarification_status: blocked`
4. Autonomous halts at per-phase blocked clarification
5. Checkpoint artifact written → validated → cleared lifecycle
6. SUMMARY.md validated against schema post-execution

## Recommendations

1. Commit the 5 untracked test files immediately
2. Add isolated tests for `model-profiles.cjs`, `profile-pipeline.cjs`, `profile-output.cjs`
3. Add `cmdStateBeginPhase` and `checkpoint:human-action` test coverage
4. Replace monkey-patching in `checkpoint-validator.test.cjs` with `withMockedVerify`
5. Add behavioral assertions to `dostuff.test.cjs` beyond presence checks
