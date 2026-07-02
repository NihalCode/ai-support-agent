import { searchIndicators } from "@/lib/cyware-client";

export default async function Home() {
  let status = "Demo mode — configure CYWARE_* in .env.local for live data";
  try {
    const r = await searchIndicators({ q: "", limit: 1 });
    status = r.ok ? "Live API connected" : `API unavailable: ${r.error ?? "check credentials"}`;
  } catch {
    /* credentials missing — stay in demo mode */
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
