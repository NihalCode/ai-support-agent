import { describe, it, expect, afterEach } from "vitest";
import { redact, redactDeep, redactHeaders } from "../redact";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("redact", () => {
  it("scrubs known secret values from config", () => {
    process.env.OPENAI_API_KEY = "sk-supersecretvalue1234567890";
    process.env.GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    const out = redact("token is sk-supersecretvalue1234567890 and gh ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(out).not.toContain("supersecretvalue");
    expect(out).not.toContain("ghp_abcdefghij");
  });

  it("scrubs provider key patterns even when not in config", () => {
    expect(redact("key sk-1234567890abcd")).toContain("«redacted»");
    expect(redact("pcsk_abcdEFGH1234_-zz")).toContain("«redacted»");
    expect(redact("ATATT3xFfGF0abcdEFGH==")).toContain("«redacted»");
  });

  it("redacts Authorization bearer/basic headers in text", () => {
    expect(redact('Authorization: Bearer abc.def.ghi')).toContain("«redacted»");
    expect(redact('"authorization":"Basic Zm9vOmJhcg=="')).toContain("«redacted»");
  });

  it("redacts secret JSON fields", () => {
    expect(redact('{"api_key":"plain123value"}')).toContain("«redacted»");
    expect(redact('{"password":"hunter2hunter2"}')).toContain("«redacted»");
  });
});

describe("redactDeep", () => {
  it("drops secret-bearing keys and recurses", () => {
    const out = redactDeep({
      ok: true,
      token: "abc",
      nested: { api_key: "xyz", note: "fine" },
      list: ["sk-1234567890abcd"],
    }) as Record<string, unknown>;
    expect(out.token).toBe("«redacted»");
    expect((out.nested as Record<string, unknown>).api_key).toBe("«redacted»");
    expect((out.nested as Record<string, unknown>).note).toBe("fine");
    expect((out.list as string[])[0]).toContain("«redacted»");
  });
});

describe("redactHeaders", () => {
  it("masks authorization/api-key/cookie headers", () => {
    const out = redactHeaders({ Authorization: "Bearer x", "X-API-Key": "y", Accept: "application/json" });
    expect(out.Authorization).toBe("«redacted»");
    expect(out["X-API-Key"]).toBe("«redacted»");
    expect(out.Accept).toBe("application/json");
  });
});
