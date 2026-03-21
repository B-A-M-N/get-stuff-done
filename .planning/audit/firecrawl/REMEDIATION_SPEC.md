# Remediation Spec: Bounded Context Control

This document defines the mechanical implementation for transitioning from a "guided context preference" to a "controlled context system."

## 1. Hard Context Sandbox (Mechanical)

Agents MUST be restricted from accessing arbitrary files or raw external web tools.

### Forbidden Operations
- `Bash` calls using `cat`, `grep`, `awk`, `find`, etc., against `.planning/` or root project artifacts.
- `Read` calls on raw project files.
- `WebFetch`, `WebSearch`, or `curl` calls.

### Sanctioned Primitives (Exclusive)
- `gsd-tools context build`: Normalizes sources into artifacts.
- `gsd-tools context read`: Renders artifact bundles for the agent.
- `gsd-tools firecrawl`: The exclusive producer for external artifacts.

## 2. Canonical Context Artifact (Identity)

Every piece of context MUST be normalized into a `ContextArtifact` object. Firecrawl and internal parsers are producers of this artifact, not truth sources themselves.

### Zod Schema (Unified)
```typescript
const ContextArtifactSchema = z.object({
  id: z.string(), // Deterministic hash of canonical fields
  source_uri: z.string(),
  type: z.enum(['external', 'internal']),
  content_markdown: z.string(),
  content_hash: z.string(), // Hash of the normalized markdown
  normalized_at: z.string(),
  provenance: z.object({
    producer: z.enum(['firecrawl', 'internal-normalizer']),
    producer_version: z.string(),
    parameters_hash: z.string().nullable()
  })
});
```

## 3. Policy Modes (Bounded Autonomy)

To preserve throughput without risking drift, the system implements authority envelopes rather than per-action confirmation.

| Mode | Autonomy Level | Context Enforcement |
| :--- | :--- | :--- |
| **Strict** | Human-gated transitions | All external via Firecrawl; No raw reads. |
| **Bounded Auto** | Auto-advance within wave | Pre-authorized context IDs; No raw reads. |
| **Open/Debug** | Unrestricted | Relaxed (Development only). |

### Authority Envelope Rule
Move the decision earlier: Authorize a **Context Envelope** (set of artifact IDs) once per phase. The agent proceeds automatically within that envelope. Escalate only when the agent requests authority for a new source class or expands scope.

## 4. Implementation Invariants

1. **Kill Raw Access:** Block `cat .planning/` at the tool runtime layer.
2. **Canonical Identity:** No context reaches an agent without a `ContextArtifact.id`.
3. **Internal Parity:** Internal docs (PROJECT.md, etc.) MUST pass through the same normalization pipeline as external content.
4. **Bypass Detection:** `verify-integrity` must scan logs for forbidden command patterns.
