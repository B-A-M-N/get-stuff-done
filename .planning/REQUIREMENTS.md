# Phase 52 Truth Audit Requirements
#
# Canonical audit input for 52-04. Requirement entries stay single-line so
# the audit engine can parse them deterministically and map each claim to
# evidence without inference.

QUALITY-01: The system MUST achieve >=85% line and branch coverage for all critical modules in packages/gsd-tools/ as defined by Phase 52 coverage enforcement. | source: .planning/phases/52-truth-enforcement-hardening/52-CONTEXT.md
QUALITY-02: All logging SHALL be sanitized to prevent secret leakage across logs, console output, exception messages, and HTTP responses. | source: .planning/phases/52-truth-enforcement-hardening/52-CONTEXT.md
QUALITY-03: Validation proofs MUST have zero false negatives and zero false positives for every validator included in the phase-52 proof inventory. | source: .planning/phases/52-truth-enforcement-hardening/52-CONTEXT.md
QUALITY-04: The truth audit SHALL verify every requirement has explicit implementation, test, and non-bypassable enforcement evidence before the phase passes. | source: .planning/phases/52-truth-enforcement-hardening/52-CONTEXT.md
PLANE-WEBHOOK-01: The system SHALL expose an authenticated Plane webhook endpoint on the Planning Server that validates inbound payloads and normalizes supported events into a stable internal contract. | source: .planning/phases/49-plane-webhooks-incremental-sync/49-RESEARCH.md
PLANE-TRIGGER-01: Accepted Plane webhook events MUST publish deterministic internal trigger messages for downstream automation without directly mutating planning files in the webhook handler. | source: .planning/phases/49-plane-webhooks-incremental-sync/49-RESEARCH.md
OBSERV-PLANE-01: The system SHALL expose a Plane-specific operator status surface that reports configuration state, recent outbound sync health, recent inbound webhook freshness, and top recent Plane integration failures from the canonical audit stream. | source: .planning/phases/50-plane-integration-observability/50-RESEARCH.md
OBSERV-PLANE-02: Repeated Plane integration failures MUST transition the integration into an explicit degraded or circuit-breaker state that is visible to operators and closes automatically after successful recovery. | source: .planning/phases/50-plane-integration-observability/50-RESEARCH.md
BRAIN-OPS-01: Second Brain connection initialization MUST avoid noisy repeated Postgres auth/pool failures and degrade deterministically to SQLite with an explicit operator-visible reason. | source: v0.5.0 milestone definition 2026-03-26
BRAIN-OPS-02: Memory-dependent commands and tests SHALL close or reuse Second Brain resources cleanly so fallback noise does not mask real failures or exhaust local connection limits. | source: v0.5.0 milestone definition 2026-03-26
BRAIN-OPS-03: The system SHALL expose a concise operational health and runbook surface for Second Brain mode, active backend, and degraded-state cause. | source: v0.5.0 milestone definition 2026-03-26
MEMORY-MCP-01: Model-facing retrieval and writeback to Second Brain MUST use a sanctioned MCP integration path rather than direct ad hoc database coupling inside planner or executor prompts. | source: v0.5.0 milestone definition 2026-03-26
MEMORY-MCP-02: Model-facing memory queries MUST preserve Firecrawl as the sole normalization and retrieval boundary for external context while allowing curated prior execution memory to be merged into planning context. | source: v0.5.0 milestone definition 2026-03-26
OPEN-BRAIN-01: The system MUST create a separate `gsd_open_brain` Postgres schema for long-horizon memory, distinct from `gsd_local_brain`, with graph-ready tables for memories, links, recall events, and consolidation jobs. | source: Open Brain sidecar definition 2026-03-27 | status: complete (55-01)
OPEN-BRAIN-02: The system MUST support local embedding generation for Open Brain memories using a default local provider, with no requirement for Supabase, OpenRouter, or other paid hosted services. | source: Open Brain sidecar definition 2026-03-27 | status: complete (55-01)
OPEN-BRAIN-03: The system MUST ingest selected Firecrawl-normalized artifacts into Open Brain without coupling Open Brain storage to Second Brain operational tables. | source: Open Brain sidecar definition 2026-03-27 | status: complete (55-02)
OPEN-BRAIN-04: The system MUST provide bounded semantic retrieval for Open Brain memories ranked by similarity, recency, reuse, and feedback quality rather than exposing raw database rows to prompts. | source: Open Brain sidecar definition 2026-03-27 | status: complete (55-02)
OPEN-BRAIN-05: The system MUST record recall outcomes so Open Brain ranking can improve over time based on measured helpful and harmful retrieval signals. | source: Open Brain sidecar definition 2026-03-27 | status: complete (55-02)
OPEN-BRAIN-06: Open Brain failure or unavailability MUST NOT break existing planner, executor, Firecrawl, or Second Brain operational flows. | source: Open Brain sidecar definition 2026-03-27 | status: complete (55-01)

# needs-clarification
# None.

# deprecated
# None.

<!-- GSD-AUTHORITY: 53-01-1:0e8bfbfbb096ebf6318473f3546e74a2adae079266a2b96d0bb4e3f3c6d15501 -->
