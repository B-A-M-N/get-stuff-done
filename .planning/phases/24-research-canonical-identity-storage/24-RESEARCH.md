# Phase 24: Research - Canonical Identity & Storage

**Researched:** 2026-03-24
**Domain:** Context Management & Provenance
**Confidence:** HIGH

## Summary

This phase focuses on the implementation of a "Canonical Identity & Storage" system for project context. The goal is to move from a "guided context preference" where agents can read arbitrary files to a "controlled context system" where all context pieces are normalized into a standard `ContextArtifact` format, assigned a deterministic ID based on their content and source, and stored in a managed file-backed store.

**Primary recommendation:** Use a SHA-256 hash of the `source_uri` and `content_hash` as the deterministic artifact ID, store these as flat JSON files in `.planning/context/artifacts/`, and update the `context build` command to handle both workflow snapshots and artifact normalization.

<user_constraints>
## User Constraints (from CONTEXT.md)

*(No CONTEXT.md was found in the upstream input, but requirements are derived from REMEDIATION_SPEC.md)*

### Locked Decisions
- All context MUST be normalized into a `ContextArtifact` object.
- Firecrawl and internal parsers are producers, not truth sources themselves.
- Artifact IDs must be deterministic hashes of canonical fields.
- Storage must be file-backed and minimal.
- Authority envelopes (sets of artifact IDs) will gate agent access.

### Claude's Discretion
- Exact storage directory structure (e.g., `.planning/context/artifacts/`).
- Specific implementation of the deterministic ID generator.
- Integration strategy with existing `context build` command.

### Deferred Ideas (OUT OF SCOPE)
- Transitioning agents to *Strict* mode (this phase only builds the infrastructure).
- Implementing the "Bypass Detection" scanner.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-CANONICAL | Define `ContextArtifactSchema` | Schema defined in `artifact-schema.cjs` section. |
| ID-DETERMINISTIC | Implement deterministic ID generator | Logic using `crypto.createHash('sha256')` documented. |
| STORE-FILE-BACKED | Implement `context-store.cjs` | Store logic with `put`, `get`, `list`, `findBySource` defined. |
| CLI-INTEGRATION | Update `context build` and `context read` | Integration plan for `gsd-tools.cjs` provided. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | ^3.x | Schema validation | Existing project standard for all artifacts. |
| `crypto` | Node.js built-in | Hashing for ID generation | Robust, standard SHA-256 implementation. |
| `fs` | Node.js built-in | File-backed storage | Project uses flat files for all planning data. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `path` | Node.js built-in | Path manipulation | To ensure cross-platform file access. |
| `os` | Node.js built-in | Temp file handling | For handling large output payloads (already in `core.cjs`). |

## Architecture Patterns

### Recommended Project Structure
```
.planning/
└── context/
    └── artifacts/
        ├── {sha256}.json    # Normalized ContextArtifact
        └── {sha256}.json    # Normalized ContextArtifact
```

### Pattern 1: Deterministic Identity
**What:** The artifact ID is derived solely from its source URI and its content hash.
**When to use:** Whenever a new context piece is normalized.
**Logic:**
```javascript
const canonical = `${source_uri}|${content_hash}`;
const id = crypto.createHash('sha256').update(canonical).digest('hex');
```

### Pattern 2: Flat File-Backed Store
**What:** A simple store that saves JSON artifacts named by their ID.
**When to use:** Managing the lifecycle of context artifacts.
**Functions:**
- `put(artifact)`: Validates and saves.
- `get(id)`: Reads and validates.
- `list()`: Returns all known IDs.
- `findBySource(uri)`: Filters by source URI for deduplication/lookup.

