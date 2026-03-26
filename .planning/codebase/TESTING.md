# Testing Patterns

**Analysis Date:** 2026-03-25

## Test Framework

**Runner:**
- Node.js native test runner: `node --test`
- No external test framework (Jest, Vitest, Mocha not used)
- Config: none required; uses built-in Node test discovery

**Assertion Library:**
- Node.js built-in `assert` module (`node:assert`)
- Primary methods: `assert.strictEqual()`, `assert.deepStrictEqual()`, `assert.ok()`, `assert.throws()`

**Additional Test Utilities:**
- `c8` for coverage collection
- Custom test helper library: `tests/helpers.cjs` with `runGsdTools()`, `createTempProject()`, `cleanup()`

**Run Commands:**
```bash
# All tests
npm test
# Equivalent: node scripts/run-tests.cjs

# With coverage (specific files, 100% line coverage target)
npm run test:coverage

# Gate tests only
npm run test:gates

# All tests including gates
npm run test:all
```

**Test Runner Script:**
- `scripts/run-tests.cjs` discovers all `*.test.cjs` in `tests/` directory, sorts alphabetically, runs via `node --test`
- Propagates `NODE_V8_COVERAGE` for `c8` integration

## Test File Organization

**Location:**
- All test files in top-level `tests/` directory
- Co-located with source code? No. Separate `tests/` directory.
- Source code in `get-stuff-done/bin/lib/` and `commands/gsd/`

**Naming:**
- Test files: `<module-or-command>.test.cjs`
- Examples: `commands.test.cjs`, `frontmatter.test.cjs`, `config.test.cjs`, `authority.test.cjs`
- One test file per module typically, but some combined (e.g., `commands.test.cjs` tests multiple commands)

**Structure:**
```
tests/
├── helpers.cjs           # Shared test utilities
├── *.test.cjs            # Test files
└── *.test.cjs            # 63 test files total
```

## Test Structure

**Suite Organization:**
```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('phases list command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty phases directory returns empty array', () => {
    const result = runGsdTools('phases list', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.directories, [], 'directories should be empty');
  });

  test('lists phase directories sorted numerically', () => {
    // Test body
  });
});
```

**Patterns:**
- `describe()` blocks for grouping related tests (often per command or feature)
- `beforeEach()` creates fresh temporary project structure
- `afterEach()` cleans up temp directories
- Tests are pure functions; no shared mutable state between tests
- Assertions use descriptive messages as second parameter

## Mocking

**Framework:**
- No dedicated mocking library used
- Manual stubbing/mocking via direct function calls when testing pure functions
- File system mocked via temporary directories (not in-memory mocks)

**Patterns:**
```javascript
// Pure function test (no mocking needed)
const { extractFrontmatter } = require('../get-stuff-done/bin/lib/frontmatter.cjs');
test('parses simple key-value pairs', () => {
  const content = '---\nname: foo\n---\nbody';
  const result = extractFrontmatter(content);
  assert.strictEqual(result.name, 'foo');
});
```

**Environment Mocking:**
```javascript
let fakeHome;
let toolEnv;

beforeEach(() => {
  fakeHome = createFakeHome();
  toolEnv = { HOME: fakeHome, GSD_HOME: fakeHome };
});

const result = runGsdTools(args, tmpDir, { env: toolEnv });
```

**What to Mock:**
- Environment variables via `toolEnv` override
- File system: avoided; tests use real `fs` in isolated temp dirs
- External processes: `runGsdTools()` invokes real CLI; integration-style

**What NOT to Mock:**
- File system operations are tested against real temporary files
- Pure functions tested directly without mocking dependencies

## Fixtures and Factories

**Test Data Creation:**
- Programmatic creation of files/directories in temp project:
  ```javascript
  const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), summaryContent);
  ```

**Helper Functions:**
- `tests/helpers.cjs`:
  - `runGsdTools(args, cwd, options)` - executes CLI command
  - `createTempProject()` - creates temp dir with basic `.planning/phases` structure
  - `cleanup(tmpDir)` - removes temp directory
  - `createFakeHome()` - creates fake home directory for isolated config tests

