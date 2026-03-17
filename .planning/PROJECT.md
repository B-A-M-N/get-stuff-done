# PROJECT: get-stuff-done (Intent Translation Layer Enhancement)

## Vision
Improve the human interaction layer of `get-stuff-done` by introducing a provider-agnostic "Intent Translation Layer" (ITL) that adapts user narrative into the structured inputs required by the existing GSD engines (Initialization, Discussion, Planning, Research, Execution, and Verification).

## Core Principles
- **Enhance, Don't Replace:** The ITL sits *between* the user and the existing GSD engines.
- **Preserve Agent Behavior:** The underlying planning/execution logic remains untouched; only the interface is altered.
- **Provider Agnostic (Milestone 3):** Prepare for Kimi, Gemini, and OpenAI.
- **100% Reliability:** Mandatory test coverage for all new and modified code.

## Core Constraint
> **The ITL must adapt user input into the existing engines’ expected structures. It must not rewrite or replace the planner, executor, governance logic, or research architecture except where minimal interface changes are strictly necessary.**

## Milestones

### Milestone 1: Intent Translation Layer inside GSD
Focus on the core brownfield enhancement using the existing system as the target.
- **Phase 1: Foundational Rebrand & Fixes** (Global rebrand to `get-stuff-done`, Claude hooks installation fix, and `dostuff` command entry point).
- **Phase 2: ITL Core Engine** (Intent extraction, ambiguity detection, interpretation summary, and audit trail).
- **Phase 3: Narrative-First Initialization** (Enhancing `/gsd:new-project` intake using ITL).
- **Phase 4: Narrative-First Phase Discussion** (Enhancing `/gsd:discuss-phase` using ITL).
- **Phase 5: Narrative-First Verification** (Enhancing `/gsd:verify-work` and UAT using ITL).
- **Phase 6: Research Context Integration** (Feeding ITL outputs into existing research/context workflows).
- **Phase 7: ITL-to-Planning Integration** (Ensuring ITL outputs cleanly and safely feed existing planner/executor systems).

### Milestone 2: Hardening and Verification
Focus on quality, robustness, and achieving the 100% coverage target.
- **Phase 8: Failure-Mode Testing** (Contradictory/vague input, emotionally worded complaints).
- **Phase 9: Regression Audit** (Verifying no weakened planning rigor or governance bypass).
- **Phase 10: Coverage and Test Hardening** (Mandatory coverage for all new and modified code).

### Milestone 3: Portability and Provider Abstraction
Extract the capability and add multi-provider support.
- **Phase 11: Canonical Schema and Adapter Layer** (Zod-backed canonical schema and adapter pattern).
- **Phase 12: Multi-Provider Support** (Integration with Kimi, Gemini, and OpenAI).
- **Phase 13: Reusable Plugin Extraction** (Standalone Node.js/TypeScript module).

## Success Criteria (Reliability)
- **No Regressions:** Existing command workflows must remain functional and produce identical planning artifacts.
- **Verified Coverage:** 100% line coverage for all new and modified code.
- **Output Validation:** Interpretation outputs must be validated against structured fixtures.
- **Forced Escalation:** Ambiguity detection must correctly identify and escalate unresolved critical conflicts.

---
*Last updated: 2026-03-16*
