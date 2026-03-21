# Project: Firecrawl Context Control Brownfield Audit

## Vision
Audit and harden an existing system in which Firecrawl is used as the deterministic context control layer for both internal and external context retrieval, normalization, and orchestration.

The audit must verify that:
- context access is deterministic
- retrieval paths are standardized
- no alternate or bypass paths exist
- agent behavior cannot circumvent context controls
- internal and external context are schema-aligned
- brownfield implementation matches claimed architecture
- verification is mechanical, not narrative

## Core Thesis
Firecrawl is not being used merely as a scraper. It is the context normalization and orchestration boundary through which all sanctioned context must flow.

## Audit Standard
The system is presumed unsafe until proven otherwise.

Any behavior that is:
- unenforced
- implicit
- non-reproducible
- bypassable
- inconsistent across runs

must be treated as a defect.

## Success Definition
The system is only considered audit-passing if:
1. all approved context flows are mapped
2. all context flows are reproducible
3. Firecrawl is a true control boundary
4. agent execution cannot silently bypass normalization
5. internal/external retrieval behavior is contract-consistent
6. failures degrade loudly and safely
7. all guarantees are encoded as invariants and verification checks
