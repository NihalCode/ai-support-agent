"use client";

export function DetailsPanel({ item }: { item: Record<string, unknown> | null }) {
  if (!item) {
    return (
      <aside style={{ border: "1px solid #30363d", borderRadius: 8, padding: 12, color: "#8b949e" }}>
        Select a row to view details.
      </aside>
    );
  }

  return (
    <aside style={{ border: "1px solid #30363d", borderRadius: 8, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Details</h3>
      <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 400 }}>{JSON.stringify(item, null, 2)}</pre>
    </aside>
  );
}
