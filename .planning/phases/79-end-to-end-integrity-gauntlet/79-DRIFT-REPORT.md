# Phase 79 Drift Report

## fake-verification-forged-verdict

- Outcome: INVALID
- Notes: verification artifact validation rejected forged truth

## fake-verification-missing-truth-table

- Outcome: INVALID
- Notes: verification artifact validation rejected forged truth

## missing-commit-proof-chain

- Outcome: INVALID
- Notes: summary verification rejected missing commit proof

## missing-proof-index-commit

- Outcome: INVALID
- Notes: summary verification rejected missing commit proof

## partial-execution-summary-claim

- Outcome: INVALID
- Notes: summary claimed more tasks than its commit proof supports

## partial-execution-task-gap

- Outcome: INVALID
- Notes: complete-task enforced sequential proof chain

## undeclared-memory-degradation

- Outcome: INVALID
- Notes: underlying truth is stale but no degraded-state artifact surfaced the condition

## firecrawl-context-governance-bypass

- Outcome: INVALID
- Notes: retrieval posture and context-build behavior are evaluated together

## memory-truth-contradiction

- Outcome: RECONCILIATION_REQUIRED
- Notes: contradiction is present in authoritative drift reporting

## retrieval-truth-posture-downgrade

- Outcome: INVALID
- Notes: retrieval posture claims healthy truth without authoritative backing

## drift-reconciliation-trigger

- Outcome: RECONCILIATION_REQUIRED
- Notes: contradiction is present in authoritative drift reporting

## mixed-fake-proof-and-drift

- Outcome: INVALID
- Notes: forged verification compounded with drift contradiction

## mixed-missing-commit-and-undeclared-degradation

- Outcome: INVALID
- Notes: missing commit proof compounded with undeclared degradation

## mixed-partial-execution-and-fake-verification

- Outcome: INVALID
- Notes: partial execution compounded with forged verification

## mixed-declared-firecrawl-and-undeclared-memory

- Outcome: INVALID
- Notes: retrieval degradation is explicit while memory degradation remains undeclared

## mixed-retrieval-downgrade-and-memory-contradiction

- Outcome: INVALID
- Notes: retrieval downgrade compounded with memory contradiction

<!-- GSD-AUTHORITY: 79-01-2:d36ae9bb23a807431865a44872b6bad8eccdf1be62634cc7571295f3fa505239 -->
