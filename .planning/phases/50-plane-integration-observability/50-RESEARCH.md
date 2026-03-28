---
phase: 50
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 49
    reason: "Inbound and outbound Plane paths now exist and can be observed as a single integration surface."
---

# Phase 50 Research: Plane Integration Observability

## Summary

Phase 50 should turn the existing Plane integration from "implemented" into "operable." The repo already has:
- outbound Plane sync through `plane-client.cjs`, `roadmap-plane-sync.cjs`, checkpoint sync, and summary sync
- inbound Plane webhooks through `plane-webhook-sync.cjs` and `POST /v1/plane/webhook`
- generic Planning Server metrics and Firecrawl health/audit surfaces

What is missing is a Plane-specific operator surface that answers:
- is Plane configured?
- is the Plane API reachable?
- are outbound requests succeeding or failing?
- are webhook deliveries arriving?
- should GSD temporarily stop attempting Plane sync because the integration is degraded?

Primary recommendation:
- implement a `plane health/status` surface in `gsd-tools`
- add Plane-specific health/audit summaries to `second-brain.cjs`
- add a lightweight circuit-breaker state for Plane sync attempts
- surface webhook and outbound metrics in a single operator-facing report

## Current Reality

### Existing observability primitives

- `get-stuff-done/bin/lib/plane-client.cjs`
  - tracks in-memory rate limit buckets
  - logs all requests through `secondBrain.recordFirecrawlAudit(...)` with `plane-*` action names
  - retries transient failures
  - does not expose a health summary or breaker state
- `get-stuff-done/bin/lib/plane-webhook-sync.cjs`
  - normalizes inbound webhook events
  - publishes broker topics
  - returns structured accepted/ignored/error results
  - does not persist Plane-specific delivery counters beyond generic audit/server logs
- `get-stuff-done/bin/lib/planning-server.cjs`
  - already has `/health` and `/metrics`
  - already exposes generic request/error/rate-limit counters
  - now includes `/v1/plane/webhook`
  - does not expose Plane-specific metrics as a distinct operator view
- `get-stuff-done/bin/lib/second-brain.cjs`
  - already has `getFirecrawlHealthSummary()`
  - already has `getRecentAudits()`
  - already stores `plane-*` actions in the same audit stream
  - does not yet expose a `getPlaneHealthSummary()` or Plane audit-focused report
- `get-stuff-done/bin/gsd-tools.cjs`
  - already exposes `firecrawl health`, `firecrawl audit`, and `brain health`
  - does not expose `plane status`, `plane health`, or `plane audit`

### Missing pieces

- no Plane-specific operator command
- no Plane-specific health summary aggregator
- no circuit breaker for repeated Plane failures
- no explicit "webhooks received recently vs stale" status surface
- no Phase 50 artifacts on disk before this research
- `OBSERV-PLANE-01` and `OBSERV-PLANE-02` are referenced in `ROADMAP.md` but do not exist in `.planning/REQUIREMENTS.md`

That last point matters: Phase 50 should define its operational contract in its phase artifacts unless requirements are added first.

## Practical Requirement Interpretation

### OBSERV-PLANE-01

Operational meaning for this repo:
- an operator can query a single command and see the effective health of Plane integration
- that view includes configuration, recent success/error shape, and webhook freshness

### OBSERV-PLANE-02

Operational meaning for this repo:
- the integration can degrade deliberately instead of thrashing on repeated failures
- the operator can see breaker/degraded state clearly and know why Plane sync is being skipped or warned

## Recommended Scope

### Required

- add `plane status` or `plane health` command to `gsd-tools`
- add `getPlaneHealthSummary()` to `second-brain.cjs`
  - aggregate recent `plane-*` audit rows
  - summarize latency by action
  - summarize error rates
  - report recent webhook activity
- add a lightweight Plane circuit breaker module or state helper
  - open breaker after repeated recent failures
  - return degraded/skipping status instead of hammering Plane indefinitely
  - keep it narrow and local to Plane integration
- add focused tests for the health summary and breaker behavior

### Strongly recommended

- add `plane audit` command mirroring the Firecrawl audit surface but filtered to `plane-*` actions
- add webhook freshness signal such as "last inbound event at"
- add config-state reporting:
  - `PLANE_API_URL`
  - whether `PLANE_API_KEY` is set
  - whether `PLANE_PROJECT_ID` is set
  - whether `PLANE_WEBHOOK_TOKEN` is set

### Out of scope

- dashboards or external metrics backends
- generalized incident management
- rewriting the existing audit schema
- broad multi-provider observability abstractions

## Existing Patterns to Reuse

### Firecrawl health pattern

The closest existing model is:
- `gsd-tools firecrawl health`
- `secondBrain.getFirecrawlHealthSummary()`

That means Phase 50 should not invent a new UI shape from scratch. The clean move is to mirror that pattern for Plane:
- CLI route
- summary aggregator in `second-brain.cjs`
- focused tests

### Generic degraded-mode status

The repo already has:
- `health degraded-mode`
- `brain health`

Phase 50 should integrate with that style rather than inventing a bespoke one-off diagnostic output nobody else uses.

## Circuit Breaker Recommendation

This should be intentionally lightweight.

Recommended behavior:
- keep failure counters in memory with a short time window
- open breaker after N consecutive failures or high recent error rate
- half-open after cooldown
- close on successful request

Recommended first version:
- local per-process breaker keyed by Plane host/project
- no persistent state file yet
- command output should still report breaker state explicitly

This avoids over-design while still making repeated Plane outages visible and non-destructive.

## Likely Implementation Shape

### Candidate files

- `get-stuff-done/bin/lib/plane-health.cjs`
  - health summary helpers
  - circuit breaker state
- `get-stuff-done/bin/lib/second-brain.cjs`
  - `getPlaneHealthSummary()`
  - optional filtered audit reader
- `get-stuff-done/bin/gsd-tools.cjs`
  - `plane status`
  - optionally `plane audit`
- `tests/plane-health.test.cjs`

### Command shape

Recommended first command:

```bash
node get-stuff-done/bin/gsd-tools.cjs plane status
```

Expected output should include:
- configured: true/false
- api_reachable: true/false/unknown
- breaker_state: closed/open/half-open
- recent_outbound_actions
- recent_error_rate
- last_webhook_received_at
- top failing Plane actions

## Bottom Line

Phase 50 should not try to make Plane "more integrated."
It should make Plane integration observable enough that an operator can trust, diagnose, and temporarily degrade it.

The next plan should therefore focus on:
- `plane status`
- Plane-specific health summary aggregation
- lightweight breaker state
- focused tests

Before execution, either add `OBSERV-PLANE-01` / `OBSERV-PLANE-02` to `.planning/REQUIREMENTS.md` or treat this research file as the authoritative contract for the phase.

<!-- GSD-AUTHORITY: 50-01-1:73e092c26a83aa48dd614e158c6d8102e86060da38443a86f5b656a3d3fec65b -->
