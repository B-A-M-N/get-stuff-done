---
phase: 49
status: researched
researched: 2026-03-26
updated: 2026-03-26
depends_on:
  - phase: 48
    reason: "Outbound Plane sync, issue identifiers, and comment sync must exist before inbound Plane events are useful."
---

# Phase 49 Research: Plane Webhooks & Incremental Sync

## Summary

Phase 49 should build an inbound Plane event path on top of the existing Plane foundation, not invent a second server surface. The current repo already has:
- a local HTTP service in `planning-server.cjs`
- authenticated request handling and rate limiting
- a broker for internal fanout
- stable Plane issue identifiers from Phases 47 and 48

The minimal useful Phase 49 is:
- receive authenticated Plane webhook requests on the Planning Server
- normalize and validate supported inbound event payloads
- publish normalized events to the broker for downstream automation
- provide deterministic audit and test coverage

## Current Reality

### Existing surfaces we should reuse

- `get-stuff-done/bin/lib/planning-server.cjs`
  - existing HTTP server
  - auth, rate limiting, metrics, audit hooks
  - currently handles `GET /v1/read`, `GET /v1/extract`, and related server endpoints
  - best target for a webhook listener such as `POST /v1/plane/webhook`
- `get-stuff-done/bin/lib/broker.cjs`
  - already provides `publish(topic, message)` and `subscribe(topicPattern, callback)`
  - suitable for internal fanout of normalized webhook events
- `get-stuff-done/bin/lib/plane-client.cjs`
  - already knows the current Plane project and endpoint base
- `get-stuff-done/bin/lib/roadmap-plane-sync.cjs`
  - already uses stable identifiers `gsd_phase_number` and `gsd_plan_id`
  - these are the right bridge between external Plane events and internal GSD meaning

### Current gaps

- no webhook endpoint exists
- no request-body parser helper exists in `planning-server.cjs`
- no Plane webhook verification helper exists
- no normalized inbound event contract exists
- no Phase 49 plan or tests exist
- `PLANE-WEBHOOK-01` and `PLANE-TRIGGER-01` are referenced in `ROADMAP.md` but do not currently appear in `.planning/REQUIREMENTS.md`

That last point means Phase 49 needs to define its effective contract in the phase artifacts instead of pretending the requirement text already exists elsewhere.

## Recommended Scope

### Required

- add `plane-webhook-sync.cjs`
  - verify webhook authorization/signature
  - parse raw request body
  - normalize supported Plane events into a stable internal shape
  - publish broker topics such as `plane.webhook.received` or `plane.issue.updated`
- add `POST /v1/plane/webhook` to `planning-server.cjs`
- add focused tests for:
  - valid webhook accepted
  - invalid auth/signature rejected
  - malformed JSON rejected
  - supported events normalized and published
  - unsupported events ignored or accepted as no-op with explicit result

### Explicitly out of scope for this phase

- full bidirectional state reconciliation
- directly mutating `ROADMAP.md` or `STATE.md` from inbound Plane events
- generalized CI orchestration engine
- observability/dashboard work planned for Phase 50

## Practical Requirement Interpretation

### PLANE-WEBHOOK-01

Operational meaning for this repo:
- GSD exposes a deterministic inbound endpoint for Plane webhooks
- the endpoint authenticates requests and parses payloads safely
- supported events are normalized and auditable

### PLANE-TRIGGER-01

Operational meaning for this repo:
- inbound Plane events can trigger internal automation surfaces through broker publication
- downstream consumers can subscribe without the webhook handler needing to know all future actions

## Recommended Design

### Endpoint

- `POST /v1/plane/webhook`
- handled inside `planning-server.cjs`
- uses the existing auth/rate-limit/security header model
- accepts JSON only

### Verification model

Minimum acceptable options:
- bearer token using a dedicated env var such as `PLANE_WEBHOOK_TOKEN`
- optionally HMAC if Plane provides signed delivery headers in the target deployment

Pragmatic recommendation:
- start with bearer-token verification because the existing Planning Server auth model already uses bearer handling and constant-time compare patterns
- structure the helper so HMAC verification can be added later without replacing the endpoint

### Normalized internal payload

Recommended output shape:

```javascript
{
  source: 'plane',
  event: 'issue.updated',
  received_at: 'ISO timestamp',
  plane_issue_id: '...',
  gsd_phase_number: '47' | null,
  gsd_plan_id: '48-02' | null,
  raw_type: '...',
  payload: { ...sanitized event body... }
}
```

### Internal trigger path

- publish normalized events through `broker.publish(...)`
- topic naming should stay explicit and low-ambiguity, for example:
  - `plane.webhook.received`
  - `plane.issue.updated`
  - `plane.comment.created`

This keeps Phase 49 useful without having to finish every downstream consumer in the same phase.

## Test Strategy

- use `node:test`
- mock `broker.publish`
- test the normalization helper directly
- test the Planning Server route with raw HTTP requests to a disposable local server instance if needed
- keep focused tests separate from broad server integration suites

## Bottom Line

Phase 49 should be a narrow inbound event phase:
- receive
- verify
- normalize
- publish
- audit

Do not widen it into full bidirectional sync or observability work. That would repeat the same phase-bloat pattern that already caused ledger drift elsewhere.
