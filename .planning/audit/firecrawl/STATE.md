# State

## Current Goal
Audit the brownfield implementation that uses Firecrawl as the unified context control layer.

## Audit Posture
Hostile verification. Assume claims are false until mechanically proven.

## Non-Negotiable Standards
- No silent fallbacks
- No unenforced boundaries
- No unverifiable claims
- No alternate hidden context paths
- No schema ambiguity between internal and external context

## Decision Rules
- If a path can bypass normalization, it is a defect
- If a boundary depends on model obedience, it is not a boundary
- If repeated runs diverge materially, determinism is not achieved
- If failure is quiet, production safety is not achieved
