# Phase 11 Research: Coverage and Test Hardening

## Objective
Research how to achieve the project’s mandatory 100% coverage target for the new ITL-related code and stabilize the test surface so coverage can run reliably, even with the existing sandbox constraints around subprocess-heavy suites.

Additional steering:
- Coverage hardening should prioritize the new/modified ITL and narrative-first workflow surfaces first.
- The repo already has `c8` and a `test:coverage` script, but the current full test surface includes sandbox-sensitive subprocess tests.
- Phase 11 should improve real coverage signal rather than chasing vanity metrics.

## Standard Stack
- **Coverage tooling**
  - `c8`
  - existing `npm run test:coverage`
- **Primary code under coverage**
  - `get-stuff-done/bin/lib/itl*.cjs`
  - related command/workflow contract tests in `tests/*.test.cjs`
- **Primary test frameworks**
  - `node:test`
  - focused fixture/assertion tests instead of subprocess-heavy paths where sandbox blocks them

## Architecture Patterns

### 1. Separate coverage-critical tests from sandbox-sensitive suites
The full test suite includes helpers that shell out and can fail under sandbox restrictions unrelated to correctness.

Recommended behavior:
- Keep coverage gating focused on the ITL/lib surface that `c8` includes.
- Prefer direct module tests over child-process wrappers for coverage-critical code.
- Only broaden to subprocess tests where they are necessary and stable.

### 2. Use coverage to expose real blind spots in the ITL/lib surface
Phase 11 should map exactly which branches and error paths in the ITL helpers are still untested.

Recommended targets:
- ambiguity and lockability branches
- seed helpers
- summary rendering edge paths
- audit helper read/write edge cases
- CLI dispatch branches that affect the ITL surface if they are included in coverage scope

### 3. Preserve the deterministic test style
Coverage should not come from fragile integration smoke alone.

Recommended behavior:
- add direct unit-style tests for uncovered branches,
- keep fixtures explicit and readable,
- avoid introducing randomness or timing-sensitive tests just to move coverage numbers.

### 4. Be honest about CI/sandbox boundaries
If some test surfaces remain sandbox-sensitive, Phase 11 should document that clearly and either:
- narrow the coverage gate to the stable target surface, or
- refactor the affected tests toward direct invocation where appropriate.

### 5. Keep the coverage target aligned with CP-03/TR-07
The requirement says 100% line coverage for new and modified code.

Recommended interpretation:
- ensure the ITL/lib code introduced by this milestone is fully covered,
- make the gate explicit and testable,
- avoid claiming whole-repo 100% coverage if that is not what the current script actually enforces.

## Don’t Hand-Roll
- Do not treat blocked subprocess suites as proof the ITL surface is untestable.
- Do not add meaningless tests that assert implementation trivia only to bump numbers.
- Do not overclaim whole-repo 100% if the actual coverage scope is narrower.
- Do not change coverage scope silently without documenting it.

## Common Pitfalls
- Focusing on the wrong files instead of the ITL/lib surface under `c8`
- Adding flaky tests to satisfy branches
- Missing error and no-data branches in audit/helper code
- Leaving docs/scripts out of sync with the actual coverage policy

## Code Examples
- Coverage script: `package.json`
- Existing focused ITL tests: `tests/itl.test.cjs`
- Existing contract tests: `tests/dostuff.test.cjs`
- ITL library surface: `get-stuff-done/bin/lib/itl*.cjs`

## Prescriptive Recommendation
Implement Phase 11 as the smallest safe vertical slice:

1. Measure the current coverage gap for the ITL/lib surface.
2. Add focused direct tests for uncovered branches in the ITL helpers and related lib code.
3. Tighten docs/scripts so the enforced coverage contract is explicit.
4. Keep subprocess-sensitive tests out of the critical path unless they are made stable.

That yields an honest, enforceable coverage baseline for the current milestone.
