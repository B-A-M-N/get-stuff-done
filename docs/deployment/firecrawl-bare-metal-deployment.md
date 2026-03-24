# Firecrawl Bare Metal Deployment with Plane Integration

**Date:** 2026-03-23
**Status:** Design Specification
**Scope:** Deploy self-hosted Firecrawl with SearXNG and Playwright, configured with service account access to Plane's API for GSD integration

---

## 1. Overview

### Problem Statement
The get-stuff-done (GSD) system requires a self-hosted Firecrawl instance to serve as a controlled external context normalization layer. Firecrawl needs authenticated access to Plane's API to crawl internal documentation, project data, and work items. The deployment must be bare metal (no Docker) and integrate with existing Plane authentication.

### Solution Summary
Deploy Firecrawl as a systemd service on the same machine as Plane, using API key authentication with a dedicated service account. Firecrawl runs on port 3002, integrates with a local SearXNG instance for search, and uses Playwright for JavaScript-heavy pages. All external context requests from GSD agents route through this instance.

---

## 2. Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                      GSD Agents (Claude)                    │
│                  (via MCP @ localhost:3002)                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Firecrawl Server                         │
│              Node.js service: localhost:3002               │
│  - Scrape endpoint (clean markdown)                        │
│  - Search endpoint (structured results)                    │
│  - Extract endpoint (schema-validated extraction)          │
│  - Map endpoint (domain discovery)                         │
│  - Policy enforcement layer                                │
│  - Audit logging via SecondBrain                           │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
┌──────────────────┐      ┌──────────────────────┐
│   Plane API      │      │   External Sites     │
│  (localhost:8000)│      │  (via Playwright)    │
│  X-Api-Key auth  │      │  + OAuth if needed   │
└──────────────────┘      └──────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Plane Database                           │
│            (PostgreSQL - existing)                         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow
1. GSD agent requests: `firecrawl scrape https://plane.so/docs` or `firecrawl extract --url <url> --schema <schema>`
2. Firecrawl checks policy grant via SecondBrain (PostgreSQL-backed)
3. If granted:
   - For Plane-internal URLs: uses service account API key to authenticate
   - For external URLs: uses Playwright (with optional OAuth session cookies)
4. Returns structured markdown or schema-validated JSON
5. All requests audited to `second_brain_audit_log` table

---

## 3. Plane Configuration

### 3.1 Create Service Account User

**Option A: Via Django shell (recommended for automation)**

```bash
# Access Plane API container
docker compose exec api python ./bin/shell.py

# In Django shell:
from plane.db.models import User
from plane.db.models.api import APIToken

# Create service account (no superuser, minimal permissions)
firecrawl_user = User.objects.create_user(
    username="firecrawl-service",
    email="firecrawl-service@local",
    is_superuser=False,
    is_staff=False
)

# Generate API token (will display the token ONCE)
api_token = APIToken.objects.create(
    user=firecrawl_user,
    token=APIToken.generate_token(),  # or use plane.services.developer.api-token.service
    is_active=True
)

print(f"API Token: {api_token.token}")
```

**Option B: Via Plane's UI**
1. Create user in Plane admin (`/admin/`)
2. Log in as that user, go to Profile → API Tokens
3. Create a new token, copy it securely

### 3.2 Service Account Permissions

**Do NOT use superuser.** Create a dedicated workspace for Firecrawl service account with **viewer** (read-only) permissions. Then add that workspace as a **member** (read-only) to every project you want Firecrawl to access.

To create the service account and generate an API token:

