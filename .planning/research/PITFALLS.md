# Domain Pitfalls: Multi-Provider Translation Layer

**Domain:** Translation & Routing Layer
**Researched:** 2025-05-22
**Overall confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Intent Mismatch Across Providers
**What goes wrong:** A user request that maps perfectly to `/gsd:add-phase` in Claude might be misinterpreted by Gemini or Kimi as a simple `/gsd:quick` task due to differing attention mechanisms.
**Why it happens:** Claude excels at instruction following and "reading between the lines," whereas Gemini (3 Pro) can sometimes miss secondary parts of a multi-part request in short chat contexts.
**Consequences:** Users get the wrong command executed, leading to potential data loss (e.g., missing a full planning cycle for a complex task).
**Prevention:** Implement a "Routing Confirmation" step (as seen in `do.md`) that explicitly shows the reasoning and allows the user to override. Use standardized JSON schemas for intent extraction across all providers.

### Pitfall 2: Breaking Runtime-Specific Hooks
**What goes wrong:** Fixing the Claude hook system (e.g., changing path resolution or hook names) breaks Gemini CLI or OpenCode installations.
**Why it happens:** Claude Code uses `PostToolUse`, while Gemini CLI uses `AfterTool`. They often share the same `gsd-context-monitor.js` via the bridge file in `/tmp/`.
**Consequences:** Loss of context awareness, leading to "context wall" crashes where the agent stops mid-task.
**Prevention:** Maintain a strict separation of runtime-specific wrappers while keeping the core logic provider-agnostic. Use a common bridge format but runtime-specific registration logic in `install.js`.

## Moderate Pitfalls

### Pitfall 3: Latency Inflation (The "Middleware Tax")
**What goes wrong:** Adding a provider-agnostic translation layer adds 1-3 seconds to every command.
**Why it happens:** Every command now requires an initial LLM "intent extraction" pass before the actual GSD command logic begins.
**Prevention:** Cache intent mappings for repetitive commands. Use faster, smaller models (e.g., Gemini Flash or Claude Haiku) for the routing layer specifically.

### Pitfall 4: Test Matrix Explosion
**What goes wrong:** Testing 20+ commands across 3+ providers leads to 60+ test cases that are flaky due to LLM non-determinism.
**Prevention:** Use standardized mock responses for 90% of tests. Reserve live provider tests for "Smoke Tests" of the translation layer only.

## Minor Pitfalls

### Pitfall 5: Path Sensitivity in settings.json
**What goes wrong:** Renaming files or changing directory structures breaks hardcoded paths in `~/.claude/settings.json`.
**Prevention:** `gsd:update` must include a migration script that cleans up old hook registrations and installs new ones.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Provider Routing | Gemini Intent Miss | Force "Explicit Reason" in prompt |
| Hook Refactor | Broken OpenCode | Cross-platform integration tests |
| Renaming | User Muscle Memory | Alias old names to new ones for 1 version |

## Sources

- [Google Web Search: LLM Comparison 2025]
- [GSD Internal: gsd-context-monitor.js, do.md]
- [Claude Code Documentation: Hooks]
