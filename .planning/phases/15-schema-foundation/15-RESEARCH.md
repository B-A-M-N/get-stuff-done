# Phase 15: Schema Foundation - Research

**Researched:** 2026-03-17
**Domain:** Zod schema design, CJS module exports, frontmatter parsing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- New file: `get-stuff-done/bin/lib/artifact-schema.cjs`
- This file owns all disk-persistence artifact schemas — distinct domain from ITL interpretation schemas
- Contains: `checkpointArtifactSchema`, `checkpointResponseSchema`, `executionSummarySchema`
- `executionSummarySchema` defined here now (even though SCHEMA-02 is Phase 19) — `artifact-schema.cjs` is the right home and Phase 19 just imports it
- CHECKPOINT.md format: YAML frontmatter + markdown body — matches STATE.md and other GSD artifacts
- Zod schema validates the frontmatter fields
- Required frontmatter fields (SCHEMA-01): `status`, `type`, `why_blocked`, `what_is_uncertain`, `choices`, `allow_freeform`, `resume_condition`, `resolved_at`
- Body contains human-readable context/explanation
- checkpointResponseSchema validates plain key:value text (existing agent return format) via Zod preprocessor
- Required agent response fields: `status`, `why_blocked`, `what_is_uncertain`, `choices`, `allow_freeform`, `resume_condition`
- `cmdVerifyCheckpointResponse` updated to use schema parse instead of manual field loops
- ITL decomposition: additive exports only — no breaking changes
- All existing exports in `itl-schema.cjs` remain identical
- Add individual named exports alongside existing `schemas.{}` namespace object
- New individual exports: `interpretationSchema`, `ambiguitySchema`, `lockabilitySchema`, `clarificationCheckpointSchema`, `clarificationPromptSchema`
- Zero importer updates needed

### Claude's Discretion
- Exact Zod preprocessor implementation for text-format checkpoint response parsing
- Whether to use `z.object().passthrough()` or strict shape for artifact schemas
- Internal helper functions within `artifact-schema.cjs`

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | `checkpointArtifactSchema` (Zod) — canonical shape for persisted CHECKPOINT.md (status, type, why_blocked, what_is_uncertain, choices, allow_freeform, resume_condition, resolved_at) | YAML frontmatter parsing via `extractFrontmatter` from `frontmatter.cjs`; Zod strict object validates parsed result |
| SCHEMA-04 | `checkpointResponseSchema` (Zod) formalizes agent checkpoint return — replaces manual field-by-field checking in `cmdVerifyCheckpointResponse` (verify.cjs line 211) | Zod `z.preprocess` transforms plain `key: value` text to object; verified API works in Zod 4.3.6 |
| SCHEMA-05 | `interpretationResultSchema` / `baseSeedSchema` decomposed into composable sub-schemas via additive exports | Individual sub-schemas already defined as `const` in itl-schema.cjs; only `module.exports` needs extending |
| CHECKPOINT-04 | `checkpointArtifactSchema` (Zod) defines the canonical shape of CHECKPOINT.md | Same schema as SCHEMA-01; `checkpointArtifactSchema` exported from `artifact-schema.cjs` satisfies both requirements |
</phase_requirements>

---

## Summary

This phase creates a new `artifact-schema.cjs` library file containing three Zod schemas — `checkpointArtifactSchema`, `checkpointResponseSchema`, and `executionSummarySchema` — and extends `itl-schema.cjs` with individual named exports for its already-defined sub-schemas. The work is additive infrastructure: no existing behavior changes, no imports break.

The project already has `extractFrontmatter` in `frontmatter.cjs` — a custom YAML parser that handles nested objects and inline arrays. This is the frontmatter strategy to use for `checkpointArtifactSchema`: read file with `extractFrontmatter`, then run the parsed object through the Zod schema. No external YAML library needed. The `z.preprocess` API (confirmed working in Zod 4.3.6) handles the text-to-object transformation for `checkpointResponseSchema`.

The `cmdVerifyCheckpointResponse` in `verify.cjs` (lines 211-263) currently does manual regex loop validation. After this phase it should call `checkpointResponseSchema.safeParse(content)` where the preprocessor handles parsing, producing a consistent `{ valid, errors, fields }` output shape. The test file `tests/checkpoint-validator.test.cjs` tests this function directly and must continue to pass with zero behavior change from the test's perspective.

