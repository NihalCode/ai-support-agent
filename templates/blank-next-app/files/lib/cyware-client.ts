export async function searchIndicators(params: { q?: string; cql?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.cql) qs.set("cql", params.cql);
  if (params.limit) qs.set("limit", String(params.limit));

  const res = await fetch(`/api/indicators/search?${qs}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false as const, error: (err as { error?: string }).error ?? res.statusText };
  }
  const data = await res.json();
  return { ok: true as const, data };
}
