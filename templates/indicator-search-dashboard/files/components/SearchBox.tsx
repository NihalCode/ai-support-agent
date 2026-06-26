"use client";

export function SearchBox({
  query,
  cql,
  onQueryChange,
  onCqlChange,
  onSearch,
  loading,
}: {
  query: string;
  cql: string;
  onQueryChange: (v: string) => void;
  onCqlChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        placeholder="Search indicators (IP, domain, hash…)"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        style={inputStyle}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
      />
      <input
        placeholder="Optional CQL filter"
        value={cql}
        onChange={(e) => onCqlChange(e.target.value)}
        style={inputStyle}
      />
      <button type="button" onClick={onSearch} disabled={loading} style={btnStyle}>
        {loading ? "Searching…" : "Search"}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #30363d",
  background: "#161b22",
  color: "#e6edf3",
};

const btnStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#238636",
  color: "#fff",
  cursor: "pointer",
  width: "fit-content",
};
