---
phase: 46
slug: firecrawl-context-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (existing Node.js test suite) |
| **Config file** | `tests/firecrawl-crawl.test.cjs` (new) |
| **Quick run command** | `npm test -- tests/firecrawl-crawl.test.cjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test command
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | CRAWL-01 | unit | `npm test -- tests/firecrawl-client.crawl.test.js` | ❌ W0 | ⬜ pending |
| 46-01-02 | 01 | 1 | CRAWL-02 | integration | `npm test -- tests/source-adapters/file-adapter.test.js` | ❌ W0 | ⬜ pending |
| 46-01-03 | 01 | 1 | CRAWL-03 | unit | `npm test -- tests/source-adapters/http-adapter.test.js` | ❌ W0 | ⬜ pending |
| 46-02-01 | 02 | 2 | CRAWL-04 | unit | `npm test -- tests/policy-grant-crawl.test.js` | ❌ W0 | ⬜ pending |
| 46-02-02 | 02 | 2 | CRAWL-05 | performance | `npm test -- tests/performance/crawl-benchmark.test.js` | ❌ W0 | ⬜ pending |
| 46-03-01 | 03 | 3 | CRAWL-06 | integration | `npm test -- tests/fallback.test.js` | ❌ W0 | ⬜ pending |
| 46-03-02 | 03 | 3 | CRAWL-07 | unit | `npm test -- tests/artifact-schema-cross-adapter.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/firecrawl-client.crawl.test.js` — stubs for CRAWL-01 (spec validation, API dispatch)
- [ ] `tests/source-adapters/file-adapter.test.js` — integration with test planning server
- [ ] `tests/source-adapters/http-adapter.test.js` — mock scraper response
- [ ] `tests/policy-grant-crawl.test.js` — verify grant check for each source URI
- [ ] `tests/performance/crawl-benchmark.test.js` — measure latency with cache
- [ ] `tests/fallback.test.js` — behavior when Firecrawl unreachable
- [ ] `tests/artifact-schema-cross-adapter.test.js` — adapter outputs conform to schema

---

## Manual-Only Verifications

None — all phase requirements have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 complete)

**Approval:** pending

