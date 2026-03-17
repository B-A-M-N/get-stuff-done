# Testing Patterns

**Analysis Date:** 2025-03-16

## Test Framework

**Runner:**
- [Node.js built-in test runner]: `node --test` (Node 18+)
- Config: `scripts/run-tests.cjs` (custom cross-platform runner)

**Assertion Library:**
- [node:assert]: Built-in Node.js assertion library.

**Run Commands:**
```bash
npm test                      # Run all tests using node:test
npm run test:coverage         # Run tests with c8 coverage tracking
```

## Test File Organization

**Location:**
- [separate]: All test files are located in the `tests/` directory at the project root.

**Naming:**
- [Pattern]: `*.test.cjs` (e.g., `core.test.cjs`, `state.test.cjs`)

**Structure:**
```
tests/
├── helpers.cjs                # Shared test helpers
├── core.test.cjs              # Tests for bin/lib/core.cjs
└── ... (other test files)
```

## Test Structure

**Suite Organization:**
```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('Module name', () => {
  beforeEach(() => {
    // Setup logic, often creating a tmp directory
  });

  afterEach(() => {
    // Teardown logic, cleaning up tmp directory
  });

  test('Function name: should perform X given Y', () => {
    // Test logic
    assert.strictEqual(actual, expected);
  });
});
```

**Patterns:**
- [Setup pattern]: Creating a unique temporary directory (`fs.mkdtempSync`) for filesystem-based tests.
- [Teardown pattern]: Restoring original `process.cwd()` and removing the temporary directory (`fs.rmSync`).
- [Assertion pattern]: Using `assert.strictEqual`, `assert.ok`, `assert.deepStrictEqual`.

## Mocking

**Framework:** [Manual / Built-in mocks]

**Patterns:**
```javascript
// Mocking the filesystem using real temporary directories
let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));

// Mocking the child process (if needed) by wrapping functions
// Most tests perform real operations against the temp directory.
```

**What to Mock:**
- [Filesystem]: Mocked via `tmpDir` creation.
- [Environment Variables]: Sometimes modified during tests and restored in `afterEach`.

**What NOT to Mock:**
- [Internal logic]: The tests aim for high-fidelity behavior by interacting with a real (temporary) filesystem.

## Fixtures and Factories

**Test Data:**
```javascript
function writeConfig(obj) {
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'config.json'),
    JSON.stringify(obj, null, 2)
  );
}
```

**Location:**
- [In-test helpers]: Most fixture creation logic is within the test files themselves.

## Coverage

**Requirements:** [Target: 100%] - The `test:coverage` script in `package.json` will be updated to `--lines 100` per user steering.

**View Coverage:**
```bash
npm run test:coverage
```

## Test Types

**Unit Tests:**
- [Focus]: Individual functions in `lib/*.cjs`.
- [Approach]: Exhaustive testing of inputs, edge cases, and regression cases.

**Integration Tests:**
- [Focus]: CLI commands and cross-module interactions.
- [Approach]: Often involves running commands through the CLI router and checking output.

**E2E Tests:**
- [Focus]: Complete workflows (though not explicitly labeled as E2E).
- [Approach]: Tests that exercise several phases of a GSD workflow (e.g., `roadmap.test.cjs`).

## Common Patterns

**Async Testing:**
```javascript
test('Async command', async () => {
  const result = await someAsyncFunction();
  assert.ok(result);
});
```

**Error Testing:**
```javascript
test('should handle missing files gracefully', () => {
  const result = safeReadFile('/nonexistent');
  assert.strictEqual(result, null);
});
```

---

*Testing analysis: 2025-03-16*