**Primary recommendation:** Build `artifact-schema.cjs` following the `itl-schema.cjs` pattern exactly — schemas as const, parse functions wrapping `.parse()`, `module.exports` at the bottom. Use `extractFrontmatter` for frontmatter-backed schemas. Use `z.preprocess` for the agent text response schema.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.3.6 (installed) | Schema definition and validation | Already the project standard; `itl-schema.cjs` uses it |
| node:fs | built-in | Read artifact files | Already used throughout verify.cjs |
| frontmatter.cjs | internal | Parse YAML frontmatter from .md files | Project's existing parser — no external dep needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| core.cjs (internal) | — | `output`, `error`, `safeReadFile` helpers | Same pattern as all other verify.cjs commands |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| extractFrontmatter (internal) | js-yaml | `extractFrontmatter` is already used everywhere; no new dependency; handles project's YAML subset correctly |
| extractFrontmatter (internal) | gray-matter npm package | Same reason — project has no npm dependency for this and the internal parser covers the required fields |
| z.preprocess | manual regex loop (current code) | `z.preprocess` centralizes logic in the schema; the manual loop is exactly what SCHEMA-04 replaces |

**Installation:** No new packages needed. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
get-stuff-done/bin/lib/
├── artifact-schema.cjs   # NEW — disk-persistence artifact schemas
├── itl-schema.cjs        # MODIFIED — additive individual exports only
├── verify.cjs            # MODIFIED — cmdVerifyCheckpointResponse uses checkpointResponseSchema
├── frontmatter.cjs       # UNCHANGED — extractFrontmatter reused by artifact-schema.cjs
└── core.cjs              # UNCHANGED — output/error helpers
```

### Pattern 1: Schema + Parse Function Pair (from itl-schema.cjs)

**What:** Each schema is a `const` Zod schema, paired with a named parse function that wraps `.parse()`. The schema is also exported directly.

**When to use:** All new schemas in `artifact-schema.cjs`. Matches the established pattern for `parseAmbiguity`, `parseLockability`, etc.

**Example (following existing pattern):**
```javascript
// Source: get-stuff-done/bin/lib/itl-schema.cjs lines 86-92, 265-270

const ambiguitySchema = z.object({ /* ... */ });

function parseAmbiguity(input) {
  return ambiguitySchema.parse(input);
}

module.exports = {
  parseAmbiguity,
  schemas: { ambiguitySchema },
};
```

Apply the same shape for each new artifact schema:
```javascript
const checkpointArtifactSchema = z.object({ /* ... */ });

function parseCheckpointArtifact(input) {
  return checkpointArtifactSchema.parse(input);
}
```

### Pattern 2: z.preprocess for Text-to-Object Parsing

**What:** `z.preprocess` runs a transformation function before schema validation. The preprocessor for `checkpointResponseSchema` parses `key: value` text into a plain object.

**When to use:** Any schema that validates non-JSON input format. Here: the agent checkpoint return format (`status: checkpoint\nwhy_blocked: ...`).

**Confirmed working in Zod 4.3.6:**
```javascript
// Source: verified locally — z.preprocess(fn, schema) confirmed functional
const { z } = require('zod');

function parseKeyValueText(text) {
  if (typeof text !== 'string') return text;
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/im);
    if (match) result[match[1].trim()] = match[2].trim();
  }
  return result;
}

const checkpointResponseSchema = z.preprocess(
  parseKeyValueText,
  z.object({
    status: z.enum(['continue', 'checkpoint', 'blocked']),
    why_blocked: z.string().min(1),
    what_is_uncertain: z.string().min(1),
    choices: z.string().min(1),
    allow_freeform: z.enum(['true', 'false']),
    resume_condition: z.string().min(1),
  })
);
```

**Important:** The existing validation rules in `cmdVerifyCheckpointResponse` include content quality checks (vague pattern detection). These must be re-implemented as Zod `.refine()` calls or preserved as post-parse checks in the updated `cmdVerifyCheckpointResponse`.

### Pattern 3: Frontmatter-Backed Schema Validation

**What:** Read markdown file with `safeReadFile`, extract frontmatter with `extractFrontmatter`, then validate the resulting object with the Zod schema.

**When to use:** `checkpointArtifactSchema` and `executionSummarySchema` — both validate YAML frontmatter.

**Example (following verify.cjs pattern):**
```javascript
// Source: get-stuff-done/bin/lib/verify.cjs lines 108-115
const { extractFrontmatter } = require('./frontmatter.cjs');

