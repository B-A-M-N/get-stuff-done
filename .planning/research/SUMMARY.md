# RESEARCH SUMMARY: Intent Translation Layer & Multi-Provider Support

## Executive Summary
This project aims to enhance `get-stuff-done` by introducing a provider-agnostic "Intent Translation Layer" (ITL) that allows for narrative-first interaction across multiple LLM providers (Claude, Kimi, Gemini, OpenAI). The project also includes a critical fix for the Claude hooks installation bug, a global renaming to `get-stuff-done`, and a commitment to 100% test coverage. Research highlights the importance of a canonical schema and adapter pattern to maintain provider flexibility while preserving the core behavior of GSD agents.

## Key Research Findings

### 1. Technology Stack (STACK.md)
- **Framework:** Node.js / TypeScript for the ITL and reusable plugin.
- **Provider Adapters:** Use an Adapter pattern with provider-specific SDKs (Anthropic, Google Generative AI, OpenAI).
- **Validation:** Zod for canonical intent schema validation.
- **Testing:** `node:test` and `c8` for achieving 100% coverage, with specialized adversarial test harnesses.
- **Persistence:** Local SQLite for the audit trail and inference tracking.

### 2. Implementation Features (FEATURES.md)
- **Narrative-First Prompts:** Start workflows with "Tell me what you're trying to build..." instead of rigid technical questions.
- **Intent Extraction:** Derive structured goals, constraints, and success criteria from narrative input across all providers.
- **Interpretation Summary:** Summarize extracted intent for user confirmation before proceeding.
- **Context Awareness:** Automatically fill defaults based on repository structure and project context.
- **Human-Friendly Verification:** Allow users to provide natural feedback (e.g., "this feels wrong") during UAT.

### 3. System Architecture (ARCHITECTURE.md)
- **ITL Core:** Central routing, canonical schema definition, and hook ingestion.
- **Provider Adapters:** Decouple GSD logic from provider-specific payload formats and behaviors.
- **Hook Integration:** Decoupled injection into Claude's `settings.json` and standardized event handlers.
- **Plugin Module:** Reusable, portable Node.js/TypeScript engine for broader AI agent integration.

### 4. Pitfalls & Risks (PITFALLS.md)
- **Provider Discrepancy:** Variations in intent extraction quality across different LLMs.
- **Installation Complexity:** Risk of breaking hook systems in non-Claude runtimes during repair.
- **Performance Overhead:** Additional latency introduced by the translation layer.
- **Hallucination Risks:** Mitigation through canonical schemas, Zod validation, and human-in-the-loop gates.
- **100% Coverage Challenge:** High complexity in fully covering all provider-specific edge cases.

## Recommendations
- **Adopt a "User-First" Interaction Layer:** Focus all enhancements on the translation between user and agent, leaving core agent logic intact.
- **Prioritize Canonical Schemas:** Use Zod early in the pipeline to ensure deterministic outputs across different LLMs.
- **Implement a "Shadow Proof" Fix for Claude Hooks:** Create a git worktree or isolated test environment to verify the hook system repair before merging.
- **Develop a Provider-Agnostic Plugin:** Ensure the reusable engine is decoupled from GSD-specific file paths and workflows.

---
*Last updated: 2026-03-16*
