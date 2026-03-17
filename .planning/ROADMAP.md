# Roadmap: Intent Translation Layer

## Overview
This roadmap details the implementation of the Intent Translation Layer (ITL) and Multi-Provider support for `get-stuff-done`. The project is structured into three milestones: core ITL development inside GSD, quality hardening, and finally, provider abstraction and extraction into a reusable plugin.

## Phases

- [ ] **Phase 1: Foundational Rebrand & Fixes** - Global rebrand to `get-stuff-done` and fix Claude hook installation bugs.
- [ ] **Phase 2: ITL Core Engine** - Build the extraction, ambiguity detection, and audit trail logic.
- [ ] **Phase 3: Narrative-First Initialization** - Enhance `/gsd:new-project` with ITL narrative intake.
- [ ] **Phase 4: Narrative-First Phase Discussion** - Enhance `/gsd:discuss-phase` with ITL support.
- [ ] **Phase 5: Narrative-First Verification** - Enhance `/gsd:verify-work` and UAT with ITL.
- [ ] **Phase 6: Research Context Integration** - Feed ITL outputs into research and context workflows.
- [ ] **Phase 7: ITL-to-Planning Integration** - Ensure ITL outputs feed cleanly into existing planner systems.
- [ ] **Phase 8: Failure-Mode Testing** - Stress test ITL with vague, contradictory, and emotional inputs.
- [ ] **Phase 9: Regression Audit** - Verify no weakened planning rigor or governance bypass.
- [ ] **Phase 10: Coverage and Test Hardening** - Achieve 100% line coverage for all new/modified code.
- [ ] **Phase 11: Canonical Schema and Adapter Layer** - Implement Zod-backed canonical schema and adapter patterns.
- [ ] **Phase 12: Multi-Provider Support** - Integrate Kimi, Gemini, and OpenAI.
- [ ] **Phase 13: Reusable Plugin Extraction** - Extract ITL as a standalone Node.js/TypeScript module.

## Phase Details

### Phase 1: Foundational Rebrand & Fixes
**Goal**: Establish the new brand identity and fix critical installation bugs.
**Depends on**: Nothing
**Requirements**: GR-01, FR-11, FR-12
**Success Criteria**:
  1. All occurrences of `get-stuff-done` in codebase and docs are replaced with `get-stuff-done`.
  2. Claude hooks installation no longer corrupts `bin/install.js`.
  3. GSD installs correctly on a fresh environment using the new name.
**Plans**: TBD

### Phase 2: ITL Core Engine
**Goal**: Build the primary engine for intent extraction and ambiguity detection.
**Depends on**: Phase 1
**Requirements**: FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, TR-03, TR-06
**Success Criteria**:
  1. User can provide a multi-paragraph narrative and receive a structured interpretation summary.
  2. Engine correctly identifies goals, constraints, and success criteria from narrative.
  3. Ambiguity detection triggers for contradictory or vague inputs.
  4. All interpretations and raw inputs are recorded in a local SQLite audit trail.
**Plans**: TBD

### Phase 3: Narrative-First Initialization
**Goal**: Enhance project initialization with narrative-first intake.
**Depends on**: Phase 2
**Requirements**: FR-01
**Success Criteria**:
  1. `/gsd:new-project` accepts a narrative block instead of a rigid questionnaire.
  2. Generated `PROJECT.md` and `REQUIREMENTS.md` reflect the extracted intent.
  3. User can confirm or refine the ITL interpretation before files are written.
**Plans**: TBD

### Phase 4: Narrative-First Phase Discussion
**Goal**: Apply ITL to the phase discussion workflow.
**Depends on**: Phase 3
**Requirements**: FR-02, FR-03
**Success Criteria**:
  1. `/gsd:discuss-phase` accepts narrative input for phase refinement.
  2. ITL identifies specific changes to phase goals from the discussion.
**Plans**: TBD

### Phase 5: Narrative-First Verification
**Goal**: Apply ITL to work verification and UAT.
**Depends on**: Phase 4
**Requirements**: FR-02, FR-03
**Success Criteria**:
  1. `/gsd:verify-work` uses ITL to compare results against extracted success criteria.
  2. Verification report includes natural language explanations of compliance.