const content = safeReadFile(fullPath);
const fm = extractFrontmatter(content);
const result = checkpointArtifactSchema.safeParse(fm);
```

### Pattern 4: Additive ITL Exports

**What:** Add individual named exports to `itl-schema.cjs` alongside the existing `schemas.{}` namespace. The sub-schema `const` declarations already exist; only `module.exports` changes.

**When to use:** SCHEMA-05. Zero risk of breaking existing importers.

**Before (current itl-schema.cjs lines 305-319):**
```javascript
module.exports = {
  // ... parse functions ...
  schemas: {
    interpretationSchema,
    ambiguitySchema,
    // ...
  },
};
```

**After (additive only):**
```javascript
module.exports = {
  // ... all existing exports unchanged ...
  schemas: { /* unchanged */ },
  // New individual exports:
  interpretationSchema,
  ambiguitySchema,
  lockabilitySchema,
  clarificationCheckpointSchema,
  clarificationPromptSchema,
};
```

### Anti-Patterns to Avoid
- **Modifying existing `schemas.{}` structure:** Only add to `module.exports` at the top level; the `schemas` object stays identical.
- **Adding `require('js-yaml')` or `require('gray-matter')`:** Use `extractFrontmatter` from `frontmatter.cjs` — zero new dependencies.
- **Changing `cmdVerifyCheckpointResponse` output shape:** The function's output `{ valid, errors, fields }` must remain structurally identical — `checkpoint-validator.test.cjs` asserts on it.
- **Putting executionSummarySchema in a different file:** It belongs in `artifact-schema.cjs` now, even though SCHEMA-03 validation is Phase 19.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex extractor | `extractFrontmatter` from `frontmatter.cjs` | Already handles nested objects, inline arrays, quoted values; used by all verify.cjs commands |
| Text-to-object parsing | Manual regex loop | `z.preprocess` | Already the project pattern (`stringListField` uses `z.preprocess(normalizeStringList, ...)` in itl-schema.cjs line 54) |
| Required field validation | `for (const field of requiredFields)` loop | Zod `z.object({ field: z.string().min(1) })` | Type-safe, composable, produces structured errors |

**Key insight:** The existing `cmdVerifyCheckpointResponse` manual loop (verify.cjs lines 217-262) is a textbook example of what Zod `z.preprocess` replaces. The `stringListField = z.preprocess(normalizeStringList, z.array(z.string()))` at itl-schema.cjs line 54 is the direct precedent.

---

## Common Pitfalls

### Pitfall 1: Vague Validation Rules Must Move Into Schema or Post-Parse Checks
**What goes wrong:** The current `cmdVerifyCheckpointResponse` has content-quality checks beyond field presence — it rejects `why_blocked: "Waiting for user input."` as too vague. If these are dropped during the schema migration, `checkpoint-validator.test.cjs` tests will fail.
**Why it happens:** Zod `.parse()` enforces structural rules but not semantic content rules by default.
**How to avoid:** Either add `.refine()` calls to the Zod schema for vague-pattern detection, or keep the content-quality checks as post-parse logic after `schema.safeParse()` succeeds.
**Warning signs:** `checkpoint-validator.test.cjs` test "checkpoint-response validator rejects vague or incomplete checkpoint returns" starts failing.

### Pitfall 2: choices Field Format Ambiguity
**What goes wrong:** The `choices` field in the agent response format is a bracketed string like `[mobile-first, desktop-first]` or the literal string `"none"`. The current code validates with `/^\[.*\]$/.test(extracted.choices)`. A strict Zod `z.string().min(1)` would accept any string, losing that validation.
**Why it happens:** The field is stored as text, not a parsed list in the agent response format.
**How to avoid:** Use `z.string().refine(val => /^\[.*\]$/.test(val) || /^none$/i.test(val), { message: 'choices must be a bracketed list or "none"' })`.

### Pitfall 3: extractFrontmatter Returns Empty Object on No Frontmatter
**What goes wrong:** `extractFrontmatter` returns `{}` when no `---` block exists. Passing `{}` to `checkpointArtifactSchema.parse()` will throw a ZodError listing all required fields as missing — but the error message might not be as helpful as a custom "CHECKPOINT.md has no frontmatter" message.
**Why it happens:** The function silently returns an empty object per its implementation (frontmatter.cjs line 13-14).
**How to avoid:** Check for empty frontmatter before parsing: if `Object.keys(fm).length === 0`, output a clear "no frontmatter found" error before attempting schema parse.

### Pitfall 4: Zod 4 vs Zod 3 API Differences
**What goes wrong:** Documentation and examples online for `z.preprocess` may reference Zod v3 APIs that changed in v4. However, `z.preprocess` is confirmed working in 4.3.6 as verified in this project's environment.
**Why it happens:** The project uses Zod `^4.3.6` (package.json line 53), not v3.
**How to avoid:** The API is confirmed: `z.preprocess(transformFn, schema)` works exactly as documented. The `stringListField` precedent in `itl-schema.cjs` line 54 is the confirmed reference pattern.

### Pitfall 5: resolved_at Is Optional
**What goes wrong:** `resolved_at` is in the SCHEMA-01 field list but represents when a checkpoint was resolved — it is null/absent for active (unresolved) checkpoints.
**Why it happens:** The field is always present in the persisted artifact, but empty until resolved.
**How to avoid:** Use `z.string().optional()` or `z.string().nullable()` for `resolved_at` consistent with how `itl-schema.cjs` handles optional fields (`.optional()` pattern is used throughout).

---

## Code Examples

Verified patterns from official sources and the project codebase:

### checkpointArtifactSchema (frontmatter-validated)
```javascript
// Source: SCHEMA-01 fields from REQUIREMENTS.md + itl-schema.cjs patterns
const checkpointArtifactSchema = z.object({
  status: z.enum(['pending', 'awaiting-response', 'resolved']),
  type: z.string().min(1),
  why_blocked: z.string().min(1),
  what_is_uncertain: z.string().min(1),
  choices: z.string().min(1),
  allow_freeform: z.union([z.boolean(), z.enum(['true', 'false'])]),
  resume_condition: z.string().min(1),
  resolved_at: z.string().optional(),
});
```

### checkpointResponseSchema (text-preprocessed)
```javascript
// Source: verify.cjs lines 217-262 logic, reformulated as Zod preprocessor
const checkpointResponseSchema = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val;
    const result = {};
    for (const line of val.split(/\r?\n/)) {
      const match = line.match(/^([a-z_]+):\s*(.+)$/im);
      if (match) result[match[1].trim()] = match[2].trim();
    }
    return result;
  },
  z.object({
    status: z.enum(['continue', 'checkpoint', 'blocked']),
    why_blocked: z.string().min(1)
      .refine(v => !/^waiting for user input\.?$/i.test(v), { message: 'why_blocked is too vague' }),
    what_is_uncertain: z.string().min(1)
      .refine(v => !/^needs clarification\.?$/i.test(v), { message: 'what_is_uncertain is too vague' }),
    choices: z.string().min(1)
      .refine(v => /^\[.*\]$/.test(v) || /^none$/i.test(v), { message: 'choices must be a bracketed list or "none"' }),
    allow_freeform: z.enum(['true', 'false']),
    resume_condition: z.string().min(1),
  })
);
```

### executionSummarySchema (frontmatter-validated)
```javascript
// Source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md frontmatter fields
const executionSummarySchema = z.object({
  phase: z.string().min(1),
  plan: z.string().min(1),
  name: z.string().min(1),
  requirements_completed: z.array(z.string()).optional(),
});
```

### ITL additive export extension
```javascript
// Source: itl-schema.cjs module.exports (lines 293-319) — extend only
module.exports = {
  // ... all existing exports unchanged ...
  toList,
  uniq,
  normalizeInterpretation,
  parseInterpretation,
  parseAmbiguity,
  parseLockability,
  parseAuditRecord,
  parseInterpretationResult,
  parseInitializationSeed,
  parseDiscussPhaseSeed,
  parseVerificationSeed,
  schemas: { /* unchanged */ },
  // SCHEMA-05 additions:
  interpretationSchema,
  ambiguitySchema,
  lockabilitySchema,
  clarificationCheckpointSchema,
  clarificationPromptSchema,
};
```

### Updated cmdVerifyCheckpointResponse (verify.cjs)
```javascript
// Source: verify.cjs lines 211-263 — replacement pattern
const { checkpointResponseSchema } = require('./artifact-schema.cjs');

