import { searchIndicators } from "@/lib/cyware-client";

export default async function Home() {
  let status = "Configure CYWARE_* env vars in .env.local";
  try {
    const r = await searchIndicators({ q: "", limit: 1 });
    status = r.ok ? "Connected (server-side)" : `API error: ${r.error}`;
  } catch {
    /* credentials missing */
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-hero">
        <h1 className="dashboard-title">{{APP_TITLE}}</h1>
        <p className="dashboard-subtitle">{{APP_SUBTITLE}}</p>
      </header>
      <p style={{ fontSize: 14, color: "var(--muted)" }}>
        {status} · Endpoint: {{SEARCH_METHOD}} {{SEARCH_ENDPOINT}}
      </p>
    </main>
  );
}
