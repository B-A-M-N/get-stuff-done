---
phase: 54
slug: model-facing-second-brain-via-mcp
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
updated: 2026-03-27
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node --test`) |
| **Config file** | `package.json` test script plus targeted `node --test` invocations |
| **Quick run command** | `node --test tests/second-brain-mcp-tools.test.cjs tests/context-memory-pack.test.cjs` |
| **Full suite command** | `node --test tests/second-brain-mcp-tools.test.cjs tests/context-memory-pack.test.cjs tests/brain-mcp-degraded-mode.test.cjs tests/firecrawl-memory-boundary.test.cjs` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest targeted `node --test` command for the files changed in that task.
- **After every plan wave:** Run `node --test tests/second-brain-mcp-tools.test.cjs tests/context-memory-pack.test.cjs tests/brain-mcp-degraded-mode.test.cjs tests/firecrawl-memory-boundary.test.cjs`.
- **Before `$gsd-verify-work`:** The full Phase 54 suite must be green.
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | MEMORY-MCP-01 | unit | `node --test tests/second-brain-mcp-tools.test.cjs` | ✅ present | ✅ green |
| 54-01-02 | 01 | 1 | MEMORY-MCP-01 | integration | `node --test tests/brain-mcp-degraded-mode.test.cjs` | ✅ present | ✅ green |
| 54-01-03 | 01 | 2 | MEMORY-MCP-02 | integration | `node --test tests/context-memory-pack.test.cjs` | ❌ W0 | ⬜ pending |
| 54-01-04 | 01 | 2 | MEMORY-MCP-02 | regression | `node --test tests/firecrawl-memory-boundary.test.cjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/second-brain-mcp-tools.test.cjs` — planner/executor MCP tool contract coverage
- [x] `tests/brain-mcp-degraded-mode.test.cjs` — explicit Postgres-required blocking and degraded-mode behavior
- [ ] `tests/context-memory-pack.test.cjs` — bounded memory-pack integration into planning/execution context assembly
- [ ] `tests/firecrawl-memory-boundary.test.cjs` — verifies Firecrawl remains the sole external-context boundary
- [x] toolbox config fixture or checked-in sample under phase-owned docs/tests — validates expected tool names and role split

**Wave 0 Note:** These tests are expected to be created during Phase 54 execution. They are not prerequisites for planning; they are required deliverables for the implementation to be considered Nyquist-complete.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirm planner only receives readonly memory tools | MEMORY-MCP-01 | Tool exposure and role separation are easiest to validate from generated MCP/toolbox config plus sample invocation output | Inspect toolbox config and planner wiring; verify no write-capable tool names are available in planner-facing toolset |
| Confirm executor writeback is append-only and curated | MEMORY-MCP-01 | Requires judgment about whether the chosen write surface is too broad | Review configured write tools and SQL statements; confirm they only append checkpoint/summary/decision-style memory |
| Confirm external context still routes through Firecrawl instead of toolbox memory tools | MEMORY-MCP-02 | Requires architecture-level review across workflow prompts and context assembly | Inspect `context.cjs`, related workflow prompts, and toolbox config; confirm external URLs/docs are not retrieved through Second Brain MCP |

---

## Validation Sign-Off

- [ ] All tasks have automated verification or explicit Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Degraded-mode behavior is covered by an automated test
- [ ] Firecrawl-boundary preservation is covered by an automated test
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter after first green full-suite run

**Approval:** pending (requires first successful full Phase 54 suite run)
