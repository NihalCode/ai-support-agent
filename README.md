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
| Connectors | GitHub REST v3 + Jira Cloud REST v3, both with **mock fallbacks** |
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

### Validate the build

```bash
npm test          # 30 unit + integration tests (offline)
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
      │ status · ingest · analyze · tickets · comment · patch · write(approval) · test    │
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
```
Jira tickets (`ABC-123`) are then searchable, ingestible, and commentable.

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

- **Read-only by default.** The only write is *posting a comment*; it requires
  `approved: true` (set only after the confirmation modal) and is fully audited.
- **Kill switch.** `SUPPORT_AGENT_READ_ONLY=true` blocks all writes regardless.
- **No secret leakage.** Secrets are read from env only and masked in `/status`.
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
- The in-memory vector store is process-local; use Pinecone for durable,
  cross-instance retrieval (serverless deployments reset memory between cold
  starts).
- GitHub ingestion caps at ~400 files / 200 KB each to stay within rate limits.
- The agent **suggests** code patches but never applies them; there's no PR
  creation yet.
- Jira ingestion uses a broad JQL seed, not full project crawl.

**Next improvements**
- Incremental/webhook-driven re-indexing on push and issue events.
- PR-creation connector (open a branch + PR for an approved patch).
- Reranking + per-source weighting in retrieval; configurable top-K.
- Multi-repo / org-wide ingestion and a repo picker.
- Conversation memory for multi-turn clarification with the client.
- Auth + per-team workspaces and a richer audit viewer UI.
```
