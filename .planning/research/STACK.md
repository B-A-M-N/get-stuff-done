# Technology Stack: Intent Translation Layer

**Project:** GSD
**Researched:** 2024-05-24

## Recommended Stack

### Core Logic
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | 5.x | Language | Strong typing for canonical intent schemas. |
| Node.js | 18+ | Runtime | Native support for GSD CLI environment. |
| Zod | 3.x | Validation | Runtime type safety for intent extraction and provider responses. |

### Abstraction & Integration
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| LiteLLM (Optional) | Latest | Provider Abstraction | Can be used as a proxy or library if GSD moves away from pure native scripts. |
| Custom Middleware | N/A | Intent Mapping | GSD prefers minimal dependencies; a lightweight internal mapping layer is recommended. |

### Infrastructure & Observability
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SQLite | 3.x | Audit Trail | Local, file-based persistence for inference tracking without external DB. |
| JSON-RPC 2.0 | N/A | Plugin Protocol | Standardized communication between core GSD and modular provider plugins. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Abstraction | Custom ITL | LangChain | Too heavy; complex dependency tree; overkill for GSD's CLI-focused nature. |
| Persistence | SQLite | Flat JSON Files | SQLite offers better queryability for audit trails and inference metrics at scale. |
| Validation | Zod | Joi / AJV | Zod has better TypeScript integration and DX for defining schemas. |

## Installation

```bash
# Core dependencies for the ITL
npm install zod sqlite3

# Dev dependencies
npm install -D @types/sqlite3
```

## Sources

- [GSD ARCHITECTURE.md](https://github.com/get-stuff-done/gsd/blob/main/docs/ARCHITECTURE.md)
- [LiteLLM Documentation](https://docs.litellm.ai/)
- [Zod Documentation](https://zod.dev/)