function cmdVerifyCheckpointResponse(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const result = checkpointResponseSchema.safeParse(content);
  if (result.success) {
    output({ valid: true, errors: [], fields: result.data }, raw, 'valid');
  } else {
    const errors = result.error.errors.map(e => e.message);
    output({ valid: false, errors, fields: {} }, raw, 'invalid');
  }
}
```

---

## Existing Code Inventory

### Sub-schemas Already Defined in itl-schema.cjs (SCHEMA-05 targets)
All of the following are already defined as `const` in `itl-schema.cjs` and exported via `schemas.{}`. SCHEMA-05 just adds them as individual named exports:

| Schema Const | Currently Exported Via | SCHEMA-05 Adds |
|---|---|---|
| `interpretationSchema` | `schemas.interpretationSchema` | Top-level named export |
| `ambiguitySchema` | `schemas.ambiguitySchema` | Top-level named export |
| `lockabilitySchema` | `schemas.lockabilitySchema` | Top-level named export |
| `clarificationCheckpointSchema` | `schemas.clarificationCheckpointSchema` | Top-level named export |
| `clarificationPromptSchema` | `schemas.clarificationPromptSchema` | Not currently in `schemas.{}` — needs adding to both |

**Note:** `clarificationPromptSchema` is NOT currently in the `schemas.{}` export (itl-schema.cjs lines 305-318). The decision says to export it individually — but verify whether it also needs to be added to `schemas.{}` for consistency. It is used inside `clarificationCheckpointSchema.prompts`.

### executionSummarySchema Fields (confirmed from SUMMARY.md files)
From examining three SUMMARY.md files (01-01, 01-02, 01-03):
- `phase` — always present (e.g., `"01"`)
- `plan` — always present (e.g., `"01"`, `"02"`, `"03"`)
- `name` — always present (e.g., `"Global Rebrand to get-stuff-done"`)
- `requirements_completed` — present in 01-01 and 01-02 as array, absent in 01-03

SCHEMA-02 full spec adds: `one_liner`, `work_completed`, `key_files`, `verification`, `requirements_completed` as body sections. But for Phase 15, only the frontmatter schema matters. Body section validation is Phase 19 (SCHEMA-03).

### Existing Frontmatter Parsing Utility
`extractFrontmatter(content)` in `frontmatter.cjs` (lines 11-84):
- Input: raw markdown string
- Output: plain JS object with frontmatter fields
- Handles: nested objects, inline arrays `[a, b, c]`, block arrays (`- item`), quoted strings
- Returns: `{}` when no frontmatter block found
- Already imported by `verify.cjs` (line 9) and `state.cjs` (line 8)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `for (field of requiredFields)` regex loop | `checkpointResponseSchema.safeParse()` | Phase 15 | Structured errors, type safety, composable |
| `schemas.interpretationSchema` only | `interpretationSchema` direct export too | Phase 15 | Easier destructuring for downstream phases |
| No disk-artifact schema | `checkpointArtifactSchema` + `executionSummarySchema` | Phase 15 | CHECKPOINT.md and SUMMARY.md have canonical shapes |

**Deprecated/outdated after this phase:**
- Manual regex field loop in `cmdVerifyCheckpointResponse`: replaced by `checkpointResponseSchema.safeParse()`

---

## Open Questions

1. **clarificationPromptSchema in schemas.{} namespace**
   - What we know: `clarificationCheckpointSchema` IS in `schemas.{}` (line 316) but `clarificationPromptSchema` is NOT
   - What's unclear: CONTEXT.md says to export `clarificationPromptSchema` individually — should it also be added to `schemas.{}` for consistency?
   - Recommendation: Add it to both `schemas.{}` and as a top-level named export. Low risk since it's purely additive.

2. **Zod refine vs post-parse quality checks for checkpointResponseSchema**
   - What we know: Two approaches work — inline `.refine()` on field schemas, or post-`safeParse` checks in `cmdVerifyCheckpointResponse`
   - What's unclear: `.refine()` puts all logic in the schema (cleaner), but ZodError message format differs from the current explicit string messages
   - Recommendation: Use `.refine()` inline. The ZodError `e.message` values become the error strings — craft them to match the existing test assertions exactly (`'why_blocked is too vague'`, `'allow_freeform must be true or false'`, etc.)

3. **checkpointArtifactSchema status enum values**
   - What we know: SCHEMA-01 specifies fields but not `status` enum values; CHECKPOINT-03 (Phase 16) tracks `pending / awaiting-response / resolved`
   - What's unclear: Should Phase 15 define the status enum based on Phase 16 spec, or use `z.string().min(1)` and let Phase 16 tighten it?
   - Recommendation: Use the values from CHECKPOINT-03 spec (`z.enum(['pending', 'awaiting-response', 'resolved'])`) — they are already documented in REQUIREMENTS.md.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | `scripts/run-tests.cjs` (custom runner) |
| Quick run command | `node --test tests/checkpoint-validator.test.cjs` |
| Full suite command | `node scripts/run-tests.cjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | `checkpointArtifactSchema` validates CHECKPOINT.md frontmatter fields | unit | `node --test tests/checkpoint-validator.test.cjs` | ❌ Wave 0 |
| SCHEMA-04 | `checkpointResponseSchema` validates agent text response; `cmdVerifyCheckpointResponse` uses it | unit | `node --test tests/checkpoint-validator.test.cjs` | ✅ (existing tests must still pass) |
| SCHEMA-05 | Individual sub-schema exports in itl-schema.cjs | unit | `node --test tests/itl.test.cjs` | ✅ (existing tests; new destructuring tests needed) |
| CHECKPOINT-04 | `checkpointArtifactSchema` exported from `artifact-schema.cjs` | unit | `node --test tests/checkpoint-validator.test.cjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/checkpoint-validator.test.cjs && node --test tests/itl.test.cjs`
- **Per wave merge:** `node scripts/run-tests.cjs`
- **Phase gate:** Full suite green (845+ passing, same 5 pre-existing failures allowed) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test cases in `tests/checkpoint-validator.test.cjs` — covers SCHEMA-01/CHECKPOINT-04 (`checkpointArtifactSchema` validates required fields, rejects missing/invalid fields)
- [ ] New test cases for SCHEMA-05 in `tests/itl.test.cjs` — verifies individual named exports (`interpretationSchema`, `ambiguitySchema`, etc.) are importable via destructuring alongside `schemas.{}` access
- [ ] `get-stuff-done/bin/lib/artifact-schema.cjs` — the module itself (Wave 0 for schema file if pre-creating skeletons)

