# Synthesis Storage Ownership — Design Note

## Decision
**Synthesis persistence substrate lives in this repository.**
Ownership: **Phase 11 / truth-synthesis subsystem**
Rationale: The synthesis logic, validation, and activation all reside here. Deferring persistence to an external service would split guarantees and complicate testing without any existing service to integrate.

---

## Ownership & Module Boundary

| Concern | Owner |
|---------|-------|
| Synthesis artifact creation | `bin/lib/phase-truth.cjs` (existing) |
| Provenance collection | same (already implemented) |
| **Persistence write API** | **New: `bin/lib/synthesis-store.cjs`** |
| Database schema | New tables: `authority.synthesis_artifacts`, `authority.synthesis_sections` |
| Read queries for activation | `synthesis-store.cjs` (used by `SystemManager` or `SynthesisService`) |
| Migration | New file: `scripts/init-authority.sql` |

### `synthesis-store.cjs` API

```javascript
// Minimal, focused interface
module.exports = {
  // Persist a synthesized artifact and its sections
  storeSynthesis(missionId, artifact) → Promise<void>

  // Retrieve by mission (for verification/activation)
  getSynthesisArtifacts(missionId) → Promise<array>

  // Verify storage health
  checkConnection() → Promise<boolean>
}
```

---

## Minimal Schema

### `authority.synthesis_artifacts`

```sql
CREATE TABLE IF NOT EXISTS authority.synthesis_artifacts (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL, -- e.g., 'phase-truth', 'SUMMARY.md', etc.
  content TEXT NOT NULL, -- full markdown or JSON of the synthesized artifact
  atom_ids_used JSONB NOT NULL DEFAULT '[]',
  synthesis_citations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_synthesis_artifacts_mission
  ON authority.synthesis_artifacts(mission_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_artifacts_created
  ON authority.synthesis_artifacts(created_at DESC);
```

### `authority.synthesis_sections`

```sql
CREATE TABLE IF NOT EXISTS authority.synthesis_sections (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES authority.synthesis_artifacts(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL, -- e.g., 'goals', 'constraints', 'summary'
  section_content TEXT NOT NULL,
  atom_ids_used JSONB NOT NULL DEFAULT '[]',
  synthesis_citations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_synthesis_sections_mission
  ON authority.synthesis_sections(mission_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_sections_artifact
  ON authority.synthesis_sections(artifact_id);
```

**Notes:**
- `authority` schema distinguishes this from `gsd_local_brain` and `gsd_open_brain`.
- `mission_id` provides isolation (enforced throughout Phase 11+).
- Provenance arrays (`atom_ids_used`, `synthesis_citations`) are machine-verifiable.
- `artifact_type` allows categorization without schema explosion.

---

## Write Path

1. **`phase-truth.cjs`** (or synthesis producer) constructs artifact object:
   ```javascript
   {
     id: generateArtifactId(missionId, type),
     mission_id: missionId,
     artifact_type: type,
     content: markdownOrJson,
     atom_ids_used: [...], // collected during synthesis
     synthesis_citations: [...] // collected during validation
   }
   ```
2. Calls `synthesis-store.storeSynthesis(missionId, artifact)`.
3. `synthesis-store.cjs`:
   - Inserts row into `synthesis_artifacts`.
   - If artifact has sections, inserts rows into `synthesis_sections`.
   - All within a transaction (rollback on any failure).
4. Success → synthesis is persisted and activation can proceed.

---

## Read Path (Activation)

When `SystemManager` enables `SynthesisService`:

- On startup, can query `getSynthesisArtifacts(missionId)` to reconstruct what was synthesized in a given mission.
- Verification phase can cross-check persisted artifacts against file system artifacts.
- Activation status depends on successful storage write; if storage fails, system remains in degraded/blocked state.

---

## Migration & Activation

### New Files to Create
1. `get-stuff-done/bin/lib/synthesis-store.cjs` — implementation
2. `scripts/init-authority.sql` — schema creation
3. Update `scripts/run-tests.cjs` or test helper to include authority DB initialization if not already present

### Activation Prerequisite
Run `init-authority.sql` on the same Postgres instance used by Second Brain. No separate database required; use existing connection pool with `schema.sql` executed once per deployment.

### Verification
- Unit tests for `synthesis-store.cjs` (mock DB)
- Integration test that stores and retrieves a synthesis artifact with correct provenance
- Full suite should still pass (1482/1483) after adding this layer

---

## Guardrails (per earlier recommendation)

- **Do not** overload Second Brain tables directly; keep authority tables separate.
- **Do not** repurpose `authority.cjs` (cryptographic module) as storage.
- **Do not** design federation now; keep it local and minimal.
- **Do not** enable activation until `synthesis-store` is implemented and verified.

---

## Status

- [x] Ownership decision: **in-process (this repo)**
- [ ] Schema SQL written (`scripts/init-authority.sql`)
- [ ] `synthesis-store.cjs` implemented
- [ ] Tests added
- [ ] Activation wiring enabled
- [ ] Full suite green
