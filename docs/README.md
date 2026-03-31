# GSD Documentation

Comprehensive documentation for the Get Stuff Done (GSD) framework — a meta-prompting, context engineering, and spec-driven development system for AI coding agents.

## Documentation Index

| Document | Audience | Description |
|----------|----------|-------------|
| [Architecture](ARCHITECTURE.md) | Contributors, advanced users | System architecture, agent model, data flow, and internal design |
| [Open Brain Sidecar Architecture](OPEN-BRAIN-ARCHITECTURE.md) | Contributors, advanced users | Recommended split between Plane, Firecrawl, Second Brain, and a separate long-horizon Open Brain layer |
| [Feature Reference](FEATURES.md) | All users | Complete feature and function documentation with requirements |
| [Command Reference](COMMANDS.md) | All users | Every command with syntax, flags, options, and examples |
| [Configuration Reference](CONFIGURATION.md) | All users | Full config schema, workflow toggles, model profiles, git branching |
| [CLI Tools Reference](CLI-TOOLS.md) | Contributors, agent authors | `gsd-tools.cjs` programmatic API for workflows and agents |
| [Agent Reference](AGENTS.md) | Contributors, advanced users | All 15 specialized agents — roles, tools, spawn patterns |
| [User Guide](USER-GUIDE.md) | All users | Workflow walkthroughs, troubleshooting, and recovery |
| [Context Monitor](context-monitor.md) | All users | Context window monitoring hook architecture |

## Quick Links

- **Getting started:** [README](../README.md) → install → `/gsd:new-project`
- **Full workflow walkthrough:** [User Guide](USER-GUIDE.md)
- **All commands at a glance:** [Command Reference](COMMANDS.md)
- **Configuring GSD:** [Configuration Reference](CONFIGURATION.md)
- **How the system works internally:** [Architecture](ARCHITECTURE.md)
- **How to add long-horizon memory:** [Open Brain Sidecar Architecture](OPEN-BRAIN-ARCHITECTURE.md)
- **Contributing or extending:** [CLI Tools Reference](CLI-TOOLS.md) + [Agent Reference](AGENTS.md)
