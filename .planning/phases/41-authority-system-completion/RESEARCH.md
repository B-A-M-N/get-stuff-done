# Phase 41 RESEARCH: Authority System Completion

**Date:** 2026-03-23
**Based on:** Codebase audit (authority.cjs, core.cjs, sandbox.cjs, planning-server.cjs, commands.cjs, state.cjs, roadmap.cjs)
**Status:** Complete — ready for implementation

---

## Problem Statement

Phase 41 aims to complete the authority system that ensures all modifications to system-managed files in `.planning/` are cryptographically traceable to a specific GSD execution wave (phase-plan-task). Phase 39 implemented `safeWriteFile` with envelope signing; Phase 30 added blocking verification on reads for restricted paths. However, significant gaps remain: the system is not uniformly applied across all file operations, audit logging for authority failures is missing, the authority secret fallback is insecure, and the Planning Server does not verify signatures. Additionally, many system writes to protected files (e.g., STATE.md, ROADMAP.md) are currently unsigned, and many reads bypass verification. Completion requires a coordinated effort to enforce signing and verification across all code paths, secure fallback behavior, and comprehensive testing.

**Primary recommendation:** Systematically replace all direct filesystem access to system-managed `.planning/` files with `safeReadFile`/`safeWriteFile`, add audit logging for authority violations, remove hardcoded fallback secret, and ensure the Planning Server validates envelopes.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-COMPLETE-01 | Authority envelope signing is enforced for all writes to system-managed files in `.planning/` (STATE.md, ROADMAP.md, phase artifacts, audit logs, checkpoints). | All write entrypoints (state.cjs, roadmap.cjs, phase.cjs, commands.cjs) must use `safeWriteFile` with `options.phase`, `options.plan`, and `options.wave` (or `task`). Existing direct `fs.writeFileSync` calls and `safeWriteFile` without options must be updated. |
| AUTH-COMPLETE-02 | Authority envelope verification is enforced for all reads of system-managed `.planning/` files, covering CLI commands, the Planning Server `/v1/extract` endpoint, and internal library functions. | Replace raw `fs.readFileSync` for protected files with `safeReadFile`. Add `authority.verifySignature` check and `exit(13)` on failure to Planning Server responses. Ensure `loadConfig`, `getMilestoneInfo`, `findPhaseInternal`, and similar functions use `safeReadFile`. |
| AUTH-COMPLETE-03 | Secure fallback handling and audit logging are implemented for the authority subsystem. | Remove hardcoded fallback secret (`gsd-authority-fallback-secret-stable-v1`) from `authority.cjs:31`. Log every authority verification failure to `.planning/audit/ledger.jsonl` via `audit.recordAuditEntry` before exit. Ensure sandbox error fallback in `safeReadFile` fails securely (deny access to restricted paths). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` | built-in | HMAC-SHA256 signatures | No external deps; sufficient for envelope signing |
| `fs` / `path` | built-in | File operations and path handling | Standard library only |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `safeWriteFile` (core.cjs) | current | Write files with optional authority envelope | Always for writes to `.planning/` and restricted paths |
| `safeReadFile` (core.cjs) | current | Read files with sandbox + authority verification | Always for reads of restricted paths |
| `audit.recordAuditEntry` | current | Structured audit logging | Log all authority failures and significant events |
| `node:sqlite` | optional | Local fallback for `second-brain` | Only when Postgres unavailable |

**Test Framework:** Custom Node.js test scripts using `assert` (see `tests/` directory). Run via `npm test` (`node scripts/run-tests.cjs`).

## Architecture Patterns

### Authority Envelope Format
- Markdown files: `<!-- GSD-AUTHORITY: <phase>-<plan>-<wave>:<64-hex-sig> -->`
- Code files (other extensions): `// GSD-AUTHORITY: <phase>-<plan>-<wave>:<64-hex-sig>`
- The signature covers all content preceding the envelope line, using HMAC-SHA256 with project-specific secret.

### Error Handling Pattern
- Verification failure (missing/invalid signature) → `process.stderr.write(...)` then `process.exit(13)`.
- Sandbox module load error in `safeReadFile` → currently `{ allowed: true }` (insecure fallback); should deny restricted paths.

