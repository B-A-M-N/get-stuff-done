---
phase: 73
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 70
    reason: "Phase 70 already defines the catalog, truth-surface inventory, and baseline classification vocabulary."
  - phase: 72
    reason: "Phase 72 verification artifacts now emit typed verification drift and evidence-first truth inputs that Phase 73 can consume directly."
---

# Phase 73 Research: Drift Detection Engine

## Summary

Phase 73 should be implemented as a thin engine layered on top of the existing Phase 70 drift primitives, not as a second independent catalog system.

The repo already has:
- a machine-readable baseline truth-surface inventory in [`drift_catalog.yaml`](/home/bamn/get-stuff-done/.planning/phases/70-drift-surface-mapping/drift_catalog.yaml)
- deterministic drift type and severity helpers in [`drift-classifier.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/drift-classifier.cjs)
- live probe collection logic already embedded in [`drift-catalog.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/drift-catalog.cjs)
- hardened verification artifacts from Phase 72 that now produce typed verification-drift inputs

What is missing is:
- a reusable runtime scan engine
- a current runtime report artifact
- a canonical CLI cluster for `drift scan`, `drift report`, and `drift status`
- operator-health integration that exposes active drift truth
- severity-based exit behavior for pipeline and operator use

Primary recommendation:
- add `get-stuff-done/bin/lib/drift-engine.cjs` as the runtime scan/report module
- reuse `drift-catalog.cjs` probe helpers instead of duplicating probe logic
- keep `drift-classifier.cjs` as the severity/type rules module and extend it conservatively
- add `drift scan`, `drift report`, and canonical `drift status` to [`gsd-tools.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs)
- write `.planning/drift/latest-report.json` as the non-committed runtime artifact
- inject active drift visibility into existing health surfaces rather than inventing a parallel operator dashboard

## Current Reality

### Existing usable primitives

- [`get-stuff-done/bin/lib/drift-catalog.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/drift-catalog.cjs)
  - already collects repo-local and installed-runtime probe results
  - already models baseline truth surfaces and active/historical split
  - currently writes Phase 70 artifacts, but its probe gathering is reusable for Phase 73
- [`get-stuff-done/bin/lib/drift-classifier.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/drift-classifier.cjs)
  - already infers drift type
  - already classifies severity using impact × exploitability
  - already distinguishes healthy, active, and historical entries
  - does not yet model runtime report confidence, `missing_surface`, `untracked_surface`, or predicted impact
- [`get-stuff-done/bin/lib/brain-manager.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/brain-manager.cjs)
  - already exposes operator-facing backend truth for brain health
  - is a natural place to surface current drift severity without mutating planning state
