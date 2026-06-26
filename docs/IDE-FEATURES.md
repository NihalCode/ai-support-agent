# AI Support IDE — Feature Guide

## Split editor

- **Split right:** Command palette → *Split Editor Right*, or `Ctrl+\`
- **Split down:** Command palette → *Split Editor Down*, or `Ctrl+Alt+\`
- **Move tab:** Right-click tab → moves to other group (when split)
- **Compare:** Search result → *Compare*, or command palette *Compare with Active*
- **Join:** Command palette → *Join All Editor Groups*
- Layout persists in `localStorage` (`ai-support-ide-layout-v2`)

## Semantic search

- Activity bar → **Search**
- Modes: **Keyword**, **Semantic**, **Hybrid**
- Filters: source type, product, spec, method
- API: `POST /api/support/search` with `{ query, mode, filters, topK }`
- Without Pinecone/OpenAI: semantic/hybrid show degraded banner; keyword still works
- Test mode (`TEST_MODE=true`): deterministic mock results

## Streaming chat

- Right panel streams via `POST /api/support/agent/chat/stream` (SSE)
- Shows tool call cards (running → success/error)
- **Stop** cancels via `AbortController`
- Falls back to `POST /api/support/investigate` if stream fails
- No hidden chain-of-thought — only user-visible text and tool summaries

## Terminal (allowlisted runner)

- Bottom panel → **Terminal**
- Allowed: `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm run mcp:check`, `npm run dev`
- API: `GET /api/support/terminal/commands`, `POST /api/support/terminal/run`
- Secrets redacted; `.env` and destructive commands blocked
- `TERMINAL_DEVELOPER_MODE=true` allows other commands with approval

## Investigation object

- Investigation tab includes **InvestigationObjectPanel** (pinned evidence, hypotheses, timeline)
- API: `GET/POST/PATCH /api/support/investigations`
- Pin from search results or tool cards
- Accept/reject hypotheses; accepted → root cause
- Export: `GET /api/support/investigations?id=…&format=markdown`

## E2E testing

```bash
npm run test:e2e          # headless (build + start with TEST_MODE=true)
npm run test:e2e:ui       # Playwright UI
npm run test:e2e:headed   # headed browser
```

Set `TEST_MODE=true` and `NEXT_PUBLIC_TEST_MODE=true` for deterministic mocks (search, chat stream, terminal).

## Test mode mocks

| Area | Behavior |
|------|----------|
| Search semantic | Mock CTIX/Jira/CQL hits |
| Chat stream | Simulated tokens + tool card |
| Terminal | Instant mock output |
| Investigations | Auto-seed optional |
