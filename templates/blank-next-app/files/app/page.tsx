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
    <main className="container" style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1>{{APP_TITLE}}</h1>
      <p style={{ color: "#8b949e" }}>{{PRODUCT}} integration — {status}</p>
      <p style={{ fontSize: 14 }}>
        Endpoint: {{SEARCH_METHOD}} {{SEARCH_ENDPOINT}}
      </p>
    </main>
  );
}
