# AI Support Agent — Agent Guide

Authoritative reference for any AI coding agent working on this repo. This is a
**standalone** project (not related to any docs site).

## What it is
A Next.js 16 + TypeScript app that diagnoses client-reported GitHub/Jira issues
with repo-aware RAG and emits a structured A–K triage report. Runs fully on
mocks with no credentials; upgrades to live GitHub/Jira/OpenAI/Pinecone when env
vars are present.

## Commands
```bash
npm run dev        # dev server
npm test           # vitest (offline)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint flat config
npm run build      # next build
npm run ingest -- owner/name   # CLI ingest (uses --conditions=react-server)
```
Run `npm test && npm run typecheck && npm run build` before committing.

## Architecture rules
- **Server-only code** (anything reading secrets / calling external APIs) imports
  `"server-only"` and lives under `src/lib/support/`. Tests stub `server-only`
  via the Vitest alias in `vitest.config.ts`.
- **Every integration has a mock + automatic fallback.** Never hard-require a
  credential. The connector factory (`connectors/index.ts`) decides live vs mock.
- **RAG is the source of truth.** Analysis must cite retrieved chunks; the LLM is
  constrained to the retrieved file list and hallucinated paths/patches are
  dropped (`analyze.ts`, `patch.ts`).
- **Read-only by default.** The only write is posting a comment, gated by
  `approved: true` + the confirm modal + `SUPPORT_AGENT_READ_ONLY`. All actions
  are audited (`audit.ts`).
- **Outbound user-host calls** go through `safeFetch` / `assertPublicHost`
  (`src/lib/ssrf.ts`).

## Where things live
- Types: `src/lib/support/types.ts`
- Config/auth: `src/lib/support/config.ts`
- Retrieval/embeddings/store: `retrieve.ts` `embed.ts` `vector-store.ts` `pinecone.ts`
- Chunking: `chunk.ts` + `languages.ts`
- Reasoning: `classify.ts` (deterministic) + `analyze.ts` (LLM refine)
- Connectors: `connectors/{github,jira,mock,index}.ts`
- Test cases: `eval/test-cases.ts` + `eval/run.ts`
- API: `src/app/api/support/*`
- UI: `src/components/*`

## When changing the heuristic engine
Run `npm test` — the 8 example cases in `eval/run.ts` assert category +
fixability + key mentions in deterministic (no-LLM) mode. Keep them green.
