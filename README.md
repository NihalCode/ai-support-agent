# AI Support Agent

A standalone, production-ready agent that helps **non-technical clients resolve
GitHub/Jira/ticket issues with minimal engineering involvement**. The client
describes a problem; the agent retrieves repo + ticket context (RAG), diagnoses
the root cause, decides **who should fix it** (client / support / engineering),
drafts customer + engineering responses, and — only with explicit approval —
posts a comment back to the ticket.

It runs **fully offline with realistic mocks** (no keys required) and upgrades
to live GitHub, Jira, OpenAI, and Pinecone automatically when credentials are
present.

Beyond issue triage, it also connects to a **real Jira account**, ingests **any
API or Postman collection**, talks to **remote MCP servers**, treats **Cyware
Intel Exchange (CTIX)** as a configurable API provider, and generates **Cyware
Query Language (CQL)** grounded strictly in the live docs. Every state-changing
action is classified by a **safety engine** and gated behind an **approval
queue**.

---

## Why it exists

Today the support chain is: *client reports → support investigates → support
escalates → engineering diagnoses*. This agent collapses that into a single
step: the client (or a support rep) gets an immediate, **evidence-cited**
diagnosis with a recommended fix and a routing decision.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (+ inline design tokens) |
| Vector DB | Pinecone (SDK-free REST client) with **in-memory cosine fallback** |
| Embeddings | OpenAI `text-embedding-3-small` (512-dim) with **local hashing-embedding fallback** |
| Reasoning | OpenAI `gpt-4o-mini` with a **deterministic heuristic fallback** |
| Connectors | GitHub REST v3 + Jira Cloud REST v3 (production) + Cyware (CTIX) + remote MCP (HTTP/SSE), all with **mock fallbacks** |
| API import | OpenAPI 3 / Swagger 2 (JSON+YAML) · Postman v2.x · cURL · markdown |
| Safety | Deterministic action classifier + approval queue + audit, redaction |
| Tests | Vitest |

