# INTEGRATIONS

## External APIs & Services
- **Brave Search API:** Used for enhanced web research via `gsd-tools.cjs websearch`. Auth via `BRAVE_API_KEY` env var or `~/.gsd/brave_api_key`.
- **AI CLI Runtimes:** Integrates with Claude Code, Gemini CLI, OpenCode, GitHub Copilot, Codex, and Antigravity. Supported through custom commands and skills.

## Data Storage
- **Databases:** Local SQLite databases found in `.gemini_security/` (`graphiti.db`, `pulse.db`, `second_brain.db`).
- **Filesystem:** Primary storage for planning documents (`.planning/`) and project state (`STATE.md`).

## Authentication
- Managed via environment variables for various AI platforms (e.g., `CLAUDE_CONFIG_DIR`, `GEMINI_CONFIG_DIR`, `OPENCODE_CONFIG_DIR`).
- Project-specific secrets are excluded via `.gitignore`.

## CI/CD & GitHub
- **GitHub Actions:** Workflows in `.github/workflows/` for automated testing (`test.yml`) and issue labeling (`auto-label-issues.yml`).
- **Templates:** Pull request and issue templates in `.github/`.
- **Metadata:** `CODEOWNERS` and `FUNDING.yml` for repository management.

---
*Last updated: 2026-03-16*