1. In Plane, create a new user: `firecrawl-service@your-domain` (use any email, it doesn't need to be real)
2. Create a new workspace owned by this user: "Firecrawl Service"
3. Invite this workspace as a **Member** (read-only) to each target project
4. Log in as the service account (or use Django shell) to generate an API token:
   - Via UI: Profile → API Tokens → Create Token
   - Via shell (see Option A below)
5. Copy the token securely; it will be used as `PLANE_API_KEY`

**Verification:** Before deploying Firecrawl, test the token:
```bash
curl -H "X-Api-Key: sk-xxxxxxxx" http://localhost:8000/api/v1/workspaces/
# Should return 200 with workspace list
```

---

## 4. Firecrawl Deployment (Bare Metal)

### 4.1 Prerequisites

**System requirements:**
- Node.js 18+ (LTS)
- PostgreSQL 15+ (PostgreSQL - shared with Plane)
- Redis (optional, for caching - can use local instance)
- Playwright dependencies:
  ```bash
  # Ubuntu/Debian
  sudo apt-get install -y \
    ca-certificates \
    curl \
    wget \
    gnupg \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libxshmfence1
  ```

**Firecrawl source:**
- Clone Firecrawl repo: `git clone https://github.com/mendableai/firecrawl.git`
- Checkout appropriate version (tracking GSD's requirement)
- Install dependencies: `pnpm install`

### 4.2 Directory Layout

```
/home/bamn/firecrawl/
├── firecrawl/                 # Firecrawl source
├── planning-server/           # GSD planning server (port 3011)
├── data/
│   ├── cache/                # Firecrawl response cache
│   ├── logs/                 # Application logs
│   └── uploads/              # Temporary file storage
├── etc/
│   └── firecrawl.env         # Environment configuration
├── var/
│   └── run/
│       └── firecrawl.pid     # PID file
└── usr/
    └── local/
        └── bin/
            └── firecrawl     # Symlink to start script
```

### 4.3 Configuration Files

#### Environment file: `/home/bamn/firecrawl/etc/firecrawl.env`

```bash
# Firecrawl Server
FIRECRAWL_API_URL="http://localhost:3002"
FIRECRAWL_API_KEY="local"  # Self-hosted, no key required but SDK needs non-empty

# Plane Integration
PLANE_API_URL="http://localhost:8000"  # or https://your-plane-domain
PLANE_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # service account token

# Planning Server (GSD)
FIRECRAWL_PLANNING_URL="http://localhost:3011"

# Rate limiting (per-hostname token bucket in firecrawl-client.cjs)
FIRECRAWL_RATE_LIMIT_RPM="60"

# Storage
FIRECRAWL_DATA_DIR="/home/bamn/firecrawl/data"
FIRECRAWL_LOG_LEVEL="info"

# SecondBrain audit logging (GSD component) - uses SQLite for isolation
SECOND_BRAIN_DB_TYPE="sqlite"
SECOND_BRAIN_DB_PATH="/home/bamn/firecrawl/data/second-brain.db"

# Redis (optional cache)
REDIS_URL="redis://localhost:6379/0"

# Proxy (if needed for outbound requests)
HTTP_PROXY=""
HTTPS_PROXY=""
NO_PROXY="localhost,127.0.0.1"

# Playwright
PLAYWRIGHT_BROWSERS_PATH="/home/bamn/firecrawl/data/playwright-browsers"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="0"
```

### 4.4 Systemd Service

Create: `/etc/systemd/system/firecrawl.service`

```ini
[Unit]
Description=Firecrawl Service for Get-Stuff-Done
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=bamn
Group=bamn
WorkingDirectory=/home/bamn/firecrawl/firecrawl
EnvironmentFile=/home/bamn/firecrawl/etc/firecrawl.env
ExecStart=/usr/bin/node /home/bamn/firecrawl/firecrawl/packages/server/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=firecrawl

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/bamn/firecrawl/data

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable firecrawl
sudo systemctl start firecrawl
sudo systemctl status firecrawl
```

### 4.5 Building Firecrawl

```bash
cd /home/bamn/firecrawl/firecrawl
pnpm --filter @firecrawl/server build

# Verify output exists
ls -la packages/server/dist/
```

Add post-rebuild hook to restart service:
```bash
sudo systemctl restart firecrawl
```

---

## 5. SearXNG Integration

Firecrawl uses SearXNG for web search functionality. You have two options:

**Option A: Use existing SearXNG instance**
- If you already have SearXNG running, set `SEARXNG_URL` in `firecrawl.env`
- Example: `SEARXNG_URL="http://localhost:8080"`

**Option B: Deploy dedicated SearXNG for Firecrawl**
- Install SearXNG from source or Docker (but you said no Docker, so source/bleach)
- Place it behind Firecrawl as a backend
- Configure in Firecrawl's search endpoint:

Firecrawl's search implementation (`packages/server/src/routes/search.ts`) should be updated to:
1. Receive search query
2. Forward to SearXNG's `/search` endpoint
3. Parse results and fetch each URL via `scrape`
4. Return structured results with `{ title, url, markdown }`

If not already implemented, add this as a Phase 29 task.

---

## 6. Playwright Configuration

Firecrawl uses Playwright for browser automation. Ensure:

1. **Browser installation:**
   ```bash
   cd /home/bamn/firecrawl/firecrawl
   npx playwright install --with-deps chromium
   ```

2. **Permissions:**
   - Firecrawl service user (bamn) must have access to `/dev/shm` and display (though headless doesn't need X)
   - For headless, ensure `xvfb-run` is not needed

3. **Configuration in Firecrawl:**
   - `packages/server/src/services/scrape.service.ts` should use `playwright` with:
     - `headless: true`
     - `args: ['--no-sandbox', '--disable-setuid-sandbox']` (if running as root, but prefer non-root)
     - Timeout: 30s default, configurable

---

## 7. Policy/Grants System (SecondBrain)

Firecrawl's `firecrawl-client.cjs` already calls `policy.checkAccessGrant(url)` before making requests. This needs to be populated with grants that allow access to Plane's internal URLs.

### 7.1 Grant Management Commands

Add to `gsd-tools.cjs` (if not already present):

```javascript
case 'firecrawl': {
  const sub = args[0];
  switch (sub) {
    case 'grant':
      const urlPattern = args[args.indexOf('--url') + 1];
      const ttl = args[args.indexOf('--ttl') + 1] || '3600';
      await require('./lib/firecrawl-client.cjs').grant(urlPattern, 'read', parseInt(ttl));
      break;
    case 'revoke':
      const pattern = args[args.indexOf('--url') + 1];
      await require('./lib/firecrawl-client.cjs').revoke(pattern);
      break;
    case 'list':
      const policies = await require('./lib/firecrawl-client.cjs').list();
      console.log(JSON.stringify(policies, null, 2));
      break;
    default:
      error(`Unknown firecrawl subcommand: ${sub}`);
  }
  break;
}
```

### 7.2 Auto-Grant for Plane URLs

---

## 8. GSD Integration Points (Verification)

### 8.1 MCP Server Configuration

Add to `/home/bamn/.claude/settings.json`:

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "stdio",
      "command": "node",
      "args": ["/home/bamn/get-stuff-done/get-stuff-done/bin/lib/firecrawl-mcp-server.js"],
      "env": {
        "FIRECRAWL_API_URL": "http://localhost:3002",
        "FIRECRAWL_API_KEY": "local"
      }
    }
  }
}
```

The `firecrawl-mcp-server.js` should wrap `firecrawl-client.cjs` and expose tools: `firecrawl_scrape`, `firecrawl_search`, `firecrawl_extract`, `firecrawl_map`.

### 8.2 Agent Tool Access

Ensure researcher agents include `mcp__firecrawl__*` in their tool lists.

### 8.3 Health Check

`firecrawl-client.cjs` has a `check()` method that verifies both Firecrawl API and Planning Server are up. GSD's `gsd-tools firecrawl check` should call this.

---

## 9. Verification & Testing

### 9.1 Smoke Tests

```bash
# 1. Firecrawl is running
curl -X POST http://localhost:3002/v1/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://plane.so"}' | jq

