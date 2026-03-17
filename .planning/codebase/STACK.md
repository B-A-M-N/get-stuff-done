# Technology Stack

**Analysis Date:** 2025-02-14

## Languages

**Primary:**
- JavaScript (CommonJS) - Used for core logic in `get-stuff-done/bin/lib/`, CLI tools in `get-stuff-done/bin/gsd-tools.cjs`, and installation scripts in `bin/install.js`.

**Secondary:**
- Markdown - Used for AI agent definitions in `agents/`, workflow commands in `commands/`, and all planning documentation in `.planning/`.
- Shell (Bash) - Used within agents and commands for environment interaction and git integration.

## Runtime

**Environment:**
- Node.js >= 16.7.0

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- None (Standard Node.js modules only: `fs`, `path`, `child_process`, `os`, `crypto`, `readline`).

**Testing:**
- c8 (Coverage reporting) - Configured in `package.json` for `test:coverage`.

**Build/Dev:**
- esbuild - Used for building hooks in `scripts/build-hooks.js`.

## Key Dependencies

**Critical:**
- None (The project maintains zero runtime dependencies for portability).

**Infrastructure:**
- Git - Required for version control of planning documents and for `gsd-tools.cjs commit` functionality.

## Configuration

**Environment:**
- Environment variables: `BRAVE_API_KEY`, `CLAUDE_CONFIG_DIR`, `OPENCODE_CONFIG_DIR`, `GEMINI_CONFIG_DIR`, `CODEX_HOME`, `COPILOT_CONFIG_DIR`, `ANTIGRAVITY_CONFIG_DIR`.
- User-level defaults: `~/.gsd/defaults.json`.

**Build:**
- `package.json` for scripts and devDependencies.
- `scripts/build-hooks.js` for custom build steps.

## Platform Requirements

**Development:**
- Node.js (>=16.7.0)
- Git
- Linux, macOS, or WSL (with Linux-native Node.js).

**Production:**
- AI CLI Runtimes: Claude Code, Gemini CLI, OpenCode, Codex, Copilot, or Antigravity.

---

*Stack analysis: 2025-02-14*
