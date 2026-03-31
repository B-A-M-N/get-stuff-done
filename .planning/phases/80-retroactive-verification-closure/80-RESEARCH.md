---
phase: 80
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 72
    reason: "Phase 80 backfills the evidence-first verification contract introduced in Phase 72 and must use that contract rather than inventing a second verification shape."
  - phase: 78
    reason: "Phase-truth backfill already surfaced which late phases remain conditional because verification artifacts are missing."
  - phase: 79
    reason: "The milestone audit after the Phase 79 gauntlet identified the exact missing verification surfaces and turned them into hard closure work."
---

# Phase 80 Research: Retroactive Verification Closure

## Summary

Phase 80 should backfill authoritative `VERIFICATION.md` artifacts for phases `72`, `73`, `74`, `75`, and `77` using existing summary proof indexes, current implementation state, existing truth artifacts, and direct command/file evidence. The goal is not to replay historical execution or rewrite phase outputs. The goal is to close the milestone's missing verification chain with evidence-first phase verdicts that honestly reflect what can still be proven now.

Primary recommendation:
- generate one `N-VERIFICATION.md` per missing phase using the locked Phase 72 verification contract
- treat summaries and `TRUTH.yaml` as source inputs and claim inventories, not final proof
- re-run direct checks against current code and artifacts wherever those claims remain observable
- mark gaps explicitly when a historical claim cannot be re-proven from current evidence
- keep scope limited to phases `72`, `73`, `74`, `75`, and `77`

This phase should not rewrite summaries, regenerate truth artifacts, or treat milestone audit prose as substitute evidence.

## Current Reality

### What exists now

- `.planning/v0.7.0-MILESTONE-AUDIT.md`
  - names the exact blockers: missing `VERIFICATION.md` for phases `72`, `73`, `74`, `75`, and `77`
- `.planning/phases/72-verification-hardening/72-TRUTH.yaml`
- `.planning/phases/73-drift-detection-engine/73-TRUTH.yaml`
- `.planning/phases/74-state-reconciliation-layer/74-TRUTH.yaml`
- `.planning/phases/75-degraded-mode-enforcement/75-TRUTH.yaml`
- `.planning/phases/77-execution-surface-governance/77-TRUTH.yaml`
  - all already record `verification_gap` as the main missing closure input
- phase summaries for `72`, `73`, `74`, `75`, and `77`
  - already contain structured proof indexes, claimed outcomes, key files, and verification commands
- existing neighboring verification artifacts:
  - `70-VERIFICATION.md`
  - `71-VERIFICATION.md`
  - `76-VERIFICATION.md`
  - `78-VERIFICATION.md`
  - `79-VERIFICATION.md`
  - these establish the current verification conventions and closure expectations

### Missing pieces

- no authoritative `VERIFICATION.md` exists for phases `72`, `73`, `74`, `75`, or `77`
- no shared helper exists to synthesize retroactive verification from summary proof indexes plus current repo evidence
- no milestone-level closure can be claimed while these phase-level proof surfaces are absent

## Standard Stack

- Node.js stdlib and existing repo helpers
- existing verification contract in:
  - `get-stuff-done/bin/lib/verify.cjs`
  - `get-stuff-done/templates/verification-report.md`
- existing phase and artifact discovery helpers in:
  - `get-stuff-done/bin/lib/phase.cjs`
  - `get-stuff-done/bin/lib/core.cjs`
  - `get-stuff-done/bin/lib/frontmatter.cjs`
- existing truth sources:
  - summary proof indexes
  - `N-TRUTH.yaml`
  - current machine artifacts such as drift, reconciliation, degraded-state, governance policy, and gauntlet outputs

No new dependency is justified. This is artifact closure and verification synthesis work, not a new subsystem.

## Architecture Patterns

### 1. Retroactive verification is still evidence-first verification

Phase 80 should reuse the Phase 72 contract shape:
- `Observable Truths`
- `Required Artifacts`
- `Key Link Verification`
- `Requirements Coverage`
- `Anti-Pattern Scan`
- `Drift Analysis`
- `Final Status`

Retroactive here changes the evidence collection posture, not the contract. The artifact must still stand on direct evidence, not on “the summary says it happened.”

### 2. Summary proof indexes are claim maps, not proof by themselves

Use each phase summary to discover:
- claimed outcomes
- task commits
- verification commands
- expected key files

Then confirm those claims against current observable state:
- files still exist and are substantive
- the referenced CLI or module surfaces still behave consistently
- direct tests or checks still pass when they are the right proof surface

If a summary points to proof that can no longer be re-established, record that as an explicit gap or conditional state.

### 3. Phase-truth backfill should drive prioritization, not replace verification

The `72/73/74/75/77-TRUTH.yaml` artifacts already prove:
- which phases are missing verification
- which claims remain in-scope
- which current degraded caveats affect interpretability

Recommended use:
- use `TRUTH.yaml` to seed scope and known gaps
- do not cite `TRUTH.yaml` as the sole evidence that a requirement is valid

Phase truth is a synthesis shell. Phase 80 still needs direct verification artifacts.

