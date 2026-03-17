# Phase 9 Research: Failure-Mode Testing

## Objective
Research how to build an adversarial ambiguity test harness for the ITL so vague, contradictory, emotional, and invariant-adjacent inputs are stress-tested systematically, and inferred constraints can only become lockable after surviving this adversarial pass.

Additional steering:
- Phase 9 is where the adversarial ambiguity gate becomes real, not just a planning note.
- The system still must preserve the current rule: inferred cues are guidance until explicitly confirmed or adversarially validated.
- This phase should create the basis for a future runtime-enforced `lockable` decision, not just more prose.

## Standard Stack
- **Keep ambiguity logic in the existing ITL modules**
  - `get-stuff-done/bin/lib/itl-ambiguity.cjs`
  - `get-stuff-done/bin/lib/itl-extract.cjs`
  - `get-stuff-done/bin/lib/itl.cjs`
- **Keep verification in focused `node:test` suites**
  - `tests/itl.test.cjs`
  - add new adversarial-focused test files as needed
- **Keep audit persistence reuse**
  - `.planning/itl/audit.sqlite`

## Architecture Patterns

### 1. Introduce an adversarial ambiguity pass as a first-class concept
The system currently scores ambiguity, but it does not yet expose a notion of “safe to lock as invariant.”

Recommended outcome:
- Add a helper or contract that evaluates whether inferred constraints are `lockable`.
- `lockable` must depend on an adversarial pass, not just the absence of normal ambiguity findings.

### 2. Separate ambiguity detection from lockability
These are related but not identical.

Recommended rule:
- `ambiguity` answers: “Does this narrative need clarification?”
- `lockability` answers: “Can any inferred constraint from this narrative safely be treated as invariant?”

This prevents low-ambiguity but underspecified narratives from being over-trusted.

### 3. Build adversarial fixtures, not only happy-path examples
Phase 9 should add coverage for:
- contradictory scope language
- emotionally charged complaints with unclear asks
- mixed priorities
- implicit invariants hidden in soft language
- statements that sound invariant-like but are actually preferences
- sparse narratives that look stable only because too little was said

### 4. Prefer deterministic heuristics plus test fixtures over magical inference
This codebase is intentionally deterministic today.

Recommended behavior:
- Extend the current ambiguity/interpretation heuristics carefully.
- Add explicit fixture-driven assertions for known adversarial inputs.
- Keep failure cases reviewable in code and tests.

### 5. Keep the gate forward-compatible with later workflow enforcement
Phase 9 does not need to retrofit every workflow immediately.

Recommended outcome:
- establish a test-backed helper/API that later phases can call,
- prove it works against adversarial cases,
- then Phase 10 can audit any workflow language that claims to lock inferred invariants.

## Don’t Hand-Roll
- Do not pretend the adversarial gate exists only in docs.
- Do not collapse `ambiguity` and `lockable` into the same field.
- Do not mark inferred constraints as invariant-safe by default.
- Do not add random or non-deterministic model-only tests as the sole coverage.

## Common Pitfalls
- Treating “low ambiguity” as equivalent to “safe to lock”
- Missing emotionally worded inputs that hide vague requirements
- Missing preference-vs-invariant misclassification
- Writing only broad narrative tests without checking the lockability outcome
- Adding a gate name without a test-backed implementation path

## Code Examples
- Current ambiguity module: `get-stuff-done/bin/lib/itl-ambiguity.cjs`
- Current ITL command surface: `get-stuff-done/bin/lib/itl.cjs`
- Existing ITL tests: `tests/itl.test.cjs`

## Prescriptive Recommendation
Implement Phase 9 as the smallest safe vertical slice:

1. Add an adversarial ambiguity / lockability helper to the ITL layer.
2. Build focused adversarial fixtures covering contradiction, vagueness, emotional wording, and pseudo-invariants.
3. Expose a small structured result that later workflows can consume.
4. Do not yet treat all workflows as enforcing it; establish the gate first.

That creates the real ambiguity gate required before invariant extraction can be operationalized.
