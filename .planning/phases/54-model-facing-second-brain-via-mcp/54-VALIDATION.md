---
phase: 54
slug: model-facing-second-brain-via-mcp
status: complete
nyquist_compliant: true
wave_0_complete: true
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
| **Quick run command** | `node --test tests/context-memory-pack.test.cjs tests/firecrawl-memory-boundary.test.cjs tests/executor-memory-writeback.test.cjs` |
| **Full suite command** | `node --test tests/second-brain-mcp-tools.test.cjs tests/context-memory-pack.test.cjs tests/brain-mcp-degraded-mode.test.cjs tests/firecrawl-memory-boundary.test.cjs tests/executor-memory-writeback.test.cjs` |
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
| 54-01-03 | 01 | 2 | MEMORY-MCP-02 | integration | `node --test tests/context-memory-pack.test.cjs` | ✅ present | ✅ green |
| 54-01-04 | 01 | 2 | MEMORY-MCP-02 | regression | `node --test tests/firecrawl-memory-boundary.test.cjs` | ✅ present | ✅ green |
| 54-02-01 | 02 | 2 | MEMORY-MCP-02 | integration | `node --test tests/context-memory-pack.test.cjs tests/firecrawl-memory-boundary.test.cjs` | ✅ present | ✅ green |
| 54-02-02 | 02 | 2 | MEMORY-MCP-01 | integration | `node --test tests/executor-memory-writeback.test.cjs` | ✅ present | ✅ green |
| 54-02-03 | 02 | 2 | MEMORY-MCP-01,MEMORY-MCP-02 | integration | `node --check get-stuff-done/bin/lib/context.cjs && node --check get-stuff-done/bin/lib/second-brain.cjs && node --test tests/context-memory-pack.test.cjs tests/firecrawl-memory-boundary.test.cjs tests/executor-memory-writeback.test.cjs` | ✅ present | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/second-brain-mcp-tools.test.cjs` — planner/executor MCP tool contract coverage
- [x] `tests/brain-mcp-degraded-mode.test.cjs` — explicit Postgres-required blocking and degraded-mode behavior
- [x] `tests/context-memory-pack.test.cjs` — bounded memory-pack integration into planning/execution context assembly
- [x] `tests/firecrawl-memory-boundary.test.cjs` — verifies Firecrawl remains the sole external-context boundary
- [x] `tests/executor-memory-writeback.test.cjs` — checkpoint and summary lifecycle writeback uses sanctioned helpers
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

- [x] All tasks have automated verification or explicit Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Degraded-mode behavior is covered by an automated test
- [x] Firecrawl-boundary preservation is covered by an automated test
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter after first green full-suite run

**Approval:** focused Phase 54 suite green on 2026-03-27

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Notes:
- Retroactive validation reran the full focused Phase 54 suite successfully on 2026-03-27.
- Validation state is now aligned with the green UAT artifact in `54-UAT.md`.

<!-- GSD-AUTHORITY: 54-02-1:23e75c8cdbe829b820149c2943095e2be7560dab14327b4622b5bad525a31edc -->
