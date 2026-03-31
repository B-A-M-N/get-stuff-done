# Phase 52: Truth Enforcement Hardening - Research Summary

## 1. Critical Modules Inventory

Based on the codebase exploration, the following modules are central to truth enforcement:

- **Planning Server** (`/home/bamn/get-stuff-done/docs/ARCHITECTURE-V0.4.0.md`): Core orchestration for task planning and tracking
- **Executor** (referenced in `project_executor_commit_enforcement.md`): Handles task execution and contract enforcement
- **Contract System**: Spec-specification and enforcement layer (Firecrawl-only retrieval, provenance tracking)
- **SafeLogger** (pattern from `audit.cjs` and `profile-output.cjs`): Audit trail for all truth-sensitive operations
- **Configuration Schema**: Centralized validation for phase-51 improvements (see recent commit: "test: align config schema, docs, and tests")

## 2. SafeLogger Integration

The SafeLogger pattern from existing audit modules (`audit.cjs`, `profile-output.cjs`) provides:

- Immutable audit trails with cryptographic provenance
- Performance-optimized structured logging
- Trust class degradation handling
- Integration with execution traces

Integration approach:
- Extend SafeLogger to capture contract violations and truth failures
- Add YAML proof serialization to audit events
- Maintain ≤5% performance overhead

## 3. Proof Harness Architecture

Leverages Planning Server execution traces:

- **Trace Capture**: Every execution generates a signed trace containing:
  - Input hashes (contracts, configs, source files)
  - Decision points and branch outcomes
  - Output artifacts and their hashes
- **Proof Generation**: Convert traces to verifiable YAML proofs
- **Verification**: Independent validation that execution adhered to contract terms

Architecture uses existing planning infrastructure with added cryptographic signatures.

## 4. Truth Audit Format

Proposed YAML schema:

```yaml
version: "1.0"
execution:
  id: uuid
  timestamp: iso8601
  contract_hash: sha256
  executor_version: string
  inputs:
    - path: string
      hash: sha256
      provenance: source | generated | derived
  decisions:
    - rule_id: string
      condition: string
      outcome: pass | fail | degrade
      confidence: 0.0-1.0
  outputs:
    - path: string
      hash: sha256
      verified: boolean
  violations:
    - severity: critical | high | medium | low
      rule: string
      detail: string
  signature:
    algorithm: ed25519
    value: base64
```

## 5. Coverage Enforcement

Extend `nyc` (Istanbul) with custom reporter:

- Map contract rules to code branches
- Generate truth coverage report showing:
  - Which contract clauses were enforced
  - Which degradation paths were exercised
  - Which critical failures occurred
- Fail builds if coverage < 100% for critical contracts

Configuration in `package.json`:
```json
{
  "truth-coverage": {
    "threshold": 100,
    "ignore": ["degradation:*"],
    "contracts": ["**/contracts/*.yaml"]
  }
}
```

## 6. Secret Detection

Patterns based on common secret types:

- **API Keys**: `AKIA[0-9A-Z]{16}`, `ghp_[0-9a-zA-Z]{36}`
- **Bearer Tokens**: `Bearer\s+[A-Za-z0-9\-_]+`
- **Private Keys**: `-----BEGIN (RSA )?PRIVATE KEY-----`
- **Database URLs**: `postgresql://[^:]+:[^@]+@[^/]+/[^;]+`

Integration:
- Pre-commit and CI scanning using same parser as truth audit
- Fail on detection with remediation guidance
- Allowlist via contract exceptions

## 7. Adversarial Test Cases

**Case 1: Contract Tampering**
- Attacker modifies contract YAML to weaken guarantees
- Proof harness detects hash mismatch → execution rejected
- SafeLogger records violation with severity critical

**Case 2: Provenance Forgery**
- Attacker generates artifact with `provenance: source` but content modified
- Trace analysis shows derivation path inconsistency
- Degradation triggered, confidence score drops below threshold

**Case 3: Log Suppression**
- Attacker disables SafeLogger to hide violations
- Null audit events trigger heartbeat verification
- Missing heartbeat → automatic trust degradation

## 8. Performance

Estimated overhead: ≤5%

Breakdown:
- Trace capture: 1-2% (streaming writes, minimal sync)
- Proof generation: 1% (async post-processing)
- Signature verification: 1% (ed25519 fast path)
- Audit event dispatch: <1% (batched, non-blocking)

Contingency: If overhead exceeds 3%, enable sampling mode for non-critical paths.

## 9. Artifact Structure

Proposed directory layout:

```
.planning/
  phases/
    52-truth-enforcement-hardening/
      52-RESEARCH.md           # this file
      contracts/
        truth-contract.yaml     # core truth guarantees
        coverage-contract.yaml  # coverage requirements
        secret-policy.yaml      # secret detection rules
      proofs/
        examples/
          valid-execution-proof.yaml
          tampered-proof.yaml
      schemas/
        proof-schema.json       # JSON Schema for validation
      harness/
        generate-proof.js       # proof generator
        verify-proof.js         # proof verifier
      tests/
        adversarial/
          tampering.test.js
          forgery.test.js
          suppression.test.js
      docs/
        integration-guide.md
        performance-tuning.md
```

## 10. Validation Architecture

Gate conditions for proof acceptance:

- **Contract Hash Match**: Proof's `contract_hash` equals current contract digest
- **Signature Valid**: ed25519 signature verifies against executor's public key
- **Trace Integrity**: All input/output hashes match actual files
- **No Critical Violations**: `violations` array empty or contains only low/medium
- **Confidence ≥ Threshold**: Weighted sum of decision confidences meets minimum

If any gate fails:
1. Execution marked untrusted
2. SafeLogger records gate failure
3. Deploy pipeline blocks promotion
4. Alert triggered for human review

## 11. Phase 51 Claims

From documentation read (commits `b53dea2`, `98fc556`, `6fb01b8`, `47a3f21`):

- **Enforcement Guarantees**: Phase 51 restored and verified contract enforcement at executor-time
- **Execution Recording**: All decisions are now recorded with full provenance
- **Configuration Cleanup**: Schema alignment completed; config validation centralized
- **Metrics Plan**: Coverage and performance tracking infrastructure established
- **Remaining Gaps**: Identified in `project_executor_commit_enforcement.md` - primarily around timeout enforcement and external tool trust boundaries

Phase 52 builds on this foundation by hardening truth enforcement via cryptographic proofs and adversarial testing.

## RESEARCH COMPLETE
