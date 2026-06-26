# Build App Security

1. **Never commit `.env.local`** — gitignore in generated apps; agent only writes `.env.local.example`.
2. **Server-side only** — Cyware Access ID, Secret Key, and API tokens stay in API routes.
3. **No `NEXT_PUBLIC_` secrets** — env snippet generator enforces this.
4. **Approval gates** — file writes, deploy, and git commit require user approval.
5. **Redaction** — build/deploy logs pass through `redact()` before display.
6. **SSRF** — generated apps should call Cyware from server routes; the main IDE `/api/run` proxy rules still apply to the support agent itself.