### Lazy Dependency
- `authority` module lazy-required in `safeWriteFile` to avoid circular dependencies.

### Logging
- Use `audit.cjs` for structured audit records; include `impact`, `context`, `integrity` fields.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File signing for restricted paths | Custom crypto or manual envelope tagging | `authority.generateSignature` + `safeWriteFile` | Guarantees consistent envelope format and HMAC key management |
| Path sandbox checks | Ad-hoc regex or string prefix | `sandbox.checkPath` | Centralized DENY_LIST with pattern matching and traversal protection |
| Audit trail for security events | Manual file writes | `audit.recordAuditEntry` | Adds project_id, actor, narrative linkage, and validates against ITL database |
| Process spawning for git | Shell command strings | `safeGit.exec` (spawnSync with args array) | Prevents shell injection and provides structured result |

## Common Pitfalls

### Pitfall 1: Hardcoded Authority Fallback Secret
**What goes wrong:** In `authority.cjs:31`, if reading/writing the secret file fails, it returns `'gsd-authority-fallback-secret-stable-v1'`. This value is identical across all projects and persists across runs, enabling signature forgery in degraded mode.
**Why it happens:** Desire to keep system functional if `.gemini_security/authority.key` is on read-only storage.
**How to avoid:** Remove fallback; throw error or generate a random per-process secret (non-persistent). If the secret cannot be persisted, the system should fail securely rather than operate with a known weak secret.
**Warning signs:** Any occurrence of `"gsd-authority-fallback-secret-stable-v1"` in code or log output.

### Pitfall 2: Inconsistent Adoption of safeWriteFile
**What goes wrong:** Some system-managed files (e.g., STATE.md via `writeStateMd`, ROADMAP.md via `roadmap.cjs`) are written without phase/plan/wave options, resulting in missing envelopes. This breaks the guarantee that all modifications are signed and traceable.
**Why it happens:** `writeStateMd` and roadmap update functions call `safeWriteFile` without authority context.
**How to avoid:** Audit all writes to `.planning/` and ensure they invoke `safeWriteFile` with appropriate context. For operations without natural phase/plan/wave (e.g., manual edits), consider a bootstrap mode or explicit signing command.
**Warning signs:** `safeWriteFile(` calls without the `phase`, `plan`, `wave` options; generated files lacking `GSD-AUTHORITY` lines.

### Pitfall 3: Direct fs Accesses Bypassing Verification
**What goes wrong:** Many functions read `.planning/` files using raw `fs.readFileSync` (e.g., `loadConfig`, `getMilestoneInfo`, `getRoadmapPhaseInternal`) or `safeFs.readFileSync` (e.g., many command implementations). These bypass sandbox and signature checks, allowing tampered files to be used without detection.
**Why it happens:** Convenience; some code predates authority or assumes files are trusted.
**How to avoid:** Replace all such calls with `safeReadFile`. For files that are user-edited and may not have envelopes (e.g., ROADMAP.md, config.json), either sign them during system updates or refine the sandbox to exclude them from DENY_LIST.
**Warning signs:** `fs.readFileSync(... '.planning' ...)` or `safeFs.readFileSync(...)` in code that processes orchestrator artifacts.

### Pitfall 4: Planning Server Serves Unsigned Content
**What goes wrong:** Planning Server (`planning-server.cjs`) uses `fs.readFileSync` to serve `.planning/` files via `/v1/extract`. It performs no authority verification, so agents receive tampered content.
**Why it happens:** Authority checks were only added to `safeReadFile`; the server predates this enforcement.
**How to avoid:** Update Planning Server to call `safeReadFile` for files within `.planning/`, or add explicit `authority.verifySignature` check and return HTTP 403 on failure. Ensure the server gracefully handles verification failures (returns error JSON, does not crash).
**Warning signs:** `/v1/extract` endpoint implementation uses `fs.readFileSync` directly.

### Pitfall 5: Missing Audit Trail for Authority Violations
**What goes wrong:** When `safeReadFile` encounters invalid/missing signature, it writes to stderr and exits 13 but does **not** create an audit entry. Security monitoring and forensics are blind to attack attempts.
**Why it happens:** Authority verification was implemented as a hard stop without instrumentation.
**How to avoid:** Before exiting, call `audit.recordAuditEntry` with `impact.severe` and a descriptive `context`. The audit logger itself should use `safeFs` to avoid recursion.
**Warning signs:** No `audit.recordAuditEntry` calls in `safeReadFile` or Planning Server violation paths.