### Anti-Patterns to Avoid
- **Raw File Access:** Allowing agents to read `.planning/` files directly once infrastructure is ready.
- **Manual ID Creation:** Never generate random IDs for artifacts; they must be deterministic.
- **Inconsistent Normalization:** Different producers using different markdown formats (use `normalizeMd` from `core.cjs`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validation | Custom type checks | `zod` | Handles nested objects and enum constraints robustly. |
| Hashing | Custom hash functions | `crypto.createHash('sha256')` | Proven security and collision resistance. |
| Path Management | String concatenation | `path.join` | Ensures cross-platform compatibility. |
| Normalization | Custom regex filters | `normalizeMd` (bin/lib/core.cjs) | Already implements standard GSD markdown rules. |

## Common Pitfalls

### Pitfall 1: Breaking Change in Identity
**What goes wrong:** Changing the ID generation logic (e.g., adding a field to the hash) makes all existing artifacts "missing" or unreachable by their old IDs.
**How to avoid:** Lock the canonical fields (Source URI and Content Hash) early and never change them. If a breaking change is needed, bump a version field and re-hash.

### Pitfall 2: Store Growth
**What goes wrong:** The `artifacts/` directory grows too large for efficient `fs.readdirSync`.
**How to avoid:** For most projects, this won't be an issue. For massive ones, implement a sharded directory structure (e.g., `artifacts/ab/{id}.json`).

### Pitfall 3: Stale Context
**What goes wrong:** Multiple versions of the same source URI exist in the store, and the agent reads an old one.
**How to avoid:** `list()` and `get()` are neutral; the authority envelope (provided to the agent) must specify which ID(s) are current.

## Code Examples

### 1. `artifact-schema.cjs` update
```javascript
const contextArtifactSchema = z.object({
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

function parseContextArtifact(input) {
  return contextArtifactSchema.parse(input);
}
```

### 2. `context-store.cjs` Implementation
```javascript
const fs = require('fs');
const path = require('path');
const { parseContextArtifact } = require('./artifact-schema.cjs');

function getStoreDir(cwd) {
  return path.join(cwd, '.planning', 'context', 'artifacts');
}

function put(cwd, artifact) {
  const validated = parseContextArtifact(artifact);
  const dir = getStoreDir(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${validated.id}.json`);
  fs.writeFileSync(file, JSON.stringify(validated, null, 2), 'utf-8');
  return validated.id;
}

function get(cwd, id) {
  const file = path.join(getStoreDir(cwd), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return parseContextArtifact(data);
}
```

### 3. `context read` Bundling logic
```javascript
function cmdContextRead(cwd, ids) {
  const artifacts = ids.map(id => get(cwd, id)).filter(Boolean);
  const bundle = artifacts.map(a => {
    return `---
id: ${a.id}
source: ${a.source_uri}
normalized_at: ${a.normalized_at}
---

${a.content_markdown}
`;
  }).join('\n\n---\n\n');
  process.stdout.write(bundle);
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` |
| Config file | `package.json` |
| Quick run command | `node --test tests/artifact-schema.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-CANONICAL | Validates ContextArtifact | unit | `node --test tests/artifact-schema.test.cjs` | ✅ |
| ID-DETERMINISTIC | Generates unique, content-based ID | unit | `node --test tests/context-store.test.cjs` | ❌ Wave 0 |
| STORE-FILE-BACKED | Put/Get/List artifacts correctly | unit | `node --test tests/context-store.test.cjs` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `tests/context-store.test.cjs` — covers store logic and ID generation.
- [ ] Update `tests/artifact-schema.test.cjs` — include `contextArtifactSchema` tests.

## Sources

### Primary (HIGH confidence)
- `.planning/audit/firecrawl/REMEDIATION_SPEC.md` — Source of truth for schema and requirements.
- `get-stuff-done/bin/lib/artifact-schema.cjs` — Current schema implementation patterns.
- `get-stuff-done/bin/lib/context.cjs` — Current context command implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Built on existing Node.js and Zod patterns.
- Architecture: HIGH - Follows the clear blueprints in the remediation spec.
- Pitfalls: MEDIUM - Based on common distributed storage experiences.

**Research date:** 2026-03-24
**Valid until:** 2026-04-24
