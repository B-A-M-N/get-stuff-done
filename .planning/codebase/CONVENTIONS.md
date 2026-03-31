# Coding Conventions

**Analysis Date:** 2026-03-25

## Naming Patterns

**Files:**
- Use kebab-case for command files: `add-phase.cjs`, `verify-workflow-readiness.cjs`
- Use descriptive names for library modules: `config.cjs`, `authority.cjs`, `frontmatter.cjs`
- Test files use `.test.cjs` suffix: `commands.test.cjs`, `phase.test.cjs`

**Functions:**
- camelCase for all functions: `cmdConfigSet()`, `ensureConfigFile()`, `extractFrontmatter()`
- Command functions prefixed with `cmd`: `cmdConfigGet()`, `cmdStateUpdate()`
- Internal helpers use descriptive camelCase: `safeReadFile()`, `generateSlugInternal()`
- Factory/build functions: `buildDefaultConfig()`, `buildMetadata()`

**Variables:**
- camelCase for local variables and parameters: `tmpDir`, `keyPath`, `parsedValue`
- Use descriptive names; avoid single letters except for loop counters
- destructuring common: `const { stdout, stderr } = result`

**Constants:**
- UPPER_SNAKE_CASE for module-level constants: `VALID_CONFIG_KEYS`, `LOG_LEVELS`, `CONFIG_KEY_SUGGESTIONS`
- Use `const` for all constants; no `var`

**Types:**
- No TypeScript; pure JavaScript
- JSDoc used for parameter and return type documentation

## Code Style

**Modules:**
- CommonJS exclusively: `require()` for imports, `module.exports` for exports
- Strict mode: `'use strict'` at top of some files (not all)
- Module-scoped variables; avoid globals

**Functions:**
- Prefer named function declarations over arrow functions for exports
- Functions should be single-purpose and generally under 50 lines
- Complex functions (over 200 lines) exist but are exceptions (e.g., `verify.cjs` at 2862 lines, `second-brain.cjs` at 1280 lines)

**String Formatting:**
- Single quotes for strings: `'utf-8'`, `'error'`
- Double quotes used for template literals when interpolating: `` `Failed to sign ${filePath}` ``
- Multiline strings use template literals with backticks

**Quoting:**
- Object property keys without quotes when valid identifier: `{ created: true, reason: 'already_exists' }`
- String values in single quotes: `'already_exists'`, `'config.json'`

**Arrays and Objects:**
- Trailing commas in multi-line literals:
  ```javascript
  const result = {
    updated: true,
    key: keyPath,
    value: parsedValue,
    previousValue,
  };
  ```
- Inline arrays for short values: `['alpha', 'beta']`

**Indentation:**
- 2 spaces for indentation (observed in code)
- Align multiline expressions sensibly:
  ```javascript
  const signature = crypto.createHmac('sha256', context)
    .update(normalized)
    .digest('hex');
  ```

**Parentheses:**
- No extra spaces inside parentheses: `(err) =>`, `(cwd, keyPath, raw)`
- Space after `if`, `for`, `while`: `if (condition)`, `for (const x of y)`

**Line Length:**
- No strict enforcement observed; lines vary up to ~100 chars
- Long chains are broken at logical points

## Import Organization

**Order:**
1. Node built-ins: `const fs = require('fs');`
2. Internal modules from same directory: `const { output, error } = require('./core.cjs');`
3. Internal modules from other directories: `const authority = require('./authority.cjs');`
4. External dependencies: `const { z } = require('zod');`

**Grouping:**
- Each `require` on its own line
- Group related imports together with blank line between groups

**Path Aliases:**
- Relative paths only: `./core.cjs`, `../get-stuff-done/bin/lib/authority.cjs`
- No absolute path aliases configured

## Error Handling

**Strategy:**
- Centralized error function that logs and exits: `error(message)` from `core.cjs`
- Use `try/catch` for file operations when recovery is possible
- Many functions use `error()` directly; these functions terminate the process