Everything that touches a credential is optional. With **zero** env vars the app
is fully functional on mocks.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # optional — fill in any keys you have
npm run dev                  # http://localhost:3000
```

Open the app, leave the repo field blank (uses the mock `acme/checkout-service`),
type a problem like *"After upgrading, /api/charge returns 404"*, and click
**Analyze issue**. You'll get the full structured triage report with citations.

### AI Support Investigation IDE (Cursor-style workspace)

The UI is a **multi-panel investigation IDE** inspired by modern AI coding tools (without copying proprietary branding):

| Region | Purpose |
|--------|---------|
| **Activity bar** | Explorer, Search, Source Control, Investigations, API Registry, CQL, Jira, Logs, MCP, Settings |
| **Primary sidebar** | Context for the active activity (imports, search, tickets, MCP status) |
| **Editor tabs** | Investigation, diagnose, API registry, endpoint detail, API runner, integrations, CQL, MCP config |
| **AI chat panel** | Support agent chat, slash commands (`/investigate`, `/validate-cql`, …), follow-ups when a session exists |
| **Bottom panel** | Problems, MCP status, import jobs, agent trace summary, terminal hints |
| **Command palette** | `Ctrl+K` / `Ctrl+Shift+P` — import APIs, start investigation, toggle panels |

Keyboard shortcuts: `Ctrl+B` sidebar · `Ctrl+J` bottom panel · `Ctrl+Shift+I` investigation · `Ctrl+Shift+C` CQL · `Ctrl+Shift+M` MCP.

On first load, **Cyware APIs (CTIX, CSAP, CFTR, Orchestrate) and CQL docs auto-import** from bundled specs (`data/cyware-specs/`) into Pinecone/memory — no manual script required.

### IDE features (split editor, RAG search, streaming, terminal)

See **[docs/IDE-FEATURES.md](docs/IDE-FEATURES.md)** for:

- Split editor (`Ctrl+\`, compare side-by-side, persisted layout)
- Semantic/hybrid workspace search (`POST /api/support/search`)
- Streaming AI chat (`POST /api/support/agent/chat/stream`)
- Allowlisted terminal runner (bottom panel)
- Investigation object (pinned evidence, hypotheses, export)

**E2E tests:** `npm run test:e2e` (uses `TEST_MODE=true` — no real credentials required).

### Build App + Deploy (v0 / Cursor-style)

Describe a Cyware API app in natural language — the **App Builder Agent** selects a template, picks endpoints from the API Registry, generates server-side API routes, and prepares Vercel deployment with approval gates.

See **[docs/BUILD-APP.md](docs/BUILD-APP.md)** · **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** · **[docs/ENTERPRISE-SETUP.md](docs/ENTERPRISE-SETUP.md)** · **[docs/SECURITY-BUILD-APP.md](docs/SECURITY-BUILD-APP.md)**

```bash
# Activity bar → Build App (🛠), or /build-app in chat
# API: POST /api/support/build-app { "action": "plan", "message": "Build indicator search dashboard…" }
```

```bash
# Force refresh auto-import
curl -X POST http://localhost:3000/api/support/bootstrap
```

Investigation returns a **Markdown report** (`markdownReport`) matching the spec format.

API: `POST /api/support/investigate` with `{ "query": { "text": "..." } }`.  
Follow-up chat: `{ "sessionId": "...", "message": "..." }`.

Set `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` for live deployment/log correlation (mock data used when unset).

### Validate the build

```bash
npm test          # 175 unit + integration tests (offline)
npm run mcp:check # validate MCP server files + env hints
npm run typecheck # tsc --noEmit
npm run lint      # eslint (flat config)
npm run build     # next build
```

---

## How it works (architecture)

```
            ┌─────────────────────────── UI (src/components) ───────────────────────────┐
            │  SupportAgent → IssueForm · DiagnosisView · Citations · Context · Responses │
            │                 ConfirmModal · TestMode                                     │
            └───────────────┬────────────────────────────────────────────────────────────┘
                            │ fetch
      ┌─────────────────────▼───────────────────── API routes (src/app/api/support) ─────┐
      │ status · health · ingest · analyze · tickets · comment · patch · write · test      │
      │ approvals · api-import · mcp · cql · cyware · sources · audit                        │
      └─────────────────────┬─────────────────────────────────────────────────────────────┘
                            │
   ┌────────────────────────▼──────────────────────── Services (src/lib/support) ─────────┐
   │ ingest ── chunk ── embed ── vector-store(pinecone|memory)                             │
   │ analyze ── retrieve(citations) ── classify(heuristic) ── openai(llm refine)          │
   │ patch · comment · audit · config · ssrf                                               │
   │ connectors/ ── github · jira · mock · factory(auto-fallback)                          │
   └───────────────────────────────────────────────────────────────────────────────────────┘