Note: `tests/checkpoint-validator.test.cjs` already exists and has 3 tests. New SCHEMA-01 and CHECKPOINT-04 test cases extend it; existing tests must remain green after `cmdVerifyCheckpointResponse` is refactored.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `get-stuff-done/bin/lib/itl-schema.cjs` — full schema and export patterns
- Direct code inspection: `get-stuff-done/bin/lib/verify.cjs` lines 211-263 — `cmdVerifyCheckpointResponse` exact implementation
- Direct code inspection: `get-stuff-done/bin/lib/frontmatter.cjs` — `extractFrontmatter` API and behavior
- Direct code inspection: `tests/checkpoint-validator.test.cjs` — test structure and assertions
- Direct code inspection: `tests/itl.test.cjs` — schema test patterns (`ZodError` import, `captureJson` usage)
- Local verification: `z.preprocess(fn, schema)` confirmed functional in Zod 4.3.6

### Secondary (MEDIUM confidence)
- `.planning/phases/01-foundational-rebrand-fixes/01-01-SUMMARY.md`, `01-02-SUMMARY.md`, `01-03-SUMMARY.md` — confirmed SUMMARY.md frontmatter fields: `phase`, `plan`, `name`, `requirements_completed`
- `package.json` — confirmed Zod version `^4.3.6`

### Tertiary (LOW confidence)
- None. All claims are backed by direct code inspection or local execution.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — itl-schema.cjs, frontmatter.cjs, and Zod 4.3.6 confirmed by direct inspection and local execution
- Architecture: HIGH — existing patterns copied directly from inspected source files
- Pitfalls: HIGH — derived from reading the exact code being replaced (verify.cjs lines 211-263) and test assertions in checkpoint-validator.test.cjs

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable internal codebase — frontmatter.cjs and itl-schema.cjs patterns won't change before implementation)
