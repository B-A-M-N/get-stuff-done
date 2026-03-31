# Phase 54: Model-Facing Second Brain via MCP - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Direct user instruction during `gsd:plan-phase 54`

<domain>
## Phase Boundary

Phase 54 makes Second Brain usable by planner and executor workflows through an MCP integration layer.

This phase is about:
- adding a sanctioned MCP path for model-facing memory access
- keeping Firecrawl as the sole external-context normalization boundary
- defining planner read behavior and executor writeback behavior
- integrating bounded memory retrieval into planning and execution context assembly
- honoring Phase 53 degraded-state truth when model-facing memory is unavailable

This phase is not about:
- replacing Firecrawl as the external web/context control point
- exposing arbitrary SQL execution to workflow agents
- making SQLite the silent fallback contract for model-facing memory
- broad redesign of the existing Second Brain ingestion and audit subsystems
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- The local GenAI toolbox repository to target is `/home/bamn/FireCageMCPGateway/genai-toolbox`.
- The MCP integration should use the GenAI toolbox surface located at that path rather than assuming some other toolkit location.
- Planning should treat the toolbox path as a concrete local dependency to integrate against, not a hypothetical future component.

### Planning Guidance
- Preserve the split between Firecrawl-managed external context and Second Brain-managed internal execution memory.
- Planner access should remain read-only.
- Executor access may include controlled append/writeback behavior for checkpoints and summaries.
- Model-facing memory should respect the explicit backend/degraded-state contract introduced in Phase 53.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current phase and requirement contract
- `.planning/ROADMAP.md` — Phase 54 goal, dependency on Phase 53, and the planned `54-01-PLAN.md` scope.
- `.planning/REQUIREMENTS.md` — `MEMORY-MCP-01` and `MEMORY-MCP-02`.
- `.planning/STATE.md` — current milestone focus and Phase 53/54 sequencing context.

### Prior phase boundary and readiness
- `.planning/phases/53-second-brain-connection-fallback-hardening/53-CONTEXT.md` — what Phase 53 explicitly did and did not include.
- `.planning/phases/53-second-brain-connection-fallback-hardening/53-01-SUMMARY.md` — stable backend-truth and health/status surfaces now available to consume.

### Current implementation surfaces
- `get-stuff-done/bin/lib/second-brain.cjs` — Second Brain runtime, storage, and backend-state truth.
- `get-stuff-done/bin/lib/brain-manager.cjs` — `brain status` / `brain health` operator surfaces.
- `get-stuff-done/bin/lib/context.cjs` — planning/execution context assembly.
- `get-stuff-done/bin/lib/firecrawl-client.cjs` — external-context boundary and audit posture.

### External MCP integration target
- `/home/bamn/FireCageMCPGateway/genai-toolbox` — local GenAI toolbox repository explicitly identified by the user as the target MCP surface.
</canonical_refs>

<specifics>
## Specific Ideas

- Prefer a narrow MCP tool contract over raw SQL exposure.
- Use the local `/home/bamn/FireCageMCPGateway/genai-toolbox` checkout as the concrete reference when defining config, toolsets, and integration tasks.
- Ensure plans include explicit degraded-mode behavior when Postgres-backed model-facing memory is unavailable.
</specifics>

<deferred>
## Deferred Ideas

- Broader memory ranking/search sophistication beyond the initial bounded planning/execution memory pack.
- Any redesign of Firecrawl normalization and retrieval behavior outside the contract required to preserve the boundary.
</deferred>

---

*Phase: 54-model-facing-second-brain-via-mcp*
*Context gathered: 2026-03-26 via direct user instruction*