**Plans**: TBD

### Phase 6: Research Context Integration
**Goal**: Integrate ITL outputs into research workflows.
**Depends on**: Phase 5
**Requirements**: FR-02, FR-03
**Success Criteria**:
  1. ITL outputs are successfully used as input for research phases.
  2. Research context is enriched by intent-derived assumptions.
**Plans**: TBD

### Phase 7: ITL-to-Planning Integration
**Goal**: Ensure seamless data flow from ITL to existing planning logic.
**Depends on**: Phase 6
**Requirements**: FR-02, FR-03
**Success Criteria**:
  1. ITL outputs feed into the planner without breaking existing structures.
  2. Planning rigor is maintained while using ITL-derived requirements.
**Plans**: TBD

### Phase 8: Failure-Mode Testing
**Goal**: Verify ITL robustness against difficult inputs.
**Depends on**: Phase 7
**Requirements**: TR-05, TR-06, TR-08
**Success Criteria**:
  1. System correctly flags contradictory requirements as "Ambiguous".
  2. System handles emotionally worded or vague complaints by requesting specific clarification.
  3. Adversarial test suite for ITL passes with 100% success rate on known edge cases.
**Plans**: TBD

### Phase 9: Regression Audit
**Goal**: Ensure no loss of planning quality or governance bypass.
**Depends on**: Phase 8
**Requirements**: CP-01, TR-04
**Success Criteria**:
  1. Post-implementation audit confirms core agent logic remains untouched.
  2. Existing command workflows remain functional and produce identical planning artifacts for standard inputs.
**Plans**: TBD

### Phase 10: Coverage and Test Hardening
**Goal**: Reach the mandatory 100% coverage target.
**Depends on**: Phase 9
**Requirements**: CP-03, TR-07
**Success Criteria**:
  1. 100% line coverage for all new and modified code in the ITL and adapters.
  2. Test suite executes in CI/CD without failures.
**Plans**: TBD

### Phase 11: Canonical Schema and Adapter Layer
**Goal**: Abstract provider-specific logic using a canonical schema.
**Depends on**: Phase 10
**Requirements**: CP-02, FR-09, TR-01, TR-02
**Success Criteria**:
  1. Zod-backed canonical schema handles all ITL data structures.
  2. Adapter pattern allows for switching providers without changing core ITL logic.
**Plans**: TBD

### Phase 12: Multi-Provider Support
**Goal**: Integrate Kimi, Gemini, and OpenAI.
**Depends on**: Phase 11
**Requirements**: FR-08, FR-10
**Success Criteria**:
  1. ITL functions identically across Claude, Kimi, Gemini, and OpenAI.
  2. Provider-specific prompt templates are managed in a unified registry.
**Plans**: TBD

### Phase 13: Reusable Plugin Extraction
**Goal**: Extract ITL as a standalone module.
**Depends on**: Phase 12
**Requirements**: FR-13, FR-14, FR-15
**Success Criteria**:
  1. ITL code is successfully moved to a separate directory/package.
  2. Standalone ITL can be installed and used in a separate project via clean API.
  3. Standardized schema output is verified.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundational Rebrand & Fixes | 0/0 | Not started | - |
| 2. ITL Core Engine | 0/0 | Not started | - |
| 3. Narrative-First Initialization | 0/0 | Not started | - |
| 4. Narrative-First Phase Discussion | 0/0 | Not started | - |
| 5. Narrative-First Verification | 0/0 | Not started | - |
| 6. Research Context Integration | 0/0 | Not started | - |
| 7. ITL-to-Planning Integration | 0/0 | Not started | - |
| 8. Failure-Mode Testing | 0/0 | Not started | - |
| 9. Regression Audit | 0/0 | Not started | - |
| 10. Coverage and Test Hardening | 0/0 | Not started | - |
| 11. Canonical Schema and Adapter Layer | 0/0 | Not started | - |
| 12. Multi-Provider Support | 0/0 | Not started | - |
| 13. Reusable Plugin Extraction | 0/0 | Not started | - |
