"use client";

import { useState } from "react";
import { SearchBox } from "@/components/SearchBox";
import { ResultsTable } from "@/components/ResultsTable";
import { DetailsPanel } from "@/components/DetailsPanel";

export default function Home() {
  const [query, setQuery] = useState("");
  const [cql, setCql] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set("q", query);
      if (cql) qs.set("cql", cql);
      const res = await fetch(`/api/indicators/search?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      const data = json.data as { results?: Record<string, unknown>[] } | Record<string, unknown>[];
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setRows(list as Record<string, unknown>[]);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container dashboard-shell" style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1>{{APP_TITLE}}</h1>
      <p style={{ color: "#8b949e", marginBottom: 16 }}>
        {{PRODUCT}} indicator search — credentials stay server-side via <code>/api/indicators/search</code>
      </p>
      <SearchBox
        query={query}
        cql={cql}
        onQueryChange={setQuery}
        onCqlChange={setCql}
        onSearch={() => void runSearch()}
        loading={loading}
      />
      {error && <p style={{ color: "#f85149" }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginTop: 16 }}>
        <ResultsTable rows={rows} onSelect={setSelected} selectedId={String(selected?.id ?? "")} />
        <DetailsPanel item={selected} />
      </div>
    </main>
  );
}
