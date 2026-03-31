# Integration Test Debt (Deferred)

## Failing Suites (4)
These suites fail as of distributed truth fix completion. They are not indicative of core instability.

1. **Copilot agent conversion - real files**
   - Likely requires: Copilot SDK / runtime environment
   - Possibly mocks expecting specific directory layout

2. **copyCommandsAsCopilotSkills**
   - Assumption: skill folder count stable (41 vs 42)
   - May need fixture isolation or skill discovery update

3. **E2E: Copilot full install verification**
   - End-to-end install test; needs Copilot runtime present

4. **Second Brain E2E Integration**
   - Requires: external service (Firecrawl/Plane) reachable
   - Environment-sensitive

## Boundary Statement
Core health/governance/distributed-truth surfaces are stable. Integration/E2E suites deferred to separate pass.

## Recommended Follow-up
`integration-e2e-stabilization` pass focused on test environment normalization and fixture consistency.