**Patterns:**
```javascript
function cmdConfigSet(cwd, keyPath, value, raw) {
  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
  }
  // ... function body
}
```

- Validation before operations: check parameters, then proceed
- Errors include context: `'Failed to create config.json: ' + err.message`
- Silent failure avoided; `error()` always exits(1) after logging

**Safe Wrappers:**
- `safeReadFile()` wraps `fs.readFileSync` with sandbox enforcement and error context
- Returns `null` on failure rather than throwing: `const content = safeReadFile(statePath) || '';`

## Comments

**Header Comments:**
- File-level JSDoc-style comment blocks mandatory:
  ```javascript
  /**
   * Config — Planning config CRUD operations
   */
  ```

**Function Documentation:**
- JSDoc for most exported functions:
  ```javascript
  /**
   * Sets a value in the config file, allowing nested values via dot notation.
   *
   * Does not call `output()`, so can be used as one step in a command...
   */
  function setConfigValue(cwd, keyPath, parsedValue) { }
  ```

**Inline Comments:**
- Used sparingly for explaining non-obvious logic
- Example: "// Enforcement: Use sandbox if available to prevent bypasses"
- Complex regex patterns sometimes explained with comments

**Implementation Notes:**
- TODOs/FIXMEs observed in codebase (to be audited separately)
- Regression references included in tests: "REG-04 is fixed"

## Logging

**Framework:**
- Custom logger in `core.cjs` using `console` (stderr)
- No external logging library

**Levels:**
- `debug`, `info`, `warn`, `error`
- Color-coded output: cyan (debug), green (info), yellow (warn), red (error)
- Format: `[ISO timestamp] [LEVEL] message {meta JSON}`

**Configuration:**
- Log level controlled by `GSD_LOG_LEVEL` environment variable
- Default: `info`
- Used primarily for internal debugging; most user-facing output uses `output()` or `error()`

## Output Design

**Commands:**
- `output(result, raw, rawValue)` - JSON output by default, raw text with `--raw` flag
- Large JSON (>50KB) written to temp file with `@file:` prefix to avoid buffer limits
- Always calls `process.exit(0)` on success

**Errors:**
- `error(message)` logs to stderr and calls `process.exit(1)`
- Error messages are plain strings, not JSON

## Module Design

**Exports:**
- Named exports via `module.exports = { fn1, fn2, }`
- No default exports
- Consistent at end of file after all function definitions

**Barrel Files:**
- Present in packages: `packages/itl/index.cjs` re-exports from sibling modules
- Barrel files aggregate public API of a package

**Internal Organization:**
- Section comments separate logical blocks: `// ─── Logging ────────────────────────────────────────────────────────────`
- Constants defined first, then helper functions, then command functions
- Private functions (not exported) placed before exports at bottom or in separate files

## Data Validation

**Validation Library:**
- Zod used for schema validation in some modules (`itl-schema.cjs`, `verify.cjs`)
- Custom YAML-like frontmatter parser in `frontmatter.cjs` (no external YAML library)

**Validation Patterns:**
- Required parameter checks at function start
- Config schema validated against allowed keys: `VALID_CONFIG_KEYS` Set
- Type coercion for config values: `if (value === 'true') parsedValue = true;`

## File Operations

**Safe Access:**
- `safeReadFile()` used for reading planning files; integrates with sandbox and authority
- Direct `fs.readFileSync` for temporary/test files or when bypass is intended
- `fs.existsSync()` checks before operations
- All file ops use UTF-8 encoding

**Atomicity:**
- Not emphasized; file writes are direct
- Authority signing appends signature line after trimming

## Cross-Platform Considerations

- `path` module used for path joins
- `toPosixPath()` normalizes paths with forward slashes for consistency
- Tests use `path.join()` appropriately

## Testing Conventions

See TESTING.md for detailed testing patterns.

---

*Convention analysis: 2026-03-25*
