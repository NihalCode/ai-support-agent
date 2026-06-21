"use client";

import { useEffect, useState } from "react";
import { Card, Button, Badge, Spinner } from "./ui";

/**
 * Integrations workspace: connector health, API/Postman import, MCP servers,
 * CQL docs + generation, RAG source manager, approval queue, and audit log.
 * Each section drives its dedicated /api/support/* route. Credentials are
 * env-configured (server-side, redacted); this UI never stores secrets.
 */

const SUBTABS = [
  ["health", "Connectors"],
  ["cyware", "Cyware APIs"],
  ["api", "API & Postman"],
  ["mcp", "MCP servers"],
  ["cql", "Cyware CQL"],
  ["rag", "RAG sources"],
  ["approvals", "Approvals"],
  ["audit", "Audit log"],
] as const;

type SubTab = (typeof SUBTABS)[number][0];

export function IntegrationsPanel() {
  const [tab, setTab] = useState<SubTab>("health");
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SUBTABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              background: tab === id ? "var(--accent)" : "var(--surface-2)",
              color: tab === id ? "#fff" : "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "health" && <HealthSection />}
      {tab === "cyware" && <CywareApisSection />}
      {tab === "api" && <ApiImportSection />}
      {tab === "mcp" && <McpSection />}
      {tab === "cql" && <CqlSection />}
      {tab === "rag" && <RagSection />}
      {tab === "approvals" && <ApprovalsSection />}
      {tab === "audit" && <AuditSection />}
    </div>
  );
}

/* ------------------------------- Connectors ------------------------------- */

interface HealthData {
  appEnv: string;
  readOnly: boolean;
  secrets: Record<string, string>;
  connectors: { name: string; configured: boolean; mode: string; ok?: boolean; detail?: string }[];
}