```bash
# 2. Verify policy grants
gsd-tools firecrawl grants

# 3. Test scrape with Plane API key (use X-Api-Key header)
curl -X POST http://localhost:3002/v1/scrape \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_PLANE_SERVICE_ACCOUNT_TOKEN" \
  -d '{"url": "http://localhost:8000/api/v1/workspaces/"}'

# 4. Search with SearXNG (if configured)
curl -X POST http://localhost:3002/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Plane documentation project management"}'

# 5. Extract structured data (requires schema)
gsd-tools firecrawl check
```

### 9.2 GSD Integration Test

```bash
# In a GSD project
/gsd:new-project
# Answer questions, in research phase verify Firecrawl is used:
# - Researcher should call firecrawl_search instead of WebSearch
# - Logs should show Firecrawl requests
```

---

## 10. Security Considerations

1. **API Key Protection:**
   - Store `PLANE_API_KEY` in `/home/bamn/firecrawl/etc/firecrawl.env` with permissions `0600`
   - Never commit to git
   - Rotate periodically

2. **Least Privilege:**
   - Create service account with read-only access to specific workspaces
   - Avoid superuser

3. **Network Isolation:**
   - Bind Firecrawl to `127.0.0.1` only (firewall: `ufw deny 3002` from external)
   - Only GSD (localhost) should access it

