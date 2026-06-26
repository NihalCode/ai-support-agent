# MCP servers for AI Support Agent

This folder contains **stdio MCP server stubs** for Cursor and the investigation IDE. The Next.js app also supports **remote HTTP/SSE MCP** via `MCP_SERVER_CONFIG_JSON` in `.env.local`.

## Project vs global MCP config

| Location | Scope |
|----------|--------|
| `.cursor/mcp.json` (this repo) | Project-only — shared with teammates via git (use placeholders only) |
| `~/.cursor/mcp.json` | Global — all your Cursor projects |

Copy `.cursor/mcp.json.example` → `.cursor/mcp.json` and fill env vars in `.env.local`, not in committed JSON.

## Setup

1. Copy `.env.example` → `.env.local`
2. Copy `.cursor/mcp.json.example` → `.cursor/mcp.json`
3. Set `${env:VAR}` references — Cursor resolves them from your environment
4. Run validation:

```bash
npm run mcp:check
```

## Servers in this repo

| Server | Path | Purpose |
|--------|------|---------|
| logs | `mcp/servers/logs_server.py` | Log search by request ID / endpoint |
| cyware-api | `mcp/servers/cyware_api_server.py` | Live Cyware API calls (developer mode) |
| api-importer | `mcp/servers/api_importer_server.py` | Postman/OpenAPI import tools |

These are **stubs** — production wiring should call your log drain, CTIX tenant, or `POST /api/support/api-import`.

## Remote HTTP MCP (Vercel / production)

Set in `.env.local`:

```env
MCP_SERVER_CONFIG_JSON=[{"name":"my-server","url":"https://...","transport":"http","headers":{},"allowWrites":false}]
```

Use the Integrations → MCP tab or `GET /api/support/mcp` to list tools.

## Security

- Never commit `.env.local` or real tokens in `mcp.json`
- Use `SUPPORT_AGENT_READ_ONLY=true` to block writes
- MCP write tools require explicit approval in the app

## Disable a broken server

Remove its entry from `.cursor/mcp.json` or set `"disabled": true` if your Cursor version supports it.

## Add a new server

1. Add a script under `mcp/servers/`
2. Register it in `.cursor/mcp.json.example`
3. Extend `scripts/check-mcp.mjs`
4. Document env vars in `.env.example`

## Logs

- Cursor: Output panel → MCP
- App: `GET /api/support/audit` for tool execution audit trail