```

**Pipeline for a single analysis** (`src/lib/support/analyze.ts`):

1. **Retrieve** — embed the query, query the repo's namespace, diversify across
   source types (code/docs/issues/PRs/jira). Auto-ingests on first use if the
   namespace is empty.
2. **Classify (heuristic prior)** — a deterministic engine
   (`classify.ts`) detects category, fixability, confidence, evidence,
   fix-steps, questions, and escalation — grounded only in the client's words +
   retrieved chunks. It **never invents files**.
3. **Refine (LLM, optional)** — when `OPENAI_API_KEY` is set, `gpt-4o-mini`
   upgrades the report, constrained to the retrieved file list. Any hallucinated
   file path or patch is dropped. Without a key, the heuristic output is used.

### Structured triage output (spec items A–K)

| | Field |
|---|---|
| A | Plain-English summary |
| B | Likely root cause |
| C | Confidence (High/Medium/Low) |
| D | Evidence found (cited) |
| E | Fixability (client / support / engineering / not-enough-info / not-doable) |
| F | Suggested fix steps |
| G | Code-level fix suggestion (diff, risk, tests, rollback) |
| H | Questions to ask the client |
| I | Suggested customer response |
| J | Engineering escalation note |
| K | Sources / citations |

---

## Extended capabilities (multi-connector upgrade)

These build on the triage core; each has a dedicated API route and a UI section
under the **Integrations & tools** tab. All writes flow through one safety
classifier → approval queue → executor → audit path.

| Capability | Route | What it does |
|---|---|---|
| **Connector health** | `GET /api/support/health` | Live status for OpenAI/Pinecone/GitHub/Jira/Cyware/MCP (masked secrets only) |
| **Jira (production)** | `analyze`/`write` | Project-scoped JQL search, rich issue read (priority, links, history, attachments), comment, transition, link, create — writes approval-gated |
| **Universal API import** | `POST /api/support/api-import` | Normalize OpenAPI/Swagger/Postman/cURL/markdown into one schema; optional RAG indexing |
| **MCP servers** | `GET/POST /api/support/mcp` | Discover tools on remote HTTP/SSE MCP servers; preview (safe) + approve-to-run; write-tool detection |
| **Cyware CQL** | `POST /api/support/cql` | `{intent:"index"}` ingests live CQL docs; `{query}` generates CQL grounded only in those docs (never invented), with endpoint mapping + read/write classification |
| **Cyware API provider** | `GET/POST /api/support/cyware` | Cyware as one configurable provider (auth from env); preview/flow-resolve/execute; reads run, writes approval-gated |
| **RAG source manager** | `GET/POST /api/support/sources` | List/delete indexed namespaces; add past resolutions / runbooks / error logs to the knowledge base |
| **Approvals** | `GET/POST /api/support/approvals` | Queue of write actions with safety class + redacted preview; approve & run or reject |
| **Audit** | `GET /api/support/audit` | Recent actions with safety class + provider |

**Safety classes** (from `safety.ts`): `READ_ONLY`, `WRITE_LOW_RISK`,
`WRITE_MEDIUM_RISK`, `WRITE_HIGH_RISK`, `DESTRUCTIVE` (blocked by default),
`AUTH_OR_PERMISSION_CHANGE`, `BULK_OPERATION`. Only `READ_ONLY` runs without
approval; `DESTRUCTIVE` is blocked unless explicitly opted in.

**RAG source types** now span: code, docs, GitHub issues/PRs, Jira tickets,
commits, OpenAPI, Postman, Cyware docs, CQL docs, resolutions, runbooks, and
error logs — each chunk carries normalized metadata (`source_name`,
`endpoint_path`, `http_method`, `jira_ticket_id`, `github_issue_id`,
`created_at`, …) and every answer cites its sources.

---

## Connecting real services

All credentials live in `.env.local` (gitignored). See `.env.example`.

### GitHub
```bash
GITHUB_TOKEN=ghp_xxx            # repo read scope (+ write only if you want comment posting)
DEFAULT_GITHUB_REPO=owner/name  # used when the UI repo field is blank
```
With a token, the app ingests real files, README, commits, issues, and PRs, and
can post real comments (approval-gated).

### Jira
```bash
JIRA_BASE_URL=https://your.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=xxx
JIRA_PROJECT_KEY=PROJ          # optional: scopes search + default create project
```
Jira tickets (`ABC-123`) are then searchable, ingestible, and commentable, and
the connector can transition, link, and create issues (all approval-gated).
Verify the live connection at `GET /api/support/health`.

### Cyware Intel Exchange (CTIX)
```bash
CYWARE_BASE_URL=https://your-tenant/ctixapi
CYWARE_API_KEY=xxx             # or CYWARE_CLIENT_ID + CYWARE_CLIENT_SECRET
CYWARE_AUTH_TYPE=api_key       # bearer | basic | api_key
```
Cyware is one configurable API provider — import its OpenAPI/Postman spec via
`POST /api/support/api-import` so endpoints become RAG-retrievable and the high-
level flows (search indicators, lookup object, create/add tag, relationships)
resolve to real endpoints.

### MCP servers (remote HTTP/SSE)
```bash
MCP_SERVER_CONFIG_JSON=[{"name":"intel","url":"https://mcp.example.com","transport":"http","headers":{"Authorization":"Bearer xxx"},"allowWrites":false}]
```
Tools are discovered automatically; write tools require approval. (Local stdio
servers are out of scope for serverless deployments.)

### Pinecone (durable RAG)
```bash
PINECONE_API_KEY=xxx
PINECONE_INDEX_NAME=support-agent-rag
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
```
The index is auto-created on first ingest. Without a key, an in-memory cosine
store is used (durable only within a running process).

### OpenAI
```bash
OPENAI_API_KEY=sk-xxx
```
Enables real embeddings + LLM reasoning. Without it, local hashing embeddings +
the heuristic engine keep everything working.

---

## Common workflows

**Ingest a repo into the RAG index**
- UI: paste `owner/name` → **Ingest repo into RAG index**.
- CLI: `npm run ingest -- owner/name` (best with Pinecone configured).

**Test with a GitHub issue**
- Put `gh#123` (or a Jira key `ABC-456`) in the *reference* field, optionally add
  a description, and **Analyze**. The agent pulls the live issue + comments,
  retrieves related code, and produces the triage report. Use **Generate & post**
  to reply (a confirmation modal appears first).

