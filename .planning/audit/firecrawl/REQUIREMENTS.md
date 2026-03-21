# Requirements — Firecrawl Context Control Audit

## v1 Audit Requirements

### R1. System Reconstruction
- Reconstruct actual brownfield architecture from code and runtime behavior
- Produce context flow map, control points, storage points, and retrieval points

### R2. Context Path Enumeration
- Enumerate every source of internal and external context
- Enumerate every path by which agents can obtain context
- Classify each path as sanctioned, unsanctioned, or ambiguous

### R3. Firecrawl Boundary Verification
- Verify all sanctioned external context retrieval goes through Firecrawl
- Verify Firecrawl endpoint usage is deterministic and parameter-constrained
- Verify system does not silently fallback to raw fetch or alternate tools

### R4. Internal Context Normalization
- Verify internal docs, memory, and knowledge artifacts are normalized into a compatible schema
- Verify internal context is not treated as a privileged inconsistent special case

### R5. Determinism Audit
- Verify repeated identical queries/tasks yield materially consistent normalized context
- Detect retrieval drift, extraction drift, ranking drift, serialization drift

### R6. Agent Bypass Resistance
- Verify agents cannot bypass Firecrawl or internal normalization through:
  - direct HTTP tools
  - local raw file short-circuiting
  - cached hidden artifacts
  - hallucinated assumptions
  - undocumented utility paths

### R7. Enforcement Primitive Integrity
- Verify CLI primitives are mandatory, ordered, and non-forgeable:
  - complete-task
  - verify-integrity
  - context-build
- Verify non-zero exit behavior on violation

### R8. Phase Discipline Audit
- Verify workflow obeys strict pause/confirm/redirect semantics between stages
- Verify no autonomous leapfrogging into future phases

### R9. Adversarial Failure Testing
- Test contradictory, stale, malformed, partial, and overloaded context conditions
- Verify safe failure and explicit degraded mode

### R10. Storage Integrity
- Verify Redis/Postgres/Chroma roles are clearly separated and contract-aligned
- Verify retrieval lineage, embedding lineage, and relational provenance

### R11. Metrics and Evidence
- Score determinism, enforcement integrity, consistency, drift resistance, failure safety
- Every finding must map to evidence

### R12. Remediation Output
- Every defect must include:
  - root cause
  - severity
  - exact fix
  - enforcement mechanism
  - re-verification method

## Out of Scope
- Cosmetic refactors
- generic architecture advice not tied to brownfield findings
- unverifiable “best practices” without specific evidence
