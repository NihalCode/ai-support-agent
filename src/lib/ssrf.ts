import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for any outbound request whose host is influenced by user input
 * (e.g. a custom Jira base URL). Resolves the hostname and rejects private,
 * loopback, link-local, and cloud-metadata ranges.
 */

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
  return false;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".local")
  ) {
    throw new Error(`Refusing to call non-public host: ${hostname}`);
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`Refusing to call private IP: ${hostname}`);
    }
    return;
  }
  let resolved: string[] = [];
  try {
    const results = await dns.lookup(hostname, { all: true });
    resolved = results.map((r) => r.address);
  } catch {
    throw new Error(`Could not resolve host: ${hostname}`);
  }
  for (const ip of resolved) {
    if (isPrivateIp(ip)) {
      throw new Error(`Host ${hostname} resolves to a private IP (${ip})`);
    }
  }
}

/** Fetch with an SSRF check + timeout + response size cap. */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<{ status: number; ok: boolean; text: string; headers: Headers }> {
  const { timeoutMs = 20_000, maxBytes = 5_000_000 } = opts;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  await assertPublicHost(parsed.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { status: res.status, ok: res.ok, text, headers: res.headers };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > maxBytes) {
          controller.abort();
          throw new Error("Response exceeded size cap");
        }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    return { status: res.status, ok: res.ok, text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}
