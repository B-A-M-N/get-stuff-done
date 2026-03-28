---
phase: "82"
title: "Drift Remediation & Canonical Restoration"
status: "planned"
dependencies:
  - "81"
plans:
  - id: "82-01"
    title: "Restore Postgres canonical memory and refresh health"
    description: |
      1. Diagnose Postgres unavailability (service check, credentials, connectivity)
      2. Restore Second Brain canonical storage (migrations if needed)
      3. Verify `brain status` reports HEALTHY with Postgres active
      4. Run `health check` to confirm all subsystems UNSAFE → HEALTHY
    acceptance:
      - Postgres service running and accessible
      - `brain status --require-postgres` exits 0
      - `.planning/health/latest-degraded-state.json` shows aggregate_state: "HEALTHY"
    verification: "shell: gsd-tools health check"

  - id: "82-02"
    title: "Resolve Phase 70 active CRITICAL drift"
    description: |
      1. Re-run `drift scan --full` to capture current drift state with Postgres restored
      2. For each CRITICAL finding in Phase 70:
         - open-brain-runtime-split
         - planning-degraded-mode-surface
         - planning-server-integrity-claims
      3. Apply targeted remediation:
         - Align open brain runtime with execution truth boundaries
         - Normalize degraded-mode surface documentation and behavior
         - Repair planning server integrity claims with correct context routing
      4. Verify drift downgrade to MAJOR or CLEAR
    acceptance:
      - No CRITICAL drift remaining in Phase 70 artifacts
      - `drift scan` shows highest severity ≤ MAJOR
      - Reconciliation truth refreshed with `drift reconcile --apply-approved`
    verification: "shell: gsd-tools drift scan | grep -q CRITICAL && exit 1 || exit 0"

  - id: "82-03"
    title: "Re-generate Phase 81 TRUTH in non-degraded mode"
    description: |
      1. With Postgres healthy and drift resolved, re-run truth generation without degraded caveats
      2. Verify `phase-truth generate 81` produces final_status: "VALID"
      3. If still CONDITIONAL, investigate remaining gaps and iterate
      4. Write normalized 81-TRUTH.yaml and 81-TRUTH.md
    acceptance:
      - 81-TRUTH.yaml final_status = "VALID"
      - 81-TRUTH.md regenerated consistent with artifact
    verification: "shell: node gsd-tools.cjs phase-truth generate 81 --json | jq -e '.final_status == \"VALID\"'"

  - id: "82-04"
    title: "Re-validate end-to-end milestone closure"
    description: |
      1. Run full `validate-all --strict` sweep
      2. Confirm inventory shows zero REPAIR_REQUIRED and zero MISSING
      3. Verify core gate passes for all phases 70-81
      4. Update milestone-final.json to reflect final validated state
    acceptance:
      - All artifacts admissibility = VALID_ACCEPTED or CONDITIONAL_ACCEPTED (with rationale)
      - No blocking gaps
      - Milestone audit PASS
    verification: "shell: node gsd-tools.cjs validate-all --strict && node gsd-tools.cjs audit admissibility --json | jq -e '.artifacts | all(.admissibility | test(\"VALID|CONDITIONAL\"))'"

---
# Phase 82: Drift Remediation & Canonical Restoration

## Objective

Restore non-degraded operational truth posture and resolve the active CRITICAL drift that prevented Phase 81 from achieving fully VALID closure. This phase **reopens** the closure chain to normalize it under canonical conditions.

## Background

Phase 81 closed under degraded-closure admissibility with the following blockers:
- canonical Postgres memory unavailable (model-facing memory subsystem UNSAFE)
- Phase 70 active CRITICAL drift (open-brain-runtime-split, planning-server-integrity-claims)

These blockers are now addressed systematically to move from CONDITIONAL → VALID across the milestone.

## Tasks (82-01 through 82-04)

See plan sections above.

## Success Criteria

- `81-TRUTH.yaml` regenerated to `final_status: "VALID"` in a non-degraded environment
- All drift severities ≤ MAJOR; no CRITICAL findings
- Validate-all --strict passes with zero gaps
- Milestone re-audit confirms complete, clean closure

## Notes

This phase is **remedial**—it does not change Phase 81's work; it restores the system to a state where that work can be truthfully recorded as fully VALID without caveats.