## Code Examples

### Correct Write with Authority
```javascript
// From commands.cjs – signing before staging
if (options.phase && options.plan) {
  const wave = options.wave || options.task || '1';
  const filePath = path.isAbsolute(file) ? file : path.join(cwd, file);
  if (safeFs.existsSync(filePath) && !safeFs.statSync(filePath).isDirectory()) {
    const sig = authority.signFile(filePath, options.phase, options.plan, wave);
    if (sig) signatures.push(sig);
  }
}

// Alternatively, use safeWriteFile directly for new content:
const content = "Some changes\n";
safeWriteFile(filePath, content, { phase: '41', plan: '01', wave: '1' });
```

### Correct Read with Verification
```javascript
// From safeReadFile – core pattern
let decision;
try {
  const sandbox = require('./sandbox.cjs');
  decision = sandbox.checkPath(process.cwd(), filePath);
} catch (e) {
  // Fail securely: still check authority for restricted paths even if sandbox errors?
  decision = { allowed: false }; // improved fallback
}

const content = fs.readFileSync(filePath, 'utf-8');

if (decision.allowed === false) {
  const auth = require('./authority.cjs');
  const result = auth.verifySignature(content);
  if (!result.valid) {
    // TODO: audit.recordAuditEntry(...) // AUTH-COMPLETE-03
    process.stderr.write(`[Sandbox] Read denied: ${result.reason} for ${filePath}\n`);
    process.exit(13);
  }
}
return content;
```

