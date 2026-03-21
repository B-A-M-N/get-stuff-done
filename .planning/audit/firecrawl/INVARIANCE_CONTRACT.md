# Invariance Contract — Context Control Layer

## I1
All sanctioned external context retrieval must traverse Firecrawl.

## I2
All agent-visible context must resolve to a canonical normalized artifact.

## I3
No silent fallback from Firecrawl to raw retrieval is permitted.

## I4
Internal and external context artifacts must conform to the same top-level normalization contract.

## I5
Every execution phase must record the exact context artifacts used.

## I6
CLI primitives are mandatory and order-enforced.

## I7
If required context cannot be normalized, the system must fail loudly or enter explicit degraded mode.

## I8
Semantic search results are references to canonical truth, never truth themselves.

## I9
Repeated identical retrieval tasks must be measurably stable within declared tolerance.

## I10
Any new retrieval path introduced in code must be detected by audit tooling and classified before release.
