# Phase 3 Research: Coexistence-Safe Install Isolation

## Objective
Research how this fork can install side-by-side with an already-installed "actual GSD" without overwriting, shadowing, or cross-wiring command files, agents, engine assets, manifests, or uninstall behavior.

Additional steering:
- This fork must not take over the `/gsd:*` installed namespace.
- The installed surface should be clearly separated as `/dostuff:*`.
- The installed engine and agent set must also be isolated so this fork does not accidentally execute upstream `gsd-*` assets.

## Standard Stack
- **Keep installer logic in the existing Node.js installer surface**:
  - `bin/install.js`
- **Keep command/workflow prompts in markdown**:
  - `commands/**/*.md`
  - `get-stuff-done/workflows/**/*.md`
- **Preserve focused test coverage in `node:test`**:
  - `tests/copilot-install.test.cjs`
  - `tests/antigravity-install.test.cjs`
  - `tests/init.test.cjs`
- **Planning state remains in `.planning/`**:
  - do not let install changes break roadmap/state assumptions inside the repo

## Architecture Patterns

### 1. Separate installed command namespace from upstream GSD
The fork cannot safely coexist if it installs `/gsd:*` commands into the same runtime config root.

Recommended pattern:
1. Keep repo-internal `gsd` artifacts only as migration/reference material if needed.
2. Install only `/dostuff:*` user-facing commands from this fork.
3. Ensure install/uninstall/manifest code only manages `dostuff` command assets.

### 2. Separate installed engine directory
Command namespace isolation alone is not sufficient if both installs still write to the same engine directory.

Recommended pattern:
1. Give this fork its own installed engine root.
2. Rewrite command/workflow file references to that fork-specific engine path during install.
3. Ensure patch backup and uninstall are scoped to the fork-specific engine tree only.

### 3. Separate agent namespace where runtime requires named agents
If the fork installs `gsd-*` agents into a shared agent directory, it can overwrite or shadow actual GSD agents.

Recommended pattern:
1. Install a fork-specific agent prefix for this repo.
2. Update command/workflow references that spawn agents so they resolve to the isolated fork agent names.
3. Preserve behavior, but not shared identity, at install time.

### 4. Treat coexistence safety as an installer/runtime concern first
Do not mix narrative-first workflow changes into this phase.

Phase 3 should focus on:
- namespacing
- path isolation
- manifest/uninstall safety
- runtime install verification

Phase 4 can then add narrative-first initialization on top of the isolated surface.

## Don't Hand-Roll
- Do not install this fork into the same `/gsd:*` command namespace as upstream GSD.
- Do not keep using the shared installed engine path if coexistence is required.
- Do not leave uninstall logic broad enough to remove upstream GSD files.
- Do not rely on "users just won't install both" as a safety mechanism.

## Common Pitfalls

### 1. Command-only isolation
Changing `/gsd:new-project` to `/dostuff:new-project` is not enough if agents and engine files still collide.

### 2. Shared patch backup/manifests
If file manifests and local patch backup logic are still keyed to upstream paths, uninstall/update behavior can corrupt the real install.

### 3. Mixed agent names
Prompt files that still call `gsd-*` agents can silently route into upstream installs or stale assets.

### 4. Half-migrated runtime support
Claude/Gemini, OpenCode, Codex, Copilot, and Antigravity each have slightly different install layouts. Coexistence safety must hold across all supported runtimes, not just one.

## Prescriptive Recommendation
For Phase 3, implement the smallest safe coexistence slice:
1. Move this fork’s installed command surface to `/dostuff:*`
2. Move this fork’s installed engine assets to a separate fork-specific directory
3. Scope install/uninstall/manifest/patch handling to fork-owned assets only
4. Rename or isolate installed agents as needed to avoid `gsd-*` collisions
5. Add focused install/runtime tests that prove an existing GSD install would not be overwritten

This creates the safe foundation for later narrative-first workflow work without putting the user’s actual GSD install at risk.
