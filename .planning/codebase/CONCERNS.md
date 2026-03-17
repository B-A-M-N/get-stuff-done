# Codebase Concerns

**Analysis Date:** 2025-01-24

## Tech Debt

**Large Monolithic Files:**
- Issue: Several core library files are approaching 1,000 lines, making them difficult to maintain and test in isolation.
- Files: `get-stuff-done/bin/lib/profile-output.cjs` (931 lines), `get-stuff-done/bin/lib/phase.cjs` (911 lines), `get-stuff-done/bin/lib/verify.cjs` (842 lines).
- Impact: Increased cognitive load for developers and higher risk of side effects during modifications.
- Fix approach: Refactor these files into smaller, more focused modules based on functional responsibility.

**Synchronous File I/O:**
- Issue: Heavy reliance on `fs.readFileSync` throughout the codebase.
- Files: Multiple files in `get-stuff-done/bin/lib/`, particularly `state.cjs` and `milestone.cjs`.
- Impact: Potential blocking of the event loop, though less critical for a CLI tool than a server.
- Fix approach: Transition to asynchronous file operations (`fs.promises`) where performance or responsiveness is a concern.

## Known Bugs

**Test Coverage Reporting:**
- Symptoms: `npm run test:coverage` fails due to missing `c8` dependency or environment issues.
- Files: `package.json`, `scripts/run-tests.cjs`
- Trigger: Running coverage script without `node_modules` installed.
- Workaround: Ensure `npm install` is run and dependencies are available.

## Security Considerations

**Command Injection Risks:**
- Risk: Use of `execSync` and `spawnSync` with potentially unvalidated inputs could lead to command injection.
- Files: `get-stuff-done/bin/lib/core.cjs`
- Current mitigation: Basic internal logic, but needs rigorous audit.
- Recommendations: Implement strict input validation and prefer `spawn` with argument arrays over shell execution where possible.

## Performance Bottlenecks

**Repeated State Parsing:**
- Problem: The `STATE.md` file is read and parsed repeatedly across different commands.
- Files: `get-stuff-done/bin/lib/state.cjs`
- Cause: Lack of an in-memory cache or state management system during a single execution.
- Improvement path: Implement a singleton or caching mechanism for state data during the lifecycle of a command execution.

## Fragile Areas

**Markdown Parsing Logic:**
- Files: `get-stuff-done/bin/lib/state.cjs`, `get-stuff-done/bin/lib/frontmatter.cjs`, `get-stuff-done/bin/lib/roadmap.cjs`
- Why fragile: Relies heavily on complex Regular Expressions to parse and update Markdown files. Small changes in file format can break the parser.
- Safe modification: Add comprehensive unit tests for all regex-based parsing before modifying.
- Test coverage: Partially covered by existing tests, but needs more edge-case scenarios.

## Scaling Limits

**Project Size vs. State Management:**
- Current capacity: Works well for small to medium projects.
- Limit: Extremely large projects with hundreds of phases might see performance degradation in state parsing and roadmap generation.
- Scaling path: Consider a more structured data format (like JSON/SQLite) for internal state, using Markdown only for user-facing views.

## Dependencies at Risk

**External Tool Dependencies:**
- Risk: Relies on external CLI tools like `git`, and potentially others depending on the user environment.
- Impact: If these tools are missing or have incompatible versions, core functionality fails.
- Migration plan: Implement better environment checks and clear error messages when dependencies are missing.

## Missing Critical Features

**100% Test Coverage:**
- Problem: Current test coverage is likely below the target of 100%.
- Blocks: Ensuring total reliability and safety during refactoring.

## Test Coverage Gaps

**Untested Logic in Large Files:**
- What's not tested: Complex branching logic in `profile-output.cjs` and `phase.cjs`.
- Files: `get-stuff-done/bin/lib/profile-output.cjs`, `get-stuff-done/bin/lib/phase.cjs`
- Risk: Undetected regressions in critical path logic.
- Priority: High

---

*Concerns audit: 2025-01-24*
