import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const base = process.env.CYWARE_BASE_URL;
  const accessId = process.env.CYWARE_ACCESS_ID;
  const secret = process.env.CYWARE_SECRET_KEY;

  if (!base || !accessId || !secret) {
    return NextResponse.json(
      { error: "Server is missing CYWARE_BASE_URL, CYWARE_ACCESS_ID, or CYWARE_SECRET_KEY" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const cql = url.searchParams.get("cql") ?? "";
  const limit = url.searchParams.get("limit") ?? "25";

  // CTIX Open API auth — server-side only
  const expires = Math.floor(Date.now() / 1000) + 300;
  const crypto = await import("node:crypto");
  const path = "{{SEARCH_ENDPOINT}}";
  const sig = crypto.createHmac("sha1", secret).update(`${path}?AccessID=${accessId}&Expires=${expires}`).digest("base64");
  const target = new URL(path, base);
  target.searchParams.set("AccessID", accessId);
  target.searchParams.set("Expires", String(expires));
  target.searchParams.set("Signature", sig);
  if (q) target.searchParams.set("q", q);
  if (cql) target.searchParams.set("cql", cql);
  target.searchParams.set("page_size", limit);

  try {
    const res = await fetch(target.toString(), { method: "{{SEARCH_METHOD}}", cache: "no-store" });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* non-json */
    }
    return NextResponse.json({ ok: res.ok, status: res.status, data: body });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upstream request failed" },
      { status: 502 }
    );
  }
}
