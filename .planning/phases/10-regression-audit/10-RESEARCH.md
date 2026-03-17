# Phase 10 Research: Regression Audit

## Objective
Research how to audit the current ITL-enhanced workflow stack for governance regressions, planning drift, and invariant-safety bypasses now that narrative-first intake, richer handoffs, and the adversarial lockability gate all exist.

Additional steering:
- This phase is an audit, not another feature layer.
- The key question is whether current workflows still preserve core GSD planning rigor and do not bypass the new adversarial ambiguity gate.
- Any explicit invariant-extraction language must be checked against real enforcement, not just documentation.

## Standard Stack
- **Audit the current canonical source workflows**
  - `commands/gsd/discuss-phase.md`
  - `commands/gsd/research-phase.md`
  - `commands/gsd/plan-phase.md`
  - `commands/gsd/verify-work.md`
  - corresponding `get-stuff-done/workflows/*.md`
- **Audit the current ITL control surface**
  - `get-stuff-done/bin/lib/itl.cjs`
  - `get-stuff-done/bin/lib/itl-ambiguity.cjs`
- **Audit the focused tests and docs**
  - `tests/itl.test.cjs`
  - `tests/dostuff.test.cjs`
  - `docs/COMMANDS.md`
  - `get-stuff-done/workflows/help.md`

## Architecture Patterns

### 1. Audit for contract drift, not just broken tests
Passing tests are not enough.

Recommended audit dimensions:
- explicit decisions vs inferred guidance
- lockability gate presence vs actual usage
- planning/validation contracts still unchanged
- no workflow prose that overclaims enforcement
- source-of-truth still lives in canonical source files

### 2. Check the adversarial gate path end-to-end
Phase 9 introduced the gate, but Phase 10 must verify whether workflows and docs respect it.

Recommended checks:
- where inferred constraints can be mentioned,
- whether any workflow still implies they can be locked without the gate,
- whether docs overstate current enforcement,
- whether later planning language matches actual code behavior.

### 3. Preserve the original GSD governance model
The user interaction layer has changed a lot by now.

Recommended audit focus:
- no bypass of discuss → research → plan → execute semantics
- no silent scope expansion
- no weakening of checker/validation loops
- no hidden auto-promotion of inferred context into hard requirements

### 4. Prefer explicit findings and small corrective fixes
This phase should behave like a code review with remediation where needed.

Recommended outcome:
- identify concrete drift points,
- patch docs/workflows/tests where claims and implementation diverge,
- avoid introducing new broad behavior unless strictly needed to restore consistency.

## Don’t Hand-Roll
- Do not add new major workflow features under the label of “audit.”
- Do not assume the adversarial gate is fully enforced everywhere without checking.
- Do not treat passing focused tests as full governance proof.
- Do not blur the distinction between documentation fixes and true runtime enforcement.

## Common Pitfalls
- Auditing only code, not workflow/document claims
- Missing overclaims in docs about invariant safety
- Missing workflow branches that still imply old behavior
- Turning the audit into another feature phase instead of a consistency phase

## Code Examples
- Current ambiguity gate: `get-stuff-done/bin/lib/itl-ambiguity.cjs`
- Current planning handoff: `get-stuff-done/workflows/plan-phase.md`
- Current context handoff: `get-stuff-done/workflows/discuss-phase.md`
- Current docs: `docs/COMMANDS.md`, `get-stuff-done/workflows/help.md`

## Prescriptive Recommendation
Implement Phase 10 as the smallest safe vertical slice:

1. Audit workflow/docs/code for any place inferred constraints could be treated as invariants without the adversarial gate.
2. Audit whether planning rigor and governance boundaries still match original GSD intent.
3. Patch any drift directly and add focused regression assertions.
4. Produce a clear audit summary so later phases build on a stable base.

That makes Phase 10 a real regression audit instead of a vague quality pass.