**Fixtures Location:**
- Inline in test files (YAML/JSON/Markdown strings)
- No separate fixtures directory; test data is constructed programmatically

**Factories:**
- Simple factory functions within tests: `buildMetadata()`, `readConfig()` (test-specific)
- No separate factory library

## Coverage

**Requirements:**
- `npm run test:coverage` enforces `--check-coverage --lines 100`
- Coverage includes: `get-stuff-done/bin/lib/itl*.cjs`, `packages/itl/**/*.cjs`
- Excludes: `tests/**`
- Target: 100% line coverage on core ITL library

**View Coverage:**
```bash
# Run with coverage report
npm run test:coverage

# Coverage output format: text (default)
# All coverage data in `coverage/` directory
```

## Test Types

**Unit Tests:**
- Pure function tests: `frontmatter.test.cjs`, `authority.test.cjs` (manual runner)
- Test individual functions in isolation with direct `require()` and parameterized inputs
- No external dependencies; deterministic

**Integration Tests:**
- Most CLI command tests: `commands.test.cjs`, `config.test.cjs`, `phase.test.cjs`
- Execute full command via `runGsdTools()` which spawns Node child process
- Test real file system operations in temporary directories
- Verify end-to-end behavior including output JSON, file creation, etc.

**E2E Tests:**
- Not separately categorized; integration tests fill this role
- No browser or full-stack tests (this is a CLI tool)

## Common Patterns

**Async Testing:**
- Many tests are synchronous (most file operations use sync APIs)
- Async tests use `async/await` with `test()` supporting async:
  ```javascript
  test('async operation', async () => {
    const result = await someAsyncFunc();
    assert.strictEqual(result, expected);
  });
  ```

**Error Testing:**
```javascript
// Testing error() exits - typically via child process
test('missing required arg returns error', () => {
  const result = runGsdTools('config-set', tmpDir);
  assert.ok(!result.success, 'should fail');
  assert.ok(result.error.includes('Usage'), 'error message');
});

// Testing throws
test('malformed JSON throws', () => {
  assert.throws(() => {
    JSON.parse('invalid');
  }, /Unexpected token/);
});
```

**Multiple Assertions:**
- Multiple `assert.*` calls per test body
- Tests focus on one behavior but may have several assertions to verify complete result

**Data-Driven Tests:**
- Loops within test for multiple cases:
  ```javascript
  for (const [input, expected] of cases) {
    const result = fn(input);
    assert.strictEqual(result, expected);
  }
  ```
- Not using a parameterized test library; manual iteration

**Temporary Resource Management:**
```javascript
beforeEach(() => {
  tmpDir = createTempProject();
});

afterEach(() => {
  cleanup(tmpDir);
});

// Manual cleanup in try/finally for single tests
const tempFile = path.join(__dirname, 'temp-file.txt');
try {
  fs.writeFileSync(tempFile, content);
  // test...
} finally {
  if (fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
  }
});
```

## Test Configuration

**No Config Files:**
- No jest.config.js, vitest.config.ts, or similar
- Node's `--test` flag uses built-in discovery

**Coverage Config:**
- `package.json` script specifies includes/excludes via `c8` CLI flags

**Environment:**
- Tests run with default Node environment
- No special setup/teardown at runner level

## Code Smell Detection

**No Mutation Testing:**
- Not using mutation testing tools (Stryker, etc.)

**Flaky Test Detection:**
- No retry logic observed
- Tests assume stable file system and deterministic behavior

**Parallelization:**
- Tests run serially in Node's test runner (default)
- No test parallelization configured

## Test Data Isolation

- Each test gets fresh temp directory
- No shared state between tests
- Tests independent; order shouldn't matter

## Regression Tests

- Reference to REG-04 regression in `frontmatter.test.cjs`: "quoted comma inline array edge case"
- Specific bug repro steps included in test names and comments
- Test failures would indicate regressions

---

*Testing analysis: 2026-03-25*