- [`get-stuff-done/bin/gsd-tools.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs)
  - already exposes `drift catalog`
  - does not expose a current runtime scan/report/status cluster
- Phase 72 verification outputs
  - verification artifacts now encode typed drift, blocker/degrader anti-patterns, and direct evidence rules
  - Phase 73 can consume those artifacts without re-parsing narrative prose

### Missing pieces

- no `drift-engine.cjs`
- no `.planning/drift/latest-report.json`
- no `drift scan`
- no `drift report`
- no operator-facing `drift status`
- no drift-specific CLI-level tests
- no drift-health integration tests

## Standard Stack

- Node.js stdlib only for the core scan/report engine
  - `fs`
  - `path`
  - `child_process`
- existing internal helpers instead of external packages
  - `drift-catalog.cjs` for probe collection
  - `drift-classifier.cjs` for type/severity logic
  - `core.cjs` / sanctioned write paths for artifact emission
- Node test runner (`node --test`) for focused regression suites

No new dependency appears justified. This is system-truth plumbing, not a library-selection problem.

## Architecture Patterns

### 1. Catalog baseline + runtime overlay

Recommended model:
- catalog = expected truth surface
- runtime scan = actual observed truth surface
- report = overlay of current observation against baseline

That means Phase 73 should not regenerate the catalog. It should load the catalog, run probes, then annotate:
- healthy entries
- active drift
- historical drift
- `missing_surface`
- `untracked_surface`
- `insufficient_evidence`
- `degraded_state`

### 2. Single engine, multiple renderers

Recommended structure:
- `scanDrift(cwd, opts)` returns one canonical machine object
- `writeLatestReport(cwd, report)` persists it
- `renderDriftStatus(report, opts)` produces human output
- `readLatestReport(cwd)` powers `drift report` and health integration

This avoids drift between `scan`, `status`, and health surfaces.

### 3. Severity classification is not reconciliation

Phase 73 should stop at:
- type
- severity
- evidence confidence
- predicted effect

It should not:
- rewrite `STATE.md`
- rewrite `ROADMAP.md`
- rewrite verification artifacts

Those mutations belong to Phase 74.

### 4. Health integration reads, not recomputes

Recommended operator pattern:
- health surface reads the latest report
- it does not rerun ad hoc drift logic

This keeps operator truth aligned with the canonical machine artifact and avoids double-implementation.

## Recommended Scope

### Required

- add `get-stuff-done/bin/lib/drift-engine.cjs`
  - load baseline catalog
  - orchestrate live probes
  - detect `missing_surface` and `untracked_surface`
  - classify findings
  - emit `.planning/drift/latest-report.json`
- extend `drift-classifier.cjs`
  - add conservative confidence handling
  - add predicted-effect helpers
  - preserve existing active/historical semantics
- add `drift scan`, `drift report`, `drift status`
- add focused test coverage:
  - `tests/drift-engine.test.cjs`
  - `tests/drift-cli.test.cjs`
- inject active drift visibility into existing operator health

### Strongly recommended

- support `--json` on scan/report surfaces
- support `--full` on status for historical drift expansion
- include source report metadata:
  - generated_at
  - catalog_hash
  - probe_version or git baseline
- include `affected` and/or `predicted_effect` in the report in the shape Phase 74 expects

### Out of scope

- reconciliation or status mutation
- repair planning
- retrofitting every historical artifact in this phase
- a new dashboard or web UI

## Common Pitfalls

- treating subsystem unavailability as drift by default
  - per the locked contract, unavailable is `degraded_state` or `insufficient_evidence` unless contradiction is observed
- rebuilding Phase 70 catalog generation inside Phase 73
  - Phase 73 should consume the catalog, not replace it
- letting `drift status` and health surfaces compute separate truths
  - both should read the same latest report
- overstating severity with weak evidence
  - no strong evidence means no strong claim
- hiding historical drift entirely
  - it should be retained in machine output even if suppressed by default in status

## Open Questions / Assumptions

- Assumption: the cleanest first integration point for operator truth is to have `drift status` and health surfaces read one shared latest-report artifact rather than each performing their own scan.
- Open question: whether health integration should attach first to `brain health`, `health degraded-mode`, or both can stay implementation-flexible so long as one existing operator-health surface reports active drift truth in this phase.

## Don't Hand-Roll

- do not hand-roll a second severity system apart from [`drift-classifier.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/drift-classifier.cjs)
- do not hand-roll ad hoc runtime probes disconnected from [`drift-catalog.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/drift-catalog.cjs)
- do not hand-roll separate report shapes for scan, status, and health
- do not invent a broad event store or observability subsystem here

## Code Examples

### Recommended engine split

```javascript
// drift-engine.cjs
function scanDrift(cwd, options = {}) {
  const catalog = loadCatalog(cwd);
  const probes = collectProbeResults(cwd, options);
  const findings = compareCatalogToRuntime(catalog, probes);
  return classifyRuntimeReport(findings, { probes, catalog });
}

function writeLatestReport(cwd, report) {
  // write .planning/drift/latest-report.json
}

function renderStatus(report, options = {}) {
  // default active-only, --full includes historical
}
```

### Recommended report shape

```json
{
  "generated_at": "2026-03-27T00:00:00Z",
  "catalog_hash": "<sha256>",
  "summary": {
    "critical": 1,
    "major": 2,
    "minor": 1,
    "historical": 3
  },
  "findings": [
    {
      "id": "phase73-open-brain-runtime-split",
      "type": "execution_drift",
      "severity": "CRITICAL",
      "confidence": "high",
      "predicted_effect": {
        "verification_status": "INVALID",
        "operator_health": "DEGRADED"
      }
    }
  ]
}
```

## Bottom Line

Phase 73 should be executed as a runtime overlay on top of the Phase 70 catalog and the Phase 72 verification contract.

The right implementation shape is:
- one scan engine
- one current machine report
- one canonical operator surface
- one health integration path
- no reconciliation yet

That keeps the phase narrow, mechanically useful, and cleanly consumable by Phase 74.

<!-- GSD-AUTHORITY: 73-00-0:0490bf7065d02dad7b2974a6557c429222f1773fdf4d4231559781903330bc47 -->
