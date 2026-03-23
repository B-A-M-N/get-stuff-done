# RESEARCH SUMMARY: Intent Translation Layer & Critical Infrastructure Repair

**Date:** 2026-03-23
**Prepared for:** GSD Roadmap Planning

---

## Executive Summary

This document synthesizes two complementary bodies of research: (1) the **Intent Translation Layer (ITL)** — a provider-agnostic abstraction for multi-LLM narrative-first interaction — and (2) **critical execution infrastructure repairs** required to restore basic system functionality. The ITL research (STACK, FEATURES, ARCHITECTURE, PITFALLS) provides a robust foundation for future multi-provider enhancements. However, three P0 showstopper bugs currently cripple the core execution pipeline, making any further development impossible until they are fixed. Phase 39 must address these immediately, after which the ITL implementation can proceed safely.

---

## Key Research Findings: Intent Translation Layer

### 1. Technology Stack (STACK.md)
- **Core:** TypeScript 5.x, Node.js 18+, Zod 3.x for runtime validation.
- **Infrastructure:** SQLite 3.x for audit trail, JSON-RPC 2.0 for plugin protocol.
- **Approach:** Custom middleware preferred over heavy frameworks (LangChain) to keep CLI lightweight.
- **Alternatives rejected:** LangChain (too heavy), flat JSON (poor queryability), Joi/AJV (weaker TS integration).

### 2. Feature Landscape (FEATURES.md)
- **Table stakes:** Natural Language Intent, Multi-Step Verification, Progress Transparency, Standardized Tooling.
- **Differentiators:** Narrative-First Extraction, Risk-Aware Friction, Semantic Confirmation, Plugin Hooks API.
- **Anti-features:** Hardcoded agent logic, provider locking, auto-execution of high-risk tasks.
- **Provider-specific patterns:** Claude (XML), Gemini (event-stream), OpenAI (Story of Thought), Kimi (agentic parallelism).

### 3. System Architecture (ARCHITECTURE.md)
- **Three layers:**
  1. ITL Core (Narrative Parser, Canonical Schema, Ambiguity Engine, Audit Logger)
  2. Provider Adapters (Payload mapping, response parsing, prompt registry)
  3. Hook System Integration (standardized event handlers for Claude and others)
- **Principles:** Preserve agent behavior; canonical over provider-specific; escalate on ambiguity; 100% test coverage.
- **Security:** Full audit trail for intent inference; secrets via env vars.

### 4. Domain Pitfalls (PITFALLS.md)
- **Critical:** Intent mismatch across providers; breaking runtime-specific hooks.
- **Moderate:** Latency inflation (middleware tax); test matrix explosion due to LLM non-determinism.
- **Minor:** Path sensitivity in settings.json; need migration script.
- **Mitigations:** Routing confirmation with explicit reasoning; separate runtime wrappers; caching; live provider tests only for smoke tests.

---

## Critical Infrastructure Deficiencies (Phase 39)

### P0-1: `safeWriteFile` Is Not Defined
- **Impact:** All file writes (58 call sites across 16 modules) fail with `TypeError: safeWriteFile is not a function`.
- **Root cause:** The function was never implemented in `core.cjs`, though declared intent exists in `authority.cjs:98`.
- **Expected signature:** `safeWriteFile(filePath, content, options?)` → `boolean`. If `options` includes `phase`, `plan`, `wave`, the function must append an authority envelope to the content before writing.
- **Recommended implementation (add to `core.cjs`):**