function HealthSection() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    fetch("/api/support/health").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  };
  useEffect(() => {
    fetch("/api/support/health").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, []);
  return (
    <Card title="Connector health" right={<Button variant="ghost" onClick={load}>{loading ? "…" : "Refresh"}</Button>}>
      {!data ? (
        <Spinner label="Checking…" />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge label={`env: ${data.appEnv}`} />
            <Badge label={data.readOnly ? "read-only" : "writes: approval-gated"} />
          </div>
          {data.connectors.map((c) => (
            <div key={c.name} style={rowStyle}>
              <span style={{ fontWeight: 600, width: 90 }}>{c.name}</span>
              <Badge label={c.mode} />
              <span style={{ color: c.ok === false ? "var(--red)" : "var(--muted)", fontSize: 13 }}>
                {c.detail ?? (c.configured ? "configured" : "not configured")}
              </span>
            </div>
          ))}
          <p style={mutedNote}>
            Credentials are read from server env vars and shown masked only. Jira: <code>JIRA_BASE_URL</code>,{" "}
            <code>JIRA_EMAIL</code>, <code>JIRA_API_TOKEN</code>. Cyware products: <code>CYWARE_*</code> (CTIX),{" "}
            <code>CSAP_*</code>, <code>CFTR_*</code>, <code>ORCHESTRATE_*</code>. MCP: <code>MCP_SERVER_CONFIG_JSON</code>.
          </p>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------- Cyware APIs -------------------------------- */

interface CywareProvider {
  id: string;
  name: string;
  kind: string;
  configured: boolean;
  endpoints: number;
  specId?: string;
  docsSiteUrl?: string;
  baseUrl?: string | null;
}

function CywareApisSection() {
  const [providers, setProviders] = useState<CywareProvider[]>([]);
  const [specId, setSpecId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<unknown>(null);

  const load = () => {
    fetch("/api/support/cyware")
      .then((r) => r.json())
      .then((d) => setProviders((d.providers ?? []).filter((p: CywareProvider) => p.kind === "cyware")));
  };

  useEffect(() => {
    load();
  }, []);

  async function importProduct(product: string) {
    setBusy(product);
    setOut(null);
    try {
      const res = await fetch("/api/support/api-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cywareProduct: product, index: true }),
      });
      setOut(await res.json());
      load();
    } finally {
      setBusy(null);
    }
  }

  async function previewCall() {
    if (!specId) return;
    const res = await fetch("/api/support/api-execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "preview", specId, search: search || undefined }),
    });
    setOut(await res.json());
  }

  return (
    <Card title="Cyware product APIs" right={<Button variant="ghost" onClick={load}>Refresh</Button>}>
      <p style={mutedNote}>
        Import API docs for CTIX, CSAP, CFTR, and Orchestrate, then preview/execute endpoints. Set product credentials in env before executing live calls.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {providers.map((p) => (
          <div key={p.id} style={{ ...rowStyle, border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {p.endpoints} endpoints · spec: {p.specId ?? "not imported"}
              </div>
              {p.docsSiteUrl && (
                <a href={p.docsSiteUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                  Docs ↗
                </a>
              )}
            </div>
            <Badge label={p.configured ? "credentials set" : "no credentials"} />
            <Button onClick={() => importProduct(p.id)} disabled={busy === p.id}>
              {busy === p.id ? "Importing…" : "Import docs"}
            </Button>
          </div>
        ))}
      </div>
      <label style={{ ...labelStyle, marginTop: 16 }}>Preview an API call (any imported spec)</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={specId} onChange={(e) => setSpecId(e.target.value)} placeholder="spec id e.g. cyware-cftr-api" style={{ ...inputStyle, width: 220 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="describe endpoint e.g. list incidents" style={{ ...inputStyle, flex: 1 }} />
        <Button onClick={previewCall} disabled={!specId}>Preview</Button>
      </div>
      {out != null && <Pre data={out} />}
    </Card>
  );
}

/* ----------------------------- API & Postman ------------------------------ */

function ApiImportSection() {
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [index, setIndex] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [specs, setSpecs] = useState<{ id: string; name: string; endpoints: number; sourceKind: string }[]>([]);

  const loadSpecs = () => {
    fetch("/api/support/api-import")
      .then((r) => r.json())
      .then((d) => setSpecs(d.specs ?? []));
  };

  useEffect(() => {
    loadSpecs();
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContent(await file.text());
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/support/api-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content || undefined, url: url || undefined, name: name || undefined, index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      loadSpecs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Import API spec / Postman collection">
      <p style={mutedNote}>
        OpenAPI/Swagger, Postman, cURL, markdown, Cyware Theneo doc URLs, or CFTR Postman Documenter URLs — auto-detected.
      </p>
      {specs.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Imported specs ({specs.length})</label>
          {specs.map((s) => (
            <div key={s.id} style={rowStyle}>
              <code style={{ fontSize: 12 }}>{s.id}</code>
              <span style={{ fontSize: 13 }}>{s.name}</span>
              <Badge label={`${s.endpoints} ep`} />
              <Badge label={s.sourceKind} />
            </div>
          ))}
        </div>
      )}
      <label style={labelStyle}>Upload a file</label>
      <input type="file" accept=".json,.yaml,.yml,.txt,.md" onChange={onFile} style={{ fontSize: 13 }} />
      <label style={{ ...labelStyle, marginTop: 12 }}>…or paste a public spec URL</label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/openapi.json" style={inputStyle} />
      <label style={{ ...labelStyle, marginTop: 12 }}>…or paste content</label>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Paste OpenAPI / Postman / cURL here" style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--mono, monospace)" }} />
      <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" style={{ ...inputStyle, width: 200 }} />
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={index} onChange={(e) => setIndex(e.target.checked)} /> Index into RAG
        </label>
        <Button variant="primary" onClick={submit} disabled={busy || (!content && !url)}>{busy ? "Importing…" : "Import"}</Button>
        {busy && <Spinner />}
      </div>
      {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</p>}
      {result != null && <Pre data={result} />}
    </Card>
  );
}

/* -------------------------------- MCP ------------------------------------- */

interface McpData {
  statuses: { name: string; url: string; transport: string; connected: boolean; toolCount: number; error?: string }[];
  tools: { server: string; name: string; description?: string; isWrite: boolean }[];
}

function McpSection() {
  const [data, setData] = useState<McpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [server, setServer] = useState("");
  const [tool, setTool] = useState("");
  const [args, setArgs] = useState("{}");
  const [out, setOut] = useState<unknown>(null);
  const load = () => {
    setLoading(true);
    fetch("/api/support/mcp").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  };
  useEffect(() => {
    fetch("/api/support/mcp").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  async function call(intent: "preview" | "execute") {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = args.trim() ? JSON.parse(args) : {};
    } catch {
      setOut({ error: "Args must be valid JSON" });
      return;
    }
    const res = await fetch("/api/support/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, server, tool, args: parsedArgs, approved: intent === "execute" }),
    });
    setOut(await res.json());
  }

  return (
    <Card title="MCP servers" right={<Button variant="ghost" onClick={load}>{loading ? "…" : "Refresh"}</Button>}>
      {!data ? (
        <Spinner label="Discovering…" />
      ) : data.statuses.length === 0 ? (
        <p style={mutedNote}>No MCP servers configured. Set <code>MCP_SERVER_CONFIG_JSON</code> (remote HTTP/SSE servers).</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {data.statuses.map((s) => (
            <div key={s.name} style={rowStyle}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <Badge label={s.transport} />
              <Badge label={s.connected ? `${s.toolCount} tools` : "offline"} />
              {s.error && <span style={{ color: "var(--red)", fontSize: 12 }}>{s.error}</span>}
            </div>
          ))}
          <label style={{ ...labelStyle, marginTop: 8 }}>Try a tool call (preview is always safe)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="server" style={{ ...inputStyle, width: 140 }} />
            <input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="tool name" style={{ ...inputStyle, width: 180 }} />
          </div>
          <textarea value={args} onChange={(e) => setArgs(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => call("preview")} disabled={!server || !tool}>Preview</Button>
            <Button variant="danger" onClick={() => call("execute")} disabled={!server || !tool}>Execute (approve)</Button>
          </div>
          {data.tools.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>{data.tools.length} discovered tools</summary>
              <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                {data.tools.map((t) => (
                  <div key={`${t.server}:${t.name}`} style={{ fontSize: 12 }}>
                    <code>{t.server}:{t.name}</code> <Badge label={t.isWrite ? "write" : "read"} /> <span style={{ color: "var(--muted)" }}>{t.description}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {out != null && <Pre data={out} />}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------- CQL ------------------------------------- */

function CqlSection() {
  const [query, setQuery] = useState("");
  const [docUrl, setDocUrl] = useState("https://techdocs.cyware.com/ctix/en/cyware-query-language--cql-.html");
  const [docContent, setDocContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function index() {
    setIndexing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/support/cql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "index", url: docUrl || undefined, content: docContent || undefined }),
      });
      const data = await res.json();
      setMsg(res.ok ? `Indexed ${data.result.chunks} CQL doc chunks (${data.result.fetchedChars} chars).${data.result.warnings?.length ? " ⚠ " + data.result.warnings.join("; ") : ""}` : (data.error ?? "Index failed"));
    } finally {
      setIndexing(false);
    }
  }

  async function generate() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/support/cql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Cyware Query Language (CQL)">
      <p style={mutedNote}>
        Index CQL docs from{" "}
        <a href="https://techdocs.cyware.com/ctix/en/cyware-query-language--cql-.html" target="_blank" rel="noreferrer">
          techdocs.cyware.com
        </a>
        , then generate CQL grounded strictly in them (no invented syntax).
      </p>
      <label style={labelStyle}>Doc URL (optional if pasting content)</label>
      <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} style={inputStyle} />
      <label style={{ ...labelStyle, marginTop: 8 }}>Or paste CQL doc text directly</label>
      <textarea value={docContent} onChange={(e) => setDocContent(e.target.value)} rows={3} placeholder="Paste CQL documentation if the URL is JS-rendered" style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace" }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        <Button onClick={index} disabled={indexing}>{indexing ? "Indexing docs…" : "Index CQL docs"}</Button>
        {indexing && <Spinner />}
      </div>
      {msg && <p style={{ color: "var(--green)", fontSize: 13, marginTop: 8 }}>{msg}</p>}
      <label style={{ ...labelStyle, marginTop: 12 }}>Describe what you want to find</label>
      <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={2} placeholder="Find malicious indicators from the last 30 days" style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ marginTop: 10 }}>
        <Button variant="primary" onClick={generate} disabled={busy || !query.trim()}>{busy ? "Generating…" : "Generate CQL"}</Button>
      </div>
      {result != null && <Pre data={result} />}
    </Card>
  );
}

/* ------------------------------ RAG sources ------------------------------- */

function RagSection() {
  const [data, setData] = useState<{ vectorStore: string; sources: { namespace: string; vectorCount: number; category: string }[] } | null>(null);
  const [kind, setKind] = useState<"resolution" | "runbook" | "error-log">("resolution");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const load = () => fetch("/api/support/sources").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  async function add() {
    await fetch("/api/support/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "add-knowledge", kind, title, text }),
    });
    setTitle("");
    setText("");
    load();
  }
  async function del(namespace: string) {
    await fetch("/api/support/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "delete", namespace }),
    });
    load();
  }

  return (
    <Card title="RAG sources" right={<Button variant="ghost" onClick={load}>Refresh</Button>}>
      {!data ? (
        <Spinner label="Loading…" />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <Badge label={`store: ${data.vectorStore}`} />
          {data.sources.length === 0 && <p style={mutedNote}>No indexed sources yet.</p>}
          {data.sources.map((s) => (
            <div key={s.namespace} style={rowStyle}>
              <Badge label={s.category} />
              <code style={{ fontSize: 12, flex: 1 }}>{s.namespace}</code>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.vectorCount}</span>
              <Button variant="ghost" onClick={() => del(s.namespace)}>Delete</Button>
            </div>
          ))}
          <label style={{ ...labelStyle, marginTop: 8 }}>Add knowledge (past resolution / runbook / error log)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={{ ...inputStyle, width: 150 }}>
              <option value="resolution">resolution</option>
              <option value="runbook">runbook</option>
              <option value="error-log">error-log</option>
            </select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ ...inputStyle, flex: 1 }} />
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Content" style={{ ...inputStyle, resize: "vertical" }} />
          <Button onClick={add} disabled={!title.trim() || !text.trim()}>Index knowledge</Button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ Approvals --------------------------------- */

interface Approval {
  id: string;
  status: string;
  preview: string;
  safety: { safetyClass: string; requiresApproval: boolean; blocked: boolean; reason: string };
  result?: string;
}

function ApprovalsSection() {
  const [items, setItems] = useState<Approval[]>([]);
  const load = () => fetch("/api/support/approvals").then((r) => r.json()).then((d) => setItems(d.approvals ?? []));
  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, intent: "approve" | "reject") {
    await fetch("/api/support/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, id }),
    });
    load();
  }

  return (
    <Card title="Approval queue" right={<Button variant="ghost" onClick={load}>Refresh</Button>}>
      {items.length === 0 ? (
        <p style={mutedNote}>No approval requests. Write actions queued by the agent appear here.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((a) => (
            <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <Badge label={a.status} />
                <Badge label={a.safety.safetyClass} />
                {a.safety.blocked && <Badge label="blocked" />}
              </div>
              <pre style={preStyle}>{a.preview}</pre>
              {a.result && <p style={{ fontSize: 12, color: "var(--muted)" }}>{a.result}</p>}
              {a.status === "pending" && !a.safety.blocked && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Button variant="primary" onClick={() => decide(a.id, "approve")}>Approve & run</Button>
                  <Button variant="ghost" onClick={() => decide(a.id, "reject")}>Reject</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------- Audit ----------------------------------- */

function AuditSection() {
  const [entries, setEntries] = useState<{ timestamp: string; action: string; target?: string; approved: boolean; safetyClass?: string; details?: string }[]>([]);
  const load = () => fetch("/api/support/audit").then((r) => r.json()).then((d) => setEntries(d.entries ?? []));
  useEffect(() => {
    load();
  }, []);
  return (
    <Card title="Audit log" right={<Button variant="ghost" onClick={load}>Refresh</Button>}>
      {entries.length === 0 ? (
        <p style={mutedNote}>No audited actions yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6, maxHeight: 420, overflow: "auto" }}>
          {[...entries].reverse().map((e, i) => (
            <div key={i} style={{ fontSize: 12, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
              <span style={{ color: "var(--muted)" }}>{e.timestamp.slice(0, 19).replace("T", " ")}</span>{" "}
              <strong>{e.action}</strong> {e.target && <code>{e.target}</code>}{" "}
              <Badge label={e.approved ? "approved" : "blocked/denied"} />
              {e.safetyClass && <Badge label={e.safetyClass} />}
              {e.details && <div style={{ color: "var(--muted)" }}>{e.details}</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- helpers ---------------------------------- */

function Pre({ data }: { data: unknown }) {
  return <pre style={preStyle}>{typeof data === "string" ? data : JSON.stringify(data, null, 2)}</pre>;
}

const rowStyle: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const mutedNote: React.CSSProperties = { color: "var(--muted)", fontSize: 13, marginTop: 4 };
const preStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  overflow: "auto",
  maxHeight: 360,
  whiteSpace: "pre-wrap",
  marginTop: 10,
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 11px",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "inherit",
};
