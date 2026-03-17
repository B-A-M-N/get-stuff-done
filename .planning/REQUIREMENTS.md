# REQUIREMENTS: Intent Translation Layer & Multi-Provider Support

## 1. Core Principles
- **CP-01: Preserve Agent Behavior:** Enhancements must focus exclusively on the user interaction layer. Core GSD agent logic, planning rigor, and governance mechanisms must remain unchanged.
- **CP-02: Provider Agnostic:** The system must function identically across Claude, Kimi, Gemini, OpenAI, and other supported LLMs.
- **CP-03: 100% Reliability:** Mandatory 100% test coverage for all new and modified code.

## 2. Functional Requirements

### 2.1 Narrative-First Intake
- **FR-01:** Replace rigid question-driven initialization with narrative-first prompts ("Tell me what you're trying to build...").
- **FR-02:** Support freeform user explanations of goals, frustrations, and desired outcomes.
- **FR-03:** Extract structured intent automatically from narrative input.

### 2.2 Intent Translation Layer (ITL)
- **FR-04: Extraction Categories:** Goals, constraints, preferences, anti-requirements, success criteria, risks, and unknowns.
- **FR-05: Interpretation Summary:** Generate a structured summary for user confirmation (e.g., "Here is what I think you mean...").
- **FR-06: Audit Trail:** Record explicit user statements, inferred meaning, and context-derived assumptions.
- **FR-07: Ambiguity Detection:** Identify conflicts or vague requirements and escalate to human review only when necessary.

### 2.3 Multi-Provider Support
- **FR-08:** Ensure full compatibility with Kimi, Gemini, and OpenAI in addition to Claude.
- **FR-09:** Implement provider-agnostic adapters for payload mapping and response parsing.
- **FR-10:** Support provider-specific optimized prompt templates within a unified registry.

### 2.4 Hook System Fix (bin/install.js)
- **FR-11:** Resolve the issue where GSD installation with Claude corrupts or breaks the hooks system.
- **FR-12:** Decouple hook injection from provider-specific logic to prevent regressions in other runtimes.

### 2.5 Reusable Plugin Engine
- **FR-13:** Extract the ITL as a portable Node.js / TypeScript module.
- **FR-14:** Expose a clean, conceptual API: `interpret_narrative(input_text, context_data)`.
- **FR-15:** Output a standardized schema (goals, constraints, ambiguities, assumptions, confidence_levels).

### 2.6 Global Renaming
- **GR-01:** Complete global renaming from `get-stuff-done` to `get-stuff-done`.

## 3. Technical Requirements

### 3.1 Architecture
- **TR-01:** Use a **Canonical Schema Pattern** (with Zod validation) to decouple GSD from provider-specific formats.
- **TR-02:** Implement a **Modular Adapter Pattern** for cross-provider compatibility.
- **TR-03:** Use **SQLite** for local persistence of the audit trail and inference tracking.

### 3.2 Verification & Audit
- **TR-04:** Implement a post-implementation self-audit system to detect regressions or weakened planning rigor.
- **TR-05:** Failure mode testing: Vague input, contradictory requirements, missing context, and emotionally worded complaints.
- **TR-06:** Ensure all inferred decisions are documented in the project state.

### 3.3 Testing & Coverage
- **TR-07:** Mandatory **100% line coverage** for all new/modified code using `node:test` and `c8`.
- **TR-08:** Implement specialized **Adversarial Test Harnesses** for the ITL and its adapters.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CP-01 | Phase 9 | Pending |
| CP-02 | Phase 11 | Pending |
| CP-03 | Phase 10 | Pending |
| FR-01 | Phase 3 | Pending |
| FR-02 | Phase 2 | Pending |
| FR-03 | Phase 2 | Pending |
| FR-04 | Phase 2 | Pending |
| FR-05 | Phase 2 | Pending |
| FR-06 | Phase 2 | Pending |
| FR-07 | Phase 2 | Pending |
| FR-08 | Phase 12 | Pending |
| FR-09 | Phase 11 | Pending |
| FR-10 | Phase 12 | Pending |
| FR-11 | Phase 1 | Pending |
| FR-12 | Phase 1 | Pending |
| FR-13 | Phase 13 | Pending |
| FR-14 | Phase 13 | Pending |
| FR-15 | Phase 13 | Pending |
| GR-01 | Phase 1 | Pending |
| TR-01 | Phase 11 | Pending |
| TR-02 | Phase 11 | Pending |
| TR-03 | Phase 2 | Pending |
| TR-04 | Phase 9 | Pending |
| TR-05 | Phase 8 | Pending |
| TR-06 | Phase 2, Phase 8 | Pending |
| TR-07 | Phase 10 | Pending |
| TR-08 | Phase 8 | Pending |

---
*Last updated: 2026-03-16*
