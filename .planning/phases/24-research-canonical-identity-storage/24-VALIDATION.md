# Phase 24 Validation: Research - Canonical Identity & Storage

## Overview
Phase 24 introduces a normalized, content-addressed context storage system. This ensures project context pieces have deterministic identities and are stored in a consistent file-backed format.

## Requirement Coverage
| ID | Requirement | Validation Method |
|----|-------------|-------------------|
| SCHEMA-CANONICAL | Define `ContextArtifactSchema` | `node --test tests/artifact-schema.test.cjs` |
| ID-DETERMINISTIC | Deterministic ID generator | `node --test tests/context-store.test.cjs` |
| STORE-FILE-BACKED | Implement `context-store.cjs` | `node --test tests/context-store.test.cjs` |
| CLI-INTEGRATION | Update context build/read | Manual verification of CLI subcommands |

## Success Criteria
- [ ] `contextArtifactSchema` validates artifacts with all required provenance fields.
- [ ] `generateArtifactId` produces consistent SHA-256 hashes for the same source and content.
- [ ] `context-store` successfully saves and retrieves artifacts from `.planning/context/artifacts/`.
- [ ] `gsd-tools context read <id>` produces a correctly formatted markdown bundle.
- [ ] `gsd-tools context normalize --source <uri> --file <path>` stores an artifact and returns its ID.

## Verification Steps
1. **Schema Check**: Run `node --test tests/artifact-schema.test.cjs`.
2. **Store Check**: Run `node --test tests/context-store.test.cjs`.
3. **CLI Roundtrip**:
   - Normalize a file: `node gsd-tools.cjs context normalize --source "gsd-readme" --file "README.md"`
   - Note the ID returned.
   - Read the artifact: `node gsd-tools.cjs context read <ID>`
   - Verify the output matches the README.md content with the artifact header.
