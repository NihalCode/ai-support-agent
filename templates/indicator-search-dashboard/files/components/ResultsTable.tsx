"use client";

export function ResultsTable({
  rows,
  onSelect,
  selectedId,
}: {
  rows: Record<string, unknown>[];
  onSelect: (row: Record<string, unknown>) => void;
  selectedId: string;
}) {
  if (rows.length === 0) {
    return <p style={{ color: "#8b949e" }}>Run a search to see results.</p>;
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #30363d", textAlign: "left" }}>
          <th style={{ padding: 8 }}>Value</th>
          <th style={{ padding: 8 }}>Type</th>
          <th style={{ padding: 8 }}>ID</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const id = String(row.id ?? i);
          const active = id === selectedId;
          return (
            <tr
              key={id}
              onClick={() => onSelect(row)}
              style={{
                borderBottom: "1px solid #21262d",
                cursor: "pointer",
                background: active ? "#161b22" : "transparent",
              }}
            >
              <td style={{ padding: 8 }}>{String(row.value ?? row.indicator ?? "—")}</td>
              <td style={{ padding: 8 }}>{String(row.type ?? "—")}</td>
              <td style={{ padding: 8, color: "#8b949e" }}>{id}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
