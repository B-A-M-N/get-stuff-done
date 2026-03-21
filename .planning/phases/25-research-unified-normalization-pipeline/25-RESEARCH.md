# Phase 25: Research - Unified Normalization Pipeline

## Summary
The Unified Normalization Pipeline ensures that all project context, whether sourced from internal planning files or external documentation (via Firecrawl), is processed through a single validation and storage bottleneck. This guarantees "Internal Parity," where the agent's own planning files are treated with the same rigor and schema-contract as external sources.

**Primary recommendation:** Implement a plugin-based normalization architecture where `internal-normalizer.cjs` and `firecrawl-normalizer.cjs` act as adapters that produce standard `ContextArtifact` streams for the `context-store`.

## Standard Stack
- **Zod**: For strict runtime validation of normalized artifacts.
- **Glob**: For locating internal planning files.
- **Crypto (Node.js)**: For deterministic SHA-256 ID generation.

## Architecture Patterns

### The Normalization Flow
1. **Ingest**: Raw source (File path for internal, JSON for Firecrawl).
2. **Transform**: Adapter extracts `content_markdown` and `metadata`.
3. **Normalize**: `normalizeMd` (from `core.cjs`) cleans the markdown.
4. **Identify**: Generate ID from `source_uri` and `hash(content)`.
5. **Validate**: Run through `ContextArtifactSchema`.
6. **Store**: Persist to `.planning/context/artifacts/{id}.json`.

### Internal Parity Pattern
To ensure internal docs are not "special-cased," the `context build` command for workflows should read from the `artifacts/` store rather than directly from `.planning/` files. This forces the system to run the normalization pipeline on internal docs to make them available.

## Code Examples

### internal-normalizer.cjs logic
```javascript
// Mapping .planning/PROJECT.md to ContextArtifact
const artifact = {
  id: generateId(path, content),
  source_uri: `file://${path}`,
  type: 'internal',
  content_markdown: normalizeMd(content),
  content_hash: hash(content),
  normalized_at: new Date().toISOString(),
  provenance: {
    producer: 'internal-normalizer',
    producer_version: '1.0.0',
    parameters_hash: null
  }
};
```

## Testing Strategy
- **Contract Test**: A single test file `tests/normalization-parity.test.cjs` that feeds one internal MD file and one Firecrawl JSON result into their respective normalizers and asserts that both outputs are structurally identical and valid according to the Zod schema.
- **Idempotency Test**: Assert that normalizing the same file twice produces the exact same Artifact ID.