### Avoid Hardcoded Fallback Secret
```javascript
// In authority.cjs:getAuthoritySecret – replace fallback
function getAuthoritySecret() {
  const secretPath = path.join(process.cwd(), '.gemini_security', 'authority.key');
  try {
    if (safeFs.existsSync(secretPath)) {
      return safeFs.readFileSync(secretPath, 'utf-8').trim();
    }
    const secret = crypto.randomBytes(64).toString('hex');
    safeFs.mkdirSync(path.dirname(secretPath), { recursive: true });
    safeFs.writeFileSync(secretPath, secret, 'utf-8');
    return secret;
  } catch (err) {
    // Do NOT fall back to a stable string; fail or generate per-process secret
    const sessionSecret = crypto.randomBytes(64).toString('hex');
    console.error('[Authority] Using volatile session secret – persist failed:', err.message);
    return sessionSecret; // not stable across restarts, but better than hardcoded
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `fs` calls for everything | `safeReadFile`/`safeWriteFile` wrappers | Phase 28–30 | Centralized enforcement point |
| No envelope verification | Blocking verification on restricted reads (exit 13) | Phase 30 | Tamper detection and fail-stop |
| Accidental `GSD_INTERNAL_BYPASS` backdoor | Removal planned in Phase 35 | Phase 35 (not this phase) | Closes sandbox bypass |
| Unstructured error messages | Structured audit + errors | Phase 32 | Better observability |

**Deprecated/outdated:**
- `GSD_INTERNAL_BYPASS` as a mechanism for internal access (should be eliminated).
- Direct `fs.readFileSync` for `.planning/` files (should be migrated).
- Hardcoded fallback secret in `authority.cjs` (insecure).

## Open Questions

1. **How should user-edited files (ROADMAP.md, PROJECT.md) be handled?** They may not naturally have authority envelopes. Options: a) require system updates to sign them, b) exclude from DENY_LIST, c) introduce a bootstrap trust mode. Need to decide to finalize DENY_LIST refinement.

2. **What is the recovery process if the authority secret is lost?** A new secret will invalidate all existing envelopes. Consider adding a `gsd-tools authority rotate` command that re-signs all `.planning/` files with the new key (requires verification of current signatures for migration).

3. **Should Planning Server ever allow unsigned files for compatibility?** During multi-phase rollout, a degraded mode could skip verification but flag warnings. However, this weakens guarantees; may be acceptable as temporary migration aid.

## Validation Architecture

**Test Framework:** Custom Node.js test scripts (`node --test` or via `npm test`). Environment: `tests/` directory contains unit and integration tests. Example: `node tests/authority.test.cjs`.

**Phase Requirements → Test Map**

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| AUTH-COMPLETE-01 | All writes to `.planning/` use `safeWriteFile` with phase/plan/wave | static analysis / unit | `node scripts/check-direct-writes.cjs` (tbd) | ❌ Wave 0 |
| AUTH-COMPLETE-01 | `safeWriteFile` adds correct envelope for .md and .js | unit | `node tests/core-safeWriteFile.test.cjs` | ✅ existing |
| AUTH-COMPLETE-02 | `safeReadFile` exits 13 on missing/invalid envelope | integration | `node tests/authority-read-enforce.test.cjs` | ❌ Wave 0 |
| AUTH-COMPLETE-02 | Planning Server `/v1/extract` returns error on tampered file | e2e | `node tests/planning-server-auth.test.cjs` | ❌ Wave 0 |
| AUTH-COMPLETE-03 | No hardcoded fallback secret (value not used) | unit | `node tests/authority-secret-fallback.test.cjs` | ❌ Wave 0 |
| AUTH-COMPLETE-03 | Authority failures create audit entry | integration | `node tests/audit-authority-failure.test.cjs` | ❌ Wave 0 |

**Sampling Rate:**
- Per task commit: run `node tests/<affected>.test.cjs` for modified test files.
- Per wave merge: full test suite via `npm test`.
- Phase gate: `npm test` must pass with no failures, and new tests for AUTH-COMPLETE-01/02/03 must be added and green.

**Wave 0 Gaps:**
- [ ] `tests/authority-read-enforce.test.cjs` – tests `safeReadFile` exit behavior for restricted files.
- [ ] `tests/planning-server-auth.test.cjs` – verifies Planning Server blocks tampered files.
- [ ] `tests/authority-secret-fallback.test.cjs` – ensures no hardcoded fallback secret.
- [ ] `tests/audit-authority-failure.test.cjs` – confirms audit entry on verification failure.
- [ ] `scripts/check-direct-writes.cjs` – static analysis to detect raw `fs.writeFileSync` to `.planning/`.

## Sources

### Primary (HIGH confidence)
- `get-stuff-done/bin/lib/authority.cjs` – core signing/verification.
- `get-stuff-done/bin/lib/core.cjs` – `safeWriteFile` (lines 164–193), `safeReadFile` (134–162), `getMilestoneInfo` (755, 796) direct fs calls.
- `get-stuff-done/bin/lib/sandbox.cjs` – DENY_LIST and bypass logic.
- `get-stuff-done/bin/lib/commands.cjs` – `cmdCommitTask` (300–786), `writeStateMd` pattern.
- `get-stuff-done/bin/lib/state.cjs` – `writeStateMd` (912–915) writes STATE.md unsigned.
- `get-stuff-done/bin/lib/roadmap.cjs` – ROADMAP read/write (18, 290).
- `get-stuff-done/bin/lib/planning-server.cjs` – `/v1/extract` reads via `fs.readFileSync` (103).

### Secondary (MEDIUM confidence)
- `.planning/phases/39-critical-execution-infrastructure-repair/39-RESEARCH.md` – details `safeWriteFile` implementation.
- `.planning/phases/30-strict-context-determinism-enforcement-hardening/30-01-PLAN.md` – describes ENFORCE-07/08 blocking behavior.
- `.planning/EXHAUSTIVE-CODE-AUDIT.md` – identifies critical holes (bypass via raw fs, Planning Server lack of verification).
- `tests/authority.test.cjs` – existing unit tests for signing/verification.
- `tests/core-safeWriteFile.test.cjs` – existing `safeWriteFile` tests.
- `tests/sandbox.test.cjs` – sandbox path checks.

### Tertiary (LOW confidence)
- Assumed behavior of `audit.recordAuditEntry` based on `audit.cjs` – not currently called from authority paths; needs integration testing.
- Impact of DENY_LIST refinement on user-edited files – requires design decision beyond code inspection.

---

**Note:** Research complete. The planner can now create PLAN.md files that address the three AUTH-COMPLETE requirements, adding tasks to (1) enforce signing across all system-managed files, (2) enforce verification for all reads, (3) secure fallbacks and audit, plus the necessary tests.
