# Build App + Deploy

Build Cyware API applications from natural language inside the AI Support Investigation IDE.

## Quick start

1. Open **Build App** in the activity bar (🛠).
2. Describe your app, e.g.:

   ```text
   Build me a simple CTIX indicator search dashboard using Cyware APIs.
   It should have a search box, optional CQL filter, table results, and a details panel.
   Then prepare it for Vercel deployment.
   ```

3. Review the generated plan and file diffs.
4. Click **Approve & apply** to write files under `.data/build-apps/{id}/app/`.
5. Click **Run build** (mock in TEST_MODE).
6. Click **Deploy preview** — requires approval; returns a mock URL when `VERCEL_TOKEN` is unset.

## Templates

| Template | Use case |
|----------|----------|
| `indicator-search-dashboard` | CTIX indicator search + CQL + table + details |
| `cql-search-app` | CQL-focused search |
| `cyware-api-dashboard` | Generic API dashboard |
| `case-management-dashboard` | CSAP/CFTR cases |
| `orchestrate-workflow-dashboard` | Workflow status |
| `api-playground-app` | API explorer |
| `support-portal-app` | Customer portal |
| `blank-next-app` | Minimal starter |

Templates live in `templates/{id}/files/`. The indicator template merges with `blank-next-app` base files.

## Security

- Generated apps use **server-side API routes** only for Cyware credentials.
- The agent creates/updates **`.env.local.example`** only — never reads or writes your real `.env.local`.
- No secrets in frontend code or `NEXT_PUBLIC_*` env vars.
- Scaffold, deploy, and git commit require **explicit approval** via the approvals queue.

## Vercel setup

Set server-side env vars (not `NEXT_PUBLIC_`):

```env
VERCEL_TOKEN=your-vercel-token-here
VERCEL_ORG_ID=your-vercel-org-id-here
VERCEL_PROJECT_ID=your-vercel-project-id-here
```

Install Vercel CLI globally or use `npx vercel` for real deployments.

## Git workflow

After scaffold, approve a git commit action (when GitHub token is configured) or use mock mode in TEST_MODE.

## API

`GET /api/support/build-app` — list projects and templates  
`POST /api/support/build-app` — `{ action: "plan" | "apply" | "build" | "deploy" | "edit" }`

## Adding a template

1. Create `templates/my-template/manifest.json`
2. Add files under `templates/my-template/files/`
3. Register in `src/lib/support/build-app/templates.ts` `BUILT_IN` array
4. Add keyword routing in `classify-request.ts`

See also: [DEPLOYMENT.md](./DEPLOYMENT.md), [SECURITY-BUILD-APP.md](./SECURITY-BUILD-APP.md)
