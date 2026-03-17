# Coding Conventions

**Analysis Date:** 2025-03-16

## Naming Patterns

**Files:**
- [JavaScript/CommonJS]: kebab-case (e.g., `gsd-tools.cjs`, `core.cjs`)
- [Markdown]: UPPERCASE (e.g., `PROJECT.md`, `ROADMAP.md`, `STATE.md`)
- [Tests]: `*.test.cjs` (e.g., `core.test.cjs`)

**Functions:**
- [CamelCase]: Used for all function names (e.g., `loadConfig`, `safeReadFile`, `cmdStateLoad`)

**Variables:**
- [CamelCase]: Used for local variables and parameters (e.g., `cwd`, `statePath`, `content`)

**Constants:**
- [SCREAMING_SNAKE_CASE]: Used for true constants (e.g., `MODEL_PROFILES` in `model-profiles.cjs`)
- [PascalCase]: Sometimes used for configuration objects or similar structures.

## Code Style

**Formatting:**
- [Tool used]: No explicit formatter (Prettier/ESLint) config found in root, but code follows a consistent style.
- [Key settings]: 2-space indentation, single quotes for strings (mostly), semicolon usage.

**Linting:**
- [Tool used]: Not detected in `package.json` devDependencies.
- [Key rules]: Manual consistency in CommonJS usage and module structure.

## Import Organization

**Order:**
1. [Built-in modules]: `fs`, `path`, `child_process`, `os`
2. [Internal library modules]: `require('./lib/core.cjs')`
3. [Other local imports]

**Path Aliases:**
- [Aliases used]: Not detected. All imports use relative paths (e.g., `../get-stuff-done/bin/lib/core.cjs`).

## Error Handling

**Patterns:**
- [Safe Reads]: Use `safeReadFile` which returns `null` instead of throwing on missing files.
- [Try/Catch Blocks]: Used around JSON parsing and file writes to prevent crashes.
- [Fatal Errors]: Use the `error(message)` helper which writes to `stderr` and calls `process.exit(1)`.
- [Structured Returns]: Command handlers often return objects with `passed: boolean` and `errors: string[]`.

## Logging

**Framework:** [Custom helper]

**Patterns:**
- [Output]: Use the `output(result, raw, status)` helper in `core.cjs` to write JSON or raw status to `stdout`.
- [Error]: Use `error(message)` for user-facing errors.

## Comments

**When to Comment:**
- [Module Header]: Description of the module's purpose.
- [Section Dividers]: Using `// ─── ... ───` to group related functions.
- [JSDoc]: Used for non-trivial functions to describe parameters and return values (e.g., `normalizeMd`, `isGitIgnored`).

**JSDoc/TSDoc:**
- [Usage pattern]: Standard JSDoc style for function documentation.

## Function Design

**Size:** Functions are generally small and focused, though command routers can be large.

**Parameters:** Command handlers typically take `(cwd, ...args, raw)`.

**Return Values:** Handlers usually return `void` and use the `output()` helper to provide feedback. Internal helpers return values or `null` on failure.

## Module Design

**Exports:** [CommonJS]: `module.exports = { ... }` at the end of the file.

**Barrel Files:** [Not used]: Individual modules are required directly from `lib/`.

---

*Convention analysis: 2025-03-16*
