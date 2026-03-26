---
created: 2026-03-26T22:24:59.151Z
title: Integrate model-facing Second Brain via GenAI toolkit MCP
area: tooling
files:
  - /home/bamn/get-stuff-done/.planning/ROADMAP.md
  - /home/bamn/get-stuff-done/.planning/STATE.md
  - /home/bamn/get-stuff-done/get-stuff-done/bin/lib/firecrawl-client.cjs
  - /home/bamn/firecrawl-local/apps/api/src/lib/context-runtime.ts
---

## Problem

The architecture intent says Second Brain should help the models, not just record audits. Current implementation is still mostly audit/logging plus limited context plumbing. Firecrawl now logs into GSD Second Brain, but the models are not yet using a database-backed Second Brain as a first-class memory/retrieval layer that improves planning and execution. We also now know there is a GenAI toolkit MCP available under `/home` that can connect to arbitrary databases, which is likely the right integration surface for making Second Brain model-facing instead of leaving it as passive infrastructure.

This should not be mixed into the current repair work. The repo still needs truth-surface cleanup and reconciliation of the remaining broken planning/ledger state before new memory architecture is layered in.

## Solution

After current reconciliation work is complete, define a focused follow-up phase for model-facing Second Brain integration.

Scope should include:
- decide the operational contract for how planner/researcher/executor models read from and write to Second Brain
- evaluate the GenAI toolkit MCP under `/home` as the DB access layer
- connect Firecrawl/GSD retrieval to ranked or recalled Second Brain artifacts instead of audit-only logging
- prove the integration changes model behavior and execution quality, not just observability

Keep this sequenced after the current repair backlog so we do not add another architectural layer on top of unresolved roadmap/state drift.