```javascript
function safeWriteFile(filePath, content, options = {}) {
  try {
    let finalContent = content;
    if (options.phase && options.plan && options.wave) {
      const authority = require('./authority.cjs'); // lazy to avoid cycle
      const signature = authority.generateSignature(content, options.phase, options.plan, options.wave);
      const ext = path.extname(filePath).toLowerCase();
      const envelope = ext === '.md'
        ? `<!-- GSD-AUTHORITY: ${options.phase}-${options.plan}-${options.wave}:${signature} -->`
        : `// GSD-AUTHORITY: ${options.phase}-${options.plan}-${options.wave}:${signature}`;
      finalContent = content.trimEnd() + '\n' + envelope + '\n';
    }
    safeFs.writeFileSync(filePath, finalContent, 'utf-8');
    return true;
  } catch (err) {
    logError(`safeWriteFile failed: ${filePath}: ${err.message}`);
    return false;
  }
}
```

- **Export:** Add `safeWriteFile` to `module.exports` in `core.cjs`.
- **Circular dependency:** `authority.cjs` imports from `core.cjs`. Requiring it inside the function is safe because the module will be fully loaded by runtime.

### P0-2: `safeGit.exec` Returns Wrong Type — Git Operations Broken
- **Impact:** All git-based control flow is inverted; success paths are not taken, and failures throw unhandled exceptions. Affects `cmdCommit`, `cmdCommitTask`, `cmdCompleteTask`, mutation detection, and status checks (30+ call sites).
- **Root cause:** `safeGit.exec` uses `execSync`, which returns a `Buffer` on success and throws on non-zero exit. Callers expect an object `{ exitCode, stdout, stderr }`.
- **Current code (broken):**
  ```javascript
  const safeGit = {
    exec: (cwd, args, opts = {}) => {
      const cmd = 'git ' + args.join(' ');
      return execSync(cmd, { cwd, stdio: 'pipe', ...opts }); // Buffer, no .exitCode
    }
  };
  ```
- **Verified:** Node.js `execSync` returns a Buffer with `exitCode` undefined.
- **Fix (replace with spawnSync-based, matching existing `execGit`):**

```javascript
const safeGit = {
  exec: (cwd, args, opts = {}) => {
    const result = spawnSync('git', args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
      ...opts
    });
    return {
      exitCode: result.status ?? 1,
      stdout: (result.stdout ?? '').toString().trim(),
      stderr: (result.stderr ?? '').toString().trim(),
    };
  }
};
```

- **Why not remove `safeGit`?** The API is widely used; fixing in place preserves stability and avoids a massive refactor. Existing `execGit` can remain as a separate utility.

### P0-3: `secondBrain` Used Before Import in planning-server (403 Handler)
- **Audit claim:** Inside the 403 response branch of `planning-server.cjs`, `await secondBrain.recordFirecrawlAudit(...)` is called, but `secondBrain` is only defined later inside a `try` block, causing `ReferenceError`.
- **Investigation:** The current `planning-server.cjs` (162 lines) has no reference to `secondBrain` anywhere. The 403 branch simply returns JSON. No top-level import of `secondBrain` exists.
- **Conclusion:** The described bug is not present in the current codebase. It may have been fixed by removing the problematic call, or the audit targeted a previous revision. However, if audit logging on 403 is desired, the correct pattern is to import `secondBrain` at the top and call it before returning. Recommend:
  - Verify whether 403 audit logging is a requirement.
  - If needed, add `const secondBrain = require('./second-brain.cjs');` at the top and insert the appropriate call in the 403 branch.
  - Ensure the call does not introduce unhandled exceptions; wrap in try/catch if failure is non-critical.
- **Confidence:** Medium – discrepancy requires manual review before closing.

---

## Implications for Roadmap

### Phase 39: Critical Execution Infrastructure Repair — Sprint Plan

**Objective:** Restore basic system functionality by addressing P0 bugs. No other work should proceed until this phase is complete.

**Task Breakdown:**

1. **Implement `safeWriteFile`** (Day 1)
   - Add function to `core.cjs` with signing support as shown above.
   - Update `module.exports` to include `safeWriteFile`.
   - Verify circular dependency handling with quick runtime test.

2. **Fix `safeGit.exec` return type** (Day 1, can be done in parallel with Task 1)
   - Replace the broken implementation with the `spawnSync` version.
   - Ensure the `opts` parameter is correctly merged without overriding `cwd`, `stdio`, `encoding`.
   - This single change corrects 30+ call sites across `commands.cjs`, `context.cjs`, `verify.cjs`.

3. **Audit and Fix planning-server 403 Handler** (Day 2)
   - Review `/v1/extract` endpoint’s 403 branch.
   - If `secondBrain` logging is required and present without import, add top-level require and ensure reachability.
   - If the call is absent, document that the issue is already resolved.

4. **Add Unit Tests** (Day 2)
   - Create `tests/core-safeWriteFile.test.cjs` covering plain write, signed write, error paths.
   - Create `tests/core-safeGit.test.cjs` covering success, non-zero exit, stderr capture.
   - Use temporary directories to avoid polluting project state.

5. **Full Regression Test Run**
   - Execute all existing tests to catch regressions.
   - Perform manual smoke tests: `gsd-tools.cjs commit`, `gsd-tools.cjs complete-task`, etc.

**Dependencies:** Tasks 1 and 2 are independent and can be done concurrently. Task 3 depends on understanding product requirements for 403 logging. Task 4 depends on Tasks 1 & 2. Task 5 depends on all.

**Estimated Effort:** 1–2 developer days.

**Risk Mitigation:** No database migrations; changes limited to `core.cjs` and possibly `planning-server.cjs`. Use feature flags? Not needed since changes are purely corrective.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| P0-1 (`safeWriteFile` missing) | HIGH | Clear absence in exports; multiple call sites fail. |
| P0-2 (`safeGit.exec` type) | HIGH | Code inspection and Node.js behavior confirmed; widespread brokenness. |
| P0-3 (`secondBrain` scoping) | MEDIUM | Discrepancy between audit and current code; may already be fixed. |
| ITL Research (STACK/FEATURES/ARCHITECTURE/PITFALLS) | HIGH | Well-documented with clear rationales and risk analysis. |
| Overall readiness to implement | HIGH | Fixes are localized and low-risk when paired with tests. |

**Gaps:**
- No pre-existing unit tests for the broken functions; must be created.
- Unclear whether 403 audit logging is a product requirement; needs clarification before implementing P0-3.
- Circular dependency between `core.cjs` and `authority.cjs` in `safeWriteFile` needs validation in a real run.

---

## Sources

### Primary Code & Audit
- `.planning/EXHAUSTIVE-CODE-AUDIT-2026-03-23.md`
- `get-stuff-done/bin/lib/core.cjs`
- `get-stuff-done/bin/lib/authority.cjs`
- `get-stuff-done/bin/lib/commands.cjs`
- `get-stuff-done/bin/lib/context.cjs`
- `get-stuff-done/bin/lib/verify.cjs`
- `get-stuff-done/bin/lib/planning-server.cjs`

### Research Artifacts (ITL)
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

---

## Conclusion

The GSD project faces a clear priority: repair critical execution infrastructure before any further feature development. The fixes for `safeWriteFile` and `safeGit.exec` are well-understood and can be implemented with minimal risk. The third item (secondBrain scoping) requires a quick manual verification but is likely already resolved. Once Phase 39 is complete, the research-backed ITL initiative can move forward on a stable foundation. The roadmap should schedule Phase 39 as an immediate priority, followed by ITL implementation and other planned enhancements.
