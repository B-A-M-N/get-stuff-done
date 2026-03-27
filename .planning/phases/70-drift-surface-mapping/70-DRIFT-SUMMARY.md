# Phase 70 Drift Summary

Catalog hash: `18a58ae1e5ab1f698cc16172f1582cfaaa88603d071699f3ee138017eebd5994`
Source of truth: `.planning/phases/70-drift-surface-mapping/drift_catalog.yaml`

## Active Hotspots
- `phase70-open-brain-runtime-split` — CRITICAL execution_drift; requirement `TRUTH-DRIFT-01`
  Evidence: node get-stuff-done/bin/gsd-tools.cjs brain open-status --raw, node /home/bamn/.codex/get-shit-done/bin/gsd-tools.cjs brain open-status --raw
- `phase70-planning-server-integrity-claims` — CRITICAL verification_drift; requirement `TRUTH-CLAIM-01`
  Evidence: get-stuff-done/bin/lib/planning-server.cjs

## Historical Non-Blocking Drift
- `phase70-recent-structural-history-50-55` — CRITICAL verification_drift; non-blocking historical cluster
  Evidence: .planning/v0.6.0-MILESTONE-AUDIT.md, .planning/phases/50-plane-integration-observability/50-VERIFICATION.md, .planning/phases/53-second-brain-connection-fallback-hardening/53-VERIFICATION.md, .planning/phases/54-model-facing-second-brain-via-mcp/54-VERIFICATION.md, .planning/phases/55-open-brain-v1-foundations/55-VERIFICATION.md

## Memory Truth Boundaries
- `phase70-memory-fail-closed-boundary` — boundary state `disabled`

## Healthy Live Surfaces
- `phase70-planning-truth-surface` — spec_drift surface currently aligned
- `phase70-installed-milestone-resolution` — execution_drift surface currently aligned
- `phase70-planning-degraded-mode-surface` — execution_drift surface currently aligned

## Installed vs Repo-Local Truth
- `phase70-installed-milestone-resolution` — activity `healthy`, severity `MINOR`
- `phase70-open-brain-runtime-split` — activity `active`, severity `CRITICAL`
<!-- GSD-AUTHORITY: 70-02-2:87908fd04bce15d789ec70d45950d4af878acce2ff8b3fd6e10d8dd20de70ba5 -->