**Run the 8 example test cases**
- UI: **Test mode → Run all tests** (env var bug, missing dependency, API change,
  already-fixed, duplicate, feature request, low-info, escalation).
- CLI: `npm test` runs the same cases offline.

---

## Safety model

- **One gated path for all writes.** Every state-changing action (Jira/GitHub
  comment, transition, link, create; Cyware/API call; MCP write tool) is
  classified by `safety.ts`, queued for **explicit approval**, executed by a
  single executor, and audited with its safety class + redacted payload.
- **Destructive blocked by default.** `DELETE`/destructive actions are not
  executable unless explicitly opted in; reads run without approval.
- **Kill switch.** `SUPPORT_AGENT_READ_ONLY=true` blocks all writes regardless.
- **No secret leakage.** Secrets are read from env only, masked in `/health`,
  and scrubbed from logs/previews/audit by `redact.ts` (layered exact-match +
  pattern redaction).
- **Resilience.** OpenAI, Pinecone, and connector calls retry with exponential
  backoff + jitter on 429/5xx/network errors (`retry.ts`).
- **SSRF protection.** User-supplied hosts (e.g. Jira base URL) go through a DNS
  + private-range guard with timeout and response-size caps (`src/lib/ssrf.ts`).
- **Grounded output.** Both heuristic and LLM paths cite retrieved chunks; the
  LLM is constrained to the retrieved file list and hallucinated patches are
  dropped.
- **Audit log.** Every analyze/ingest/write is appended to `.audit-log.jsonl`
  (gitignored) and surfaced at `/api/support/audit`.

---

## Project layout

```
src/
  app/
    page.tsx                      # mounts <SupportAgent/>
    layout.tsx, globals.css
    api/support/
      status/ ingest/ analyze/ tickets/ comment/ patch/ write/ test/ audit/
  components/
    SupportAgent.tsx              # top-level client orchestrator
    DiagnosisView.tsx CitationsPanel.tsx ResponsesPanel.tsx
    ConfirmModal.tsx TestMode.tsx ui.tsx
  lib/
    ssrf.ts
    support/
      types.ts config.ts openai.ts pinecone.ts embed.ts vector-store.ts
      languages.ts chunk.ts ingest.ts retrieve.ts classify.ts analyze.ts
      patch.ts comment.ts audit.ts
      connectors/ index.ts github.ts jira.ts mock.ts mock-data.ts
      eval/ test-cases.ts run.ts
      __tests__/ chunk · connectors · classify · retrieve · comment · eval
scripts/ingest-cli.ts
```

---

## Limitations & next improvements

**Current limitations**
- The in-memory vector store + approval/spec/MCP registries are process-local;
  set Pinecone (and, later, `DATABASE_URL`/`REDIS_URL`) for durable,
  cross-instance state (serverless resets memory between cold starts).
- **Secrets are env-first.** The UI shows masked status but does not yet accept
  per-session secret entry; set credentials in `.env.local` / your host.
- MCP support includes **local stdio stubs** (`mcp/servers/`) + **remote HTTP/SSE** (`MCP_SERVER_CONFIG_JSON`). Copy `.cursor/mcp.json.example` for Cursor integration.
- CQL generation depends on the live docs page being fetchable; if it is a
  JS-rendered SPA returning thin HTML, generation honestly reports missing
  syntax instead of guessing.
- The agent **suggests** code patches but never applies them; no PR creation.
- GitHub ingestion caps at ~400 files / 200 KB each; Jira ingestion uses a broad
  JQL seed, not a full project crawl.
- Postgres/Redis adapters are scaffolded via env but not yet wired (in-memory
  is the active backend).

**Next improvements**
- Incremental/webhook-driven re-indexing on push and issue events.
- PR-creation connector (open a branch + PR for an approved patch).
- Reranking + per-source weighting in retrieval; configurable top-K.
- Multi-repo / org-wide ingestion and a repo picker.
- Conversation memory for multi-turn clarification with the client.
- Auth + per-team workspaces and a richer audit viewer UI.
```
