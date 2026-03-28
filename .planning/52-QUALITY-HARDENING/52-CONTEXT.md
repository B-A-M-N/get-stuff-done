# Phase 52: Quality Hardening & Truth Enforcement

**Phase Number:** 52 (Following Phase 51)
**Milestone:** v0.4.0 Critical Infrastructure & Security Hardening
**Status:** Planned
**Priority:** P0 (System Integrity)

---

## GOAL

Eliminate divergence between claimed system behavior and provable system behavior. Transform the codebase from "spec-driven" to "evidence-driven execution" by implementing mechanical guarantees, adversarial testing, and truth enforcement hooks.

---

## Requirements

### QUALITY-01: Test Coverage Closure

**Purpose:** Ensure all critical code paths have provable test coverage.

- Identify all modules with <85% coverage (target: ≥85% overall)
- Add tests for uncovered branches, error paths, and edge cases
- Include both success and failure scenarios
- Ensure tests are deterministic and reproducible

**Success:** `npm test -- --coverage` shows ≥85% coverage for all modules in `packages/gsd-tools/`

---

### QUALITY-02: Secret & Logging Enforcement (ERR-09)

**Purpose:** Make secret leakage **structurally impossible**, not merely discouraged.

**Architecture:**

- Implement `SafeLogger.sanitize(input)` that:
  - Detects API key patterns (regex for `sk-`, `Bearer `, `Basic `, JWT patterns)
  - Replaces with `[REDACTED]`
  - Enforces on ALL logging call sites

- **ALL** logging must pass through SafeLogger:
  - `logger.error`, `logger.warn`, `logger.info`, `logger.debug`
  - `console.error`, `console.warn`, `console.log` (intercept if used)
  - Any direct `fs.appendFile` to log files

**Mandatory Tests (Kill Tests):**

- Inject fake API key in exception → logs MUST NOT contain key
- Direct `logger.error("Bearer sk-test123")` → output must show "Bearer [REDACTED]"
- `grep -rE "sk-[a-zA-Z0-9]{32,}" logs/` → empty result

**Fail Condition:** Any secret pattern in any log file → phase FAIL.

---

### QUALITY-03: Validation Proof System (ERR-06)

**Purpose:** Prove validation correctness through adversarial testing, not just "happy path."

**Architecture:**

For each input validator (JSON schema, configuration, user input):

1. Define `VALID INPUT SET` and `INVALID INPUT SET`
2. Create test harness:
   - Run all VALID → must PASS
   - Run all INVALID → must FAIL
3. Document edge cases (empty, malformed, oversized, special chars)

**Required Output:**

```
tests/validation_proofs/
  ├── json_validator.proof.json
  ├── config_validator.proof.json
  └── phase_input_validator.proof.json
```

Each proof file contains:

```json
{
  "validator": "name",
  "total_cases": 42,
  "passed_valid": 42,
  "rejected_invalid": 42,
  "false_negatives": 0,
  "false_positives": 0
}
```

**Kill Tests:**

- Remove validator → all invalid inputs must ACCEPT → test FAILS
- Modify validator to accept malformed JSON → tests MUST DETECT

---

### QUALITY-04: Claim vs Reality Audit (Brownfield Truth Engine)

**Purpose:** Automated verification that every requirement claim is backed by enforcement + test evidence.

**Architecture:**

Create `truth_audit` command that:

1. Parses `.planning/REQUIREMENTS.md` → extracts all REQUIREMENT-IDs with MUST/SHALL
2. For each requirement:
   - Find implementation file (code)
   - Find test file (coverage)
   - Find enforcement mechanism (gate, hook, verification)
3. Flag as UNPROVEN if:
   - No implementation exists
   - No test exists
   - Implementation lacks enforcement (can be bypassed)
   - Test only covers happy path

**Output:**

```
.planning/audit/truth_audit.json
```

Example:

```json
{
  "total_requirements": 42,
  "proven": 38,
  "unproven": 4,
  "failures": [
    {
      "id": "ERR-09",
      "claim": "API keys never logged",
      "evidence": {
        "test": null,
        "enforcement": "soft recommendation only",
        "implementation": "logger used without sanitization in 3 locations"
      },
      "status": "FAIL"
    }
  ]
}
```

**Gate:** If `unproven > 0`, phase FAILS.

---

## Phase Structure

**4 Plans (sequential — each depends on previous):**

- **52-01:** Test Coverage Closure (base layer)
- **52-02:** Secret & Logging Enforcement (structural guarantee)
- **52-03:** Validation Proof System (correctness provability)
- **52-04:** Claim vs Reality Audit (system-wide truth verification)

---

## Out of Scope

- General code quality improvements (formatting, naming)
- Performance optimization
- Documentation cleanup
- Refactoring for aesthetics

---

## Success Criteria

- Test coverage ≥85% across all critical modules
- SafeLogger prevents ANY secret pattern from appearing in logs (verified by grep)
- Every validator has proof.json showing 0 false negatives/positives
- truth_audit.json shows 0 unproven requirements
- All kill tests fail when protection removed (demonstrates test effectiveness)

---

## Risks

- **Risk:** SafeLogger may miss logging paths that bypass standard loggers
  - **Mitigation:** Comprehensive grep for `console.`, `fs.appendFile`, `process.stdout` after implementation; add type-check rule to prevent direct usage

- **Risk:** Validation adversarial tests may be incomplete
  - **Mitigation:** Use property-based testing (fast-check) to generate edge cases automatically

- **Risk:** truth_audit may over-flag requirements that are "obvious"
  - **Mitigation:** Audit only applies to REQUIREMENTS.md defined IDs; decorative prose ignored

---

## Blockers

- Requires Phase 51 completion (state gates must be functional)
- Needs stable codebase (no mid-phase refactors)

---

## Notes

This phase operationalizes the "Evidence-Driven Execution" principle: **trust requires proof**. It directly addresses the quality gaps from 2025-03-25 audit:

- Uncommitted test files
- Missing function coverage
- Missing adversarial scenarios
- Requirement enforcement gaps (ERR-09, ERR-06)

Without this phase, the system remains "documentation-driven" rather than "guarantee-driven."
