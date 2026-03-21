# Hostile Brownfield Audit: Firecrawl Context Control (FINAL - REVISED)

**Audited:** 2026-03-21
**Verdict:** FAIL / NOT PRODUCTION READY
**Root Cause:** A guided context preference system, not a controlled context system.

## Executive Summary
The implementation fails to act as a deterministic control layer because the boundary between "allowed context" and "everything else" is conceptual, not mechanical. Agents can trivially bypass the sanctioned Firecrawl/Context-Build pipeline using raw filesystem commands. Without a hard sandbox and canonical context identity, Firecrawl is merely an optional suggestion.

## Core Proven Failures

### 1. No Canonical Context Identity
Firecrawl outputs exist as ephemeral Markdown, but nothing enforces their persistence, structure, or identity. Context is a temporary suggestion rather than a controlled, immutable artifact.

### 2. Porous Boundary
Agents retain direct access to `.planning/` files via `cat`, `grep`, and `Read`. This invalidates the entire control thesis: if an agent can access context outside the pipeline, the pipeline is not the source of truth.

### 3. Instructional vs. Mechanical Enforcement
The system relies on "Policy" (instructions to use Firecrawl) rather than "Mechanism" (runtime gates). Models do not consistently obey policy under pressure, and success can be forged in prose.

### 4. Fragmented Context Plane
There is no unified plane. Firecrawl (Markdown), internal files (raw Markdown-ish), plans (XML), and memory (JSONL) are separate systems that "look similar" but share no shared schema or normalization contract.

## Scored Findings

| Phase | Category | Score | Result |
|-------|----------|-------|--------|
| 1-2 | Boundary Integrity | 2/10 | Porous. Agents bypass structure with raw reads. |
| 3 | Firecrawl Control | 3/10 | Ephemeral output. No canonical hashing or drift detection. |
| 4 | Context Parity | 1/10 | Disproven. Internal vs External paths are bifurcated. |
| 5 | Enforcement | 2/10 | Instructional only. Primitives are forgeable. |
| 8 | Infrastructure | 0/10 | **Storage Plane (Redis/Chroma) is wishcasting; zero code found.** |

## Failure Matrix

| ID | Component | Claim | Observed Reality | Root Cause |
|----|-----------|-------|------------------|------------|
| F-01 | Sandbox | Non-bypassable | Agents `cat .planning/` | No mechanical filesystem gate |
| F-02 | Identity | Canonical Artifacts | Ephemeral MD strings | Missing `ContextArtifact` schema |
| F-03 | Provenance| Traceable Lineage | Instructional logs | No DB-enforced provenance |
| F-04 | Parity | Unified schema (I4) | Special-case internal | Internal docs bypass normalization |

## Remediation Strategy (Revised Priority)
1. **Hard Context Sandbox:** Mechanically block raw file/web access; allow only sanctioned primitives.
2. **Canonical Context Artifact:** Define a hash-indexed Zod schema for ALL context (internal and external).
3. **Mechanical Enforcement:** Move from "please behave" instructions to runtime gates.
4. **Bounded Autonomy:** Authorize context envelopes by phase to preserve speed without risking drift.

---
**Verdict:** This system is not production-safe. It lacks the mechanical boundaries and canonical identity required for a controlled context architecture.
