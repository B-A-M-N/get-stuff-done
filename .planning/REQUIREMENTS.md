# Phase 52 Truth Audit Requirements
#
# Canonical audit input for 52-04. Requirement entries stay single-line so
# the audit engine can parse them deterministically and map each claim to
# evidence without inference.

QUALITY-01: The system MUST achieve >=85% line and branch coverage for all critical modules in packages/gsd-tools/ as defined by Phase 52 coverage enforcement. | source: .planning/phases/52-truth-enforcement-hardening/52-CONTEXT.md
QUALITY-02: All logging SHALL be sanitized to prevent secret leakage across logs, console output, exception messages, and HTTP responses. | source: .planning/phases/52-truth-enforcement-hardening/52-CONTEXT.md
QUALITY-03: Validation proofs MUST have zero false negatives and zero false positives for every validator included in the phase-52 proof inventory. | source: .planning/phases/52-truth-enforcement-hardening/52-CONTEXT.md
QUALITY-04: The truth audit SHALL verify every requirement has explicit implementation, test, and non-bypassable enforcement evidence before the phase passes. | source: .planning/phases/52-truth-enforcement-hardening/52-CONTEXT.md

# needs-clarification
# None.

# deprecated
# None.