### 4. Verify current observable consequences, not inaccessible historical minutiae

For retroactive closure, the strongest acceptable proof is usually:
- current code shape
- current CLI behavior
- current machine artifacts produced by those modules
- focused tests that still exercise the claimed path

Do not require historical wall-clock recreation if the phase goal was to establish enduring behavior that is still directly observable.

Examples:
- Phase 72 can be verified by current verification scaffold shape and verifier behavior
- Phase 73 can be verified by current drift scan/report/status behavior and machine artifact contract
- Phase 74 can be verified by current reconcile/preview behavior and reconciliation artifact contract
- Phase 75 can be verified by current degraded-policy artifact and fail-closed enforcement behavior
- Phase 77 can be verified by current governance policy and CLI governance enforcement behavior

### 5. Honest retroactive closure must allow conditional outcomes

Expected precedence:
1. direct contradictory evidence or broken required artifact path => `INVALID`
2. proof surface substantially present but one or more claims only indirectly provable now => `CONDITIONAL`
3. fully re-proven current behavior with direct evidence for all required claims => `VALID`

This matches the repo's truth-hardening posture: absence of proof must not be flattened into a pass.

## Recommended Scope

### Required

- create `72-VERIFICATION.md`
- create `73-VERIFICATION.md`
- create `74-VERIFICATION.md`
- create `75-VERIFICATION.md`
- create `77-VERIFICATION.md`
- ensure each artifact follows the Phase 72 evidence-first verification structure
- verify phase claims against current code and sanctioned CLI/module surfaces
- cite direct evidence for each requirement row
- surface any unverifiable historical claims as explicit gaps or conditional notes

### Strongly recommended

- build a small reusable helper for retroactive verification synthesis so Phase 80 does not hand-author five unrelated artifacts
- keep phase-specific evidence selection narrow rather than trying to rerun broad milestone suites
- reuse the summaries' proof indexes and key-files blocks to derive initial verification checklists
- keep the final verdict grounded in the specific phase goal, not the current milestone's global degraded posture alone

### Out of scope

- regenerating `TRUTH.yaml` / `TRUTH.md`
- retroactively rewriting plan or summary files
- re-executing historical task commits as if time could be rewound
- Nyquist `VALIDATION.md` backfill for phases `73` through `79`
- roadmap or requirements bookkeeping repair already assigned to Phase 81

## Common Pitfalls

- treating summary prose as direct evidence
  - summaries are a map to evidence, not the evidence-bearing verdict
- downgrading every retroactive phase just because current global degraded posture is unsafe
  - the verification artifact should mention current posture where relevant, but still verify the phase goal directly
- trying to prove historical trivia that is no longer materially observable
  - verify durable behavior and artifacts instead
- rewriting late-phase code to make verification easier
  - Phase 80 is closure work, not implementation repair unless a real defect is discovered
- hand-authoring five inconsistent verification formats
  - use one contract and one evidence rubric
- allowing phase truth backfill to masquerade as completed verification
  - `verification_gap` is exactly what this phase is closing

## Open Questions / Assumptions

- Assumption: the current repo state still preserves enough direct evidence to verify the late truth-hardening phases without re-running their original historical environments.
- Assumption: current command and test surfaces remain representative of the phase claims because these phases established enduring enforcement behavior rather than one-off migrations.
- Assumption: some requirement rows may still need `CONDITIONAL` instead of `VALID` if a claim cannot be re-proven directly from current artifacts.
- Open question for planning: whether Phase 80 should introduce a dedicated helper script/module for generating retroactive verification artifacts or keep synthesis lightweight and phase-local.

## Don't Hand-Roll

- do not invent a second verification artifact schema
- do not copy summaries into `VERIFICATION.md`
- do not use milestone audit prose as final evidence
- do not auto-promote a phase to `VALID` because its current `TRUTH.yaml` looks healthy after Phase 80
- do not widen scope into Nyquist closure or milestone bookkeeping

## Code Examples

### Recommended retroactive evidence collector shape

```javascript
function collectRetroVerificationEvidence(phaseContext) {
  return {
    summaries: phaseContext.summaries,
    truth: phaseContext.truthPath,
    keyFiles: phaseContext.keyFiles.filter(fileStillExists),
    commandChecks: phaseContext.commands.map(runCheck),
    requirementRows: phaseContext.requirements.map(verifyRequirement),
  };
}
```

### Recommended verdict rule

```javascript
function deriveRetroVerificationStatus(result) {
  if (result.blockers.length > 0) return 'INVALID';
  if (result.gaps.length > 0 || result.escalations.length > 0) return 'CONDITIONAL';
  return 'VALID';
}
```

## Bottom Line

Phase 80 should close the milestone's missing verification chain by producing real `VERIFICATION.md` artifacts for phases `72`, `73`, `74`, `75`, and `77` from current direct evidence plus summary-indexed proof references. The right design is a strict evidence-first backfill: summaries and truth artifacts help locate claims, but only direct observable evidence earns `VALID`, and anything that cannot be re-proven must remain an explicit gap.
