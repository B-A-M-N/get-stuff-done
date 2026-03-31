---
phase: 76
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 75
    reason: "Phase 76 must audit the bypassability of the existing degraded-mode enforcement surface."
  - phase: 72
    reason: "Verification artifact hardening defines part of the truth-bearing validator surface that the audit must check."
---

# Phase 76 Research: Enforcement Boundary Audit

## Summary

Phase 76 should be implemented as a combined static and targeted-runtime audit that declares sanctioned truth interfaces explicitly, scans the repo for unsanctioned mutation and skipped-validator paths, and writes a machine-readable bypass inventory proving whether critical truth boundaries are actually enforceable.

The repo already contains many sanctioned truth surfaces:
- `state.cjs`
- `roadmap.cjs`
- `verify.cjs`
- `authority.cjs`
- `gsd-tools.cjs`

What it does not contain yet is:
- an explicit sanctioned interface policy
- an explicit required validator policy
- one machine-readable audit artifact for bypass findings
- one probe layer that can prove critical bypasses possible or impossible

Primary recommendation:
- add `.planning/policy/sanctioned-interfaces.yaml`
- add `.planning/policy/required-validators.yaml`
- add a small audit module that combines:
  - static authoritative-write scanning
  - truth-route and validator policy checks
  - targeted runtime probes
- expose the audit through a sanctioned CLI command and human verification artifact

## Current Reality

### Existing usable primitives

- `get-stuff-done/bin/lib/state.cjs`
  - sanctioned mutation surface for `STATE.md`
- `get-stuff-done/bin/lib/roadmap.cjs`
  - sanctioned mutation surface for roadmap status and phase truth
- `get-stuff-done/bin/lib/verify.cjs`
  - central validator and truth-claim surface
- `get-stuff-done/bin/lib/authority.cjs`
  - authoritative artifact signature contract
- `get-stuff-done/bin/lib/degraded-mode.cjs`
  - current safety boundary whose bypassability now needs to be audited
- `get-stuff-done/bin/gsd-tools.cjs`
  - top-level command dispatcher and current route-enforcement layer

### Missing pieces

- no declared sanctioned writer map
- no declared required validator map
- no static scanner dedicated to authoritative write and truth-claim bypasses
- no audit artifact for bypass findings
- no runtime probe harness for critical surfaces

## Standard Stack

- Node.js stdlib only
- existing repo helpers:
  - `fs`
  - `path`
  - `child_process`
  - internal CLI and verification modules
- YAML policy artifacts in `.planning/policy/`
- JSON audit artifact in `.planning/audit/`
- Node test runner for scanners and runtime probes

No new dependency is justified. The audit can be built with repo-local scanning and CLI execution primitives.

## Architecture Patterns

### 1. Declare sanctioned behavior before auditing it

Recommended artifacts:
- `.planning/policy/sanctioned-interfaces.yaml`
- `.planning/policy/required-validators.yaml`

This prevents the audit from “discovering” policy from whatever the current code happens to do.

### 2. Use one machine artifact with typed findings

Recommended machine output:
- `.planning/audit/enforcement-boundary.json`

Each finding should contain:
- type
- severity
- location
- surface
- path
- repro
- status such as proven or disproven

This artifact is the source of truth for later governance phases.

### 3. Separate static detection from runtime proof

Recommended split:
- static scan identifies candidate bypasses
- targeted probes confirm or disprove critical candidates

This avoids both under-reporting and false certainty.

### 4. Treat authoritative writes as the narrowest hard boundary

Recommended authoritative surface inventory:
- `STATE.md`
- `ROADMAP.md`
- verification artifacts
- summary artifacts
- drift report
- reconciliation artifact
- degraded-state artifact

This should become the core scanner input set.

### 5. Keep the audit phase non-mutating except for its own artifacts

Phase 76 should produce:
- policy artifacts
- audit artifact
- verification artifact
- tests

It should not silently refactor broad truth surfaces while trying to audit them.

## Recommended Scope

### Required

- declare sanctioned interfaces in YAML
- declare required validators in YAML
- add audit module and CLI surface
- statically scan authoritative write paths and truth-claim paths
- add targeted runtime probes for critical surfaces
- write `.planning/audit/enforcement-boundary.json`
- write `76-VERIFICATION.md`
- add tests for:
  - policy loading
  - static bypass classification
  - critical runtime probe behavior

### Strongly recommended

- include finding path or call-chain when possible
- mark findings as `proven`, `disproven`, or `static_only`
- keep artifact schema stable enough for later phases to consume directly
- make the CLI emit raw JSON for automation

### Out of scope

- command-governance narrowing
- broad operator UX changes
- gauntlet-scale adversarial orchestration
- comprehensive repo refactors unrelated to bypass integrity

## Common Pitfalls

- inferring sanctioned writers from current code instead of declaring them
- reporting only “pass/fail” instead of typed findings
- relying on static scan alone for critical paths
- treating CLI guards as sufficient while ignoring internal library writes
- mixing audit with remediation so the phase boundary becomes fuzzy

## Open Questions / Assumptions

- Assumption: runtime probes can stay targeted and do not need to simulate every possible operator workflow.
- Assumption: the policy files belong in `.planning/policy/` because they are governance artifacts, not implementation details.
- Open question intentionally resolved by phase lock: critical bypasses must be proved possible or impossible, not merely suspected.

## Don't Hand-Roll

- do not scatter the sanctioned interface inventory across multiple docs
- do not let the machine artifact devolve into prose-only output
- do not treat unsigned or unsanctioned authoritative writes as acceptable “internal shortcuts”
- do not skip Phase 75 bypass checks just because degraded-mode logic already exists
- do not mark completion while any critical bypass remains only statically suspected

## Code Examples

### Recommended machine finding shape

```json
{
  "type": "writer_bypass",
  "severity": "CRITICAL",
  "location": "get-stuff-done/bin/lib/some-module.cjs:42",
  "surface": ".planning/STATE.md",
  "path": ["some-module.cjs", "fs.writeFileSync"],
  "repro": "invoke helper directly without sanctioned state writer",
  "status": "proven"
}
```

### Recommended audit flow

```javascript
const candidates = scanAuthoritativeSurfaces(policy);
const classified = classifyCandidates(candidates, validators);
const probed = await probeCriticalFindings(classified);
writeAuditArtifact(probed);
```

## Bottom Line

Phase 76 should prove whether the repo’s truth-enforcement boundaries are actually real. It does that by declaring sanctioned behavior explicitly, auditing all authoritative mutation and truth-claim paths, and producing a machine-readable artifact showing that no critical bypass survives.

<!-- GSD-AUTHORITY: 76-00-0:141f53f5fa2de6e47f66385a14500741216cc34dc2e0c06099d066061270604f -->