4. **Audit Logging:**
   - All Firecrawl requests logged to SecondBrain
   - Review logs periodically: `SELECT * FROM second_brain_audit_log ORDER BY timestamp DESC LIMIT 100;`

5. **Rate Limiting:**
   - Enforce per-domain rate limits (`FIRECRAWL_RATE_LIMIT_RPM`)
   - Protect Plane API from excessive scraping

---

## 11. Deployment Checklist

- [ ] Install Node.js 18+, Playwright deps
- [ ] Clone and build Firecrawl
- [ ] Create service account in Plane
- [ ] Generate API token for service account
- [ ] Configure `firecrawl.env` with Plane API URL and key
- [ ] Set up data directories with correct permissions
- [ ] Create systemd service file
- [ ] Enable and start Firecrawl
- [ ] Verify Firecrawl responds on port 3002
- [ ] Configure policy grants for Plane URLs
- [ ] Set up SearXNG (if not already running)
- [ ] Configure GSD MCP server settings
- [ ] Run smoke tests (Section 9.1)
- [ ] Run GSD integration test (Section 9.2)
- [ ] Document service account credentials in password manager

---

## 12. Maintenance

### Logs
```bash
sudo journalctl -u firecrawl -f   # systemd logs
tail -f /home/bamn/firecrawl/data/logs/firecrawl.log  # app logs
```

### Restart
```bash
sudo systemctl restart firecrawl
```

### Updates
```bash
cd /home/bamn/firecrawl/firecrawl
git pull
pnpm install
pnpm --filter @firecrawl/server build
sudo systemctl restart firecrawl
```


---

## 13. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Firecrawl not starting | Port 3002 in use | `sudo lsof -i :3002`, kill conflicting process |
| 401 on Plane API | Invalid/expired API key | Regenerate service account token |
| Policy denied errors | No grant for URL | `gsd-tools firecrawl grant --url "http://localhost:8000/*"` |
| Playwright failures | Missing browser deps | `npx playwright install-deps` |
| Slow responses | No cache configured | Enable Redis or filesystem cache |
| Audit logs not appearing | DB connection error | Verify `DATABASE_URL` and table existence |

---

## 14. Next Steps After Deployment

Once Firecrawl is live:
1. Test all endpoints (`scrape`, `search`, `extract`, `map`)
2. Verify GSD agents use Firecrawl (check for `mcp__firecrawl__` tool calls)
3. Review audit logs for unexpected access patterns
4. Configure domain-to-schema mappings for Plane documentation
5. Set up monitoring/alerting for service health

---

## Appendix: Configuration Reference

### Firecrawl Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIRECRAWL_API_URL` | No | `http://localhost:3002` | Public facing URL |
| `FIRECRAWL_API_KEY` | No | `local` | Auth key for MCP clients |
| `PLANE_API_URL` | Yes | - | Plane API base URL |
| `PLANE_API_KEY` | Yes | - | Service account API token |
| `FIRECRAWL_PLANNING_URL` | No | `http://localhost:3011` | GSD planning server |
| `SECOND_BRAIN_DB_TYPE` | No | `sqlite` | `sqlite` only (use SQLite) |
| `SECOND_BRAIN_DB_PATH` | Yes | - | Path to SQLite file (required) |
| `FIRECRAWL_RATE_LIMIT_RPM` | No | `60` | Global rate limit (per hostname) |
| `FIRECRAWL_LOG_LEVEL` | No | `info` | `debug`/`info`/`warn`/`error` |

---

**Document Version:** 1.0
**Author:** Claude (Anthropic)
**Review Required:** Yes (infrastructure team)